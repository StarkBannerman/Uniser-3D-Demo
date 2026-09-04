/**
 * Headless verification of the simulation engine.
 *
 * Overrides performance.now() with a virtual clock so the store's real-time
 * throttles (rules at 220ms, sensors at 100ms) actually advance, then drives
 * tick() directly. Lets us check the physics and the rules without a browser.
 */

let virtualNow = 0;
// @ts-expect-error - replacing the host timer with a controllable one
globalThis.performance = { now: () => virtualNow };

import {
  glowAlpha,
  lightOutput,
  cctToRgb,
  roomIllumination,
  shadeTransmission,
  sunElevation01,
  daylightLux,
} from "../lib/sim/photometry";
import { cctAt } from "../lib/sim/automation";
import type { CircadianRule, LightState, ShadeState, ClimateState } from "../lib/sim/types";
import { crossedTime, formatClock } from "../lib/sim/clock";
import { savings } from "../lib/sim/energy";
import { useSim } from "../lib/sim/store";
import { livingRoom } from "../lib/spaces/residential/living-room";

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  const mark = ok ? "PASS" : "FAIL";
  if (!ok) failures++;
  console.log(`  [${mark}] ${name} — ${detail}`);
}

const store = useSim;
const FRAME = 16.7;

/** Advance the simulation by n frames of virtual real time. */
function run(frames: number) {
  for (let i = 0; i < frames; i++) {
    virtualNow += FRAME;
    store.getState().tick(FRAME);
  }
}

function lightOf(id: string) {
  return store.getState().states[id] as { on: boolean; level: number; cct: number };
}
function sensorOf(id: string) {
  return (store.getState().states[id] as { value: number }).value;
}

/* ================================================================== */
console.log("\n1. Dimming curve — must be perceptual, not linear\n");

check(
  "glowAlpha(50) is near-half, not quarter",
  glowAlpha(50) > 0.48 && glowAlpha(50) < 0.58,
  `glowAlpha(50)=${glowAlpha(50).toFixed(3)} (linear-light would be ${lightOutput(50).toFixed(3)})`,
);
check(
  "physical output is square-law",
  Math.abs(lightOutput(50) - 0.25) < 1e-9,
  `lightOutput(50)=${lightOutput(50).toFixed(3)}`,
);
let monotonic = true;
for (let l = 1; l <= 100; l++) if (glowAlpha(l) <= glowAlpha(l - 1)) monotonic = false;
check("glowAlpha is strictly monotonic 0..100", monotonic, "no plateaus or inversions");
check(
  "low end retains resolution",
  glowAlpha(4) > 0.03 && glowAlpha(8) > 0.06,
  `4%→${glowAlpha(4).toFixed(3)}, 8%→${glowAlpha(8).toFixed(3)}`,
);

/* ================================================================== */
console.log("\n2. Colour temperature — blackbody locus\n");

const k2200 = cctToRgb(2200);
const k6500 = cctToRgb(6500);
check(
  "2200K is amber (R > G > B)",
  k2200[0] > k2200[1] && k2200[1] > k2200[2],
  `rgb(${k2200.map((v) => Math.round(v)).join(",")})`,
);
check(
  "6500K is near-neutral cool",
  Math.abs(k6500[0] - k6500[2]) < 45 && k6500[2] >= k6500[0] - 45,
  `rgb(${k6500.map((v) => Math.round(v)).join(",")})`,
);

/* ================================================================== */
console.log("\n3. Shade transmission — dual track must multiply\n");

const sheerOnly = shadeTransmission(100, 0);
const blackoutOnly = shadeTransmission(0, 100);
const both = shadeTransmission(100, 100);
check(
  "both layers darker than either alone",
  both < blackoutOnly && both < sheerOnly,
  `sheer=${sheerOnly.toFixed(3)}, blackout=${blackoutOnly.toFixed(3)}, both=${both.toFixed(4)}`,
);
check("fully open passes everything", shadeTransmission(0, 0) === 1, "1.000");

/* ================================================================== */
console.log("\n4. Circadian curve interpolation\n");

const circadianRule = livingRoom.rules.find(
  (r): r is CircadianRule => r.kind === "circadian",
);
if (!circadianRule) throw new Error("living room has no circadian rule");
const curve = circadianRule.curve;

check("midnight is warm", Math.abs(cctAt(curve, 0) - 2200) < 1, `${cctAt(curve, 0).toFixed(0)}K`);
check("noon is cool", Math.abs(cctAt(curve, 720) - 5000) < 1, `${cctAt(curve, 720).toFixed(0)}K`);
check(
  "22:00 is warm again",
  cctAt(curve, 1320) < 2800,
  `${cctAt(curve, 1320).toFixed(0)}K`,
);
check(
  "wraps across midnight without a jump",
  Math.abs(cctAt(curve, 1439) - cctAt(curve, 0)) < 60,
  `23:59=${cctAt(curve, 1439).toFixed(0)}K vs 00:00=${cctAt(curve, 0).toFixed(0)}K`,
);

/* ================================================================== */
console.log("\n5. Schedule trigger crossing\n");

check("fires inside a forward interval", crossedTime(1130, 1140, 1135), "1135 in (1130,1140]");
check("does not fire outside", !crossedTime(1130, 1140, 1150), "1150 not in (1130,1140]");
check("fires across midnight", crossedTime(1435, 5, 1439), "1439 in (1435,5] wrapped");
check("no fire when clock is still", !crossedTime(600, 600, 600), "paused clock");

/* ================================================================== */
console.log("\n6. Movie Night — must be genuinely dark\n");

store.getState().loadSpace(livingRoom);
run(6); // settle the opening scene
store.getState().applyScene("movie-night");
store.getState().setRate(0);
// The lighting fade is 2.6s but the curtain motor takes a full 9s, and travel
// time is a property of the motor that a scene cannot shorten. Wait for the
// slowest thing in the scene, not the fastest.
run(620);

const cove = lightOf("lr-cove");
const lux = sensorOf("lr-lux");
const illum = roomIllumination(lux, livingRoom.environment.designLux);

check("cove landed on its 8% target", Math.abs(cove.level - 8) < 0.6, `level=${cove.level.toFixed(2)}%`);
check("cove went amber", Math.abs(cove.cct - 2300) < 60, `${cove.cct.toFixed(0)}K`);
check("downlights are off", !lightOf("lr-downlights").on, "off");
check(
  "room is dim but not black",
  illum > 0.15 && illum < 0.45,
  `${lux.toFixed(1)} lux → illumination ${illum.toFixed(3)}`,
);
check(
  "curtains fully closed",
  (store.getState().states["lr-curtain"] as ShadeState).blackout > 99,
  `blackout=${(store.getState().states["lr-curtain"] as ShadeState).blackout.toFixed(1)}%`,
);

/* ================================================================== */
console.log("\n7. Daylight harvesting must NOT fight a night scene\n");

// Still Movie Night, clock at 19:00 (dark). The loop sees ~8 lux against a
// 300 lux target and must refuse to raise the house lights.
store.getState().setClock(19 * 60);
run(400);
const coveAfter = lightOf("lr-cove");
check(
  "cove stayed at 8% despite a 292 lux shortfall",
  coveAfter.level < 9,
  `level=${coveAfter.level.toFixed(2)}% (commanded ceiling ${store.getState().commanded["lr-cove"]})`,
);

/* ================================================================== */
console.log("\n8. Daylight harvesting must trim at noon\n");

store.getState().applyScene("daylight");
run(200);
const beforeTrim = lightOf("lr-downlights").level;
store.getState().setClock(12 * 60);
run(900); // ~15s of virtual real time for the P-loop to converge
const afterTrim = lightOf("lr-downlights");
const noonLux = sensorOf("lr-lux");

check(
  "downlights trimmed down from their commanded 80%",
  afterTrim.level < beforeTrim - 10,
  `${beforeTrim.toFixed(1)}% → ${afterTrim.level.toFixed(1)}%`,
);
check("daylight is actually present at noon", noonLux > 200, `${noonLux.toFixed(0)} lux`);

// And with the rule disabled it must climb back to the commanded level.
store.getState().toggleRule("daylight-harvest");
store.getState().applyScene("daylight");
run(400);
check(
  "with harvesting off, fixtures return to full commanded output",
  lightOf("lr-downlights").level > 75,
  `level=${lightOf("lr-downlights").level.toFixed(1)}%`,
);
store.getState().toggleRule("daylight-harvest");

/* ================================================================== */
console.log("\n9. Occupancy vacancy timeout\n");

store.getState().loadSpace(livingRoom);
run(6);
store.getState().applyScene("welcome-home");
run(120);
check("lights on while occupied", lightOf("lr-downlights").on, "downlights on");

store.getState().patch("lr-occ", { value: 0 });
// 15 minute hold. Run the clock fast enough to cross it.
// 15 simulated minutes at 24 sim-min per real second is 37s of simulated time,
// which is ~38 frames. The earlier 2400 frames advanced the clock sixteen HOURS
// into a bright morning, where daylight harvesting then correctly switched the
// lights off — a real behaviour, but not the one under test here.
// The 15-minute hold clears after ~38 frames at this rate; the onVacant fade
// is then a further 3s. Sample after both, not between them.
store.getState().setRate(24);
run(300);
const afterVacant = lightOf("lr-downlights");
check(
  "downlights shut down after the 15 min hold",
  !afterVacant.on || afterVacant.level < 1,
  `on=${afterVacant.on} level=${afterVacant.level.toFixed(2)}`,
);
check(
  "air conditioning shut down too",
  !(store.getState().states["lr-ac"] as ClimateState).on,
  "AC off",
);
const vacancyEvent = store.getState().events.find((e) => e.ruleId === "occupancy-off");
check("event logged for the client to see", Boolean(vacancyEvent), vacancyEvent?.message ?? "none");

// Re-occupy.
store.getState().patch("lr-occ", { value: 1 });
run(200);
check(
  "lights restored on re-entry",
  lightOf("lr-downlights").on,
  `level=${lightOf("lr-downlights").level.toFixed(1)}%`,
);

/* ================================================================== */
console.log("\n10. Energy over a full simulated day\n");

store.getState().loadSpace(livingRoom);
run(6);
store.getState().applyScene("welcome-home");
store.getState().setClock(0);
store.getState().setRate(24); // day in 60s
run(3700); // ~62s virtual = just over 24 simulated hours

const totals = store.getState().totals;
const result = savings(totals, livingRoom.tariffPerKwh);

check("a full day accumulated", totals.hours >= 24, `${totals.hours.toFixed(2)} h`);
check("actual consumption is positive", totals.actualKwh > 0, `${totals.actualKwh.toFixed(2)} kWh`);
check(
  "conventional baseline exceeds actual",
  totals.baselineKwh > totals.actualKwh,
  `baseline ${totals.baselineKwh.toFixed(2)} vs actual ${totals.actualKwh.toFixed(2)} kWh`,
);
check("LED saving is positive", result.ledKwh > 0, `${result.ledKwh.toFixed(2)} kWh`);
check("solar generated", totals.solarKwh > 0, `${totals.solarKwh.toFixed(2)} kWh`);
check(
  "automation saving is positive across a full day",
  result.automationKwh > 0,
  `${result.automationKwh.toFixed(2)} kWh`,
);
check(
  "annual figures unlocked after a full day",
  result.annualKwh !== null,
  result.annualKwh ? `${result.annualKwh.toFixed(0)} kWh/yr, ₹${Math.round(result.annualCostSaved!)}` : "still null",
);
check(
  "consumption avoided is a sane fraction of baseline",
  result.fraction > 0 && result.fraction < 1,
  `${(result.fraction * 100).toFixed(1)}% of baseline consumption avoided`,
);

console.log(
  `\n  breakdown: LED ${result.ledKwh.toFixed(2)} | automation ${result.automationKwh.toFixed(2)} | solar ${result.solarKwh.toFixed(2)} kWh`,
);

/* ================================================================== */
console.log("\n11. Solar and daylight track the sun\n");

const env = livingRoom.environment;
check(
  "no daylight before sunrise",
  daylightLux(sunElevation01(300, env.sunriseMin, env.sunsetMin), env.outdoorPeakLux) === 0,
  "05:00 → 0 lux",
);
const noonOutdoor = daylightLux(sunElevation01(760, env.sunriseMin, env.sunsetMin), env.outdoorPeakLux);
check("peak daylight near solar noon", noonOutdoor > 80000, `${Math.round(noonOutdoor)} lux outdoors`);
check(
  "interior daylight is realistic through glazing",
  noonOutdoor * env.windowFactor > 800 && noonOutdoor * env.windowFactor < 2200,
  `${Math.round(noonOutdoor * env.windowFactor)} lux indoors unshaded`,
);
check(
  "dusk schedule time resolves sensibly",
  formatClock(env.sunsetMin) === "6:55 PM",
  formatClock(env.sunsetMin),
);

/* ================================================================== */
/* ================================================================== */
console.log("\n12. Scene colour must beat circadian tuning\n");

store.getState().loadSpace(livingRoom);
run(6);
store.getState().setClock(19 * 60); // curve wants ~3067K here
store.getState().applyScene("movie-night"); // scene asks for 2300K
run(400);

const lockedCove = lightOf("lr-cove");
check(
  "Movie Night holds 2300K against a curve asking for 3067K",
  Math.abs(lockedCove.cct - 2300) < 60,
  `${lockedCove.cct.toFixed(0)}K (curve wants ${cctAt(curve, 19 * 60).toFixed(0)}K)`,
);
check(
  "the fixture is flagged as scene-owned",
  store.getState().cctLocked["lr-cove"] === true,
  "cctLocked",
);

// Welcome Home names no colour for the cove, so the curve takes it back.
store.getState().applyScene("welcome-home");
run(500);
const releasedCove = lightOf("lr-cove");
check(
  "Welcome Home hands colour back to the curve",
  store.getState().cctLocked["lr-cove"] === false &&
    Math.abs(releasedCove.cct - cctAt(curve, store.getState().clockMin)) < 120,
  `${releasedCove.cct.toFixed(0)}K vs curve ${cctAt(curve, store.getState().clockMin).toFixed(0)}K`,
);

console.log(
  failures === 0
    ? `\n✅  All checks passed.\n`
    : `\n❌  ${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
