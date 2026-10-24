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
import type {
  CircadianRule,
  ClimateState,
  LightState,
  ShadeState,
  Space,
} from "../lib/sim/types";
import { crossedTime, formatClock } from "../lib/sim/clock";
import { savings } from "../lib/sim/energy";
import { useSim } from "../lib/sim/store";
// The illustrated living room, not the 3D one. Sections 6-10 exercise its
// `lr-*` devices and scenes; the 3D rooms are covered structurally in §13.
import { livingRoomIllustrated as livingRoom } from "../lib/spaces/residential/living-room-illustrated";
import { spaces } from "../lib/spaces";
import { masterBedroom } from "../lib/spaces/residential/master-bedroom";
import { bladeRadPerSec, MAX_BLADE_STEP_RAD } from "../lib/sim/fan";
import { paceFade, paceHold } from "../lib/sim/pace";
import { classifyRenderer, isSoftware } from "../lib/device";
import { sceneIcon } from "../components/keypad/sceneIcon";
import { curtainWindow, project } from "../components/stage/plates/window";
import { readFileSync } from "node:fs";

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

/* ================================================================== */
console.log("\n13. Every space is structurally sound\n");

/**
 * Catches the class of mistake that is invisible to TypeScript: a scene or rule
 * naming a device id that does not exist. The config typechecks perfectly —
 * device ids are just strings — and the space then silently does nothing when
 * that button is pressed.
 */
for (const space of spaces) {
  const ids = new Set(space.devices.map((d) => d.id));
  const bad: string[] = [];

  for (const scene of space.scenes) {
    for (const deviceId of Object.keys(scene.targets)) {
      if (deviceId.startsWith("@")) continue;
      if (!ids.has(deviceId)) bad.push(`scene "${scene.id}" -> ${deviceId}`);
    }
    // A staged scene's later stages are just as easy to typo, and a broken one
    // fails silently several seconds after the button is pressed — which is the
    // worst possible moment to find out.
    for (const [i, step] of (scene.steps ?? []).entries()) {
      for (const deviceId of Object.keys(step.targets)) {
        // `@selected` / `@others` stand for the space's selection group and
        // are expanded to real ids when the scene is applied.
        if (deviceId.startsWith("@")) continue;
        if (!ids.has(deviceId)) {
          bad.push(`scene "${scene.id}" step ${i} -> ${deviceId}`);
        }
      }
    }
  }
  for (const rule of space.rules) {
    const referenced: string[] = [];
    if (rule.kind === "occupancy") {
      referenced.push(rule.sensorId, ...Object.keys(rule.onOccupied), ...Object.keys(rule.onVacant));
    } else if (rule.kind === "daylight" || rule.kind === "circadian") {
      referenced.push(...rule.deviceIds);
    } else if (rule.kind === "schedule") {
      referenced.push(...Object.keys(rule.targets));
    }
    for (const deviceId of referenced) {
      if (!ids.has(deviceId)) bad.push(`rule "${rule.id}" -> ${deviceId}`);
    }
  }
  for (const deviceId of Object.keys(space.defaults)) {
    if (!ids.has(deviceId)) bad.push(`defaults -> ${deviceId}`);
  }
  if (space.openingSceneId && !space.scenes.some((sc) => sc.id === space.openingSceneId)) {
    bad.push(`openingSceneId "${space.openingSceneId}" has no scene`);
  }

  /**
   * No two scenes may wear the same icon on the pad.
   *
   * This has gone wrong in three rooms now, and always the same way: the
   * scene's `icon` is a glyph the author chose, `sceneIcon` maps it to one
   * of eighteen drawings, and a glyph nobody added to that map falls
   * through to "dim". Two scenes then look identical on a pad whose whole
   * job is to be read at a glance, and nothing anywhere complains. A scene
   * pad with a duplicate on it is a broken scene pad, so it is a failure.
   */
  const icons = new Map<string, string>();
  for (const scene of space.scenes) {
    const drawn = sceneIcon(scene);
    const already = icons.get(drawn);
    if (already) bad.push(`scenes "${already}" and "${scene.id}" both draw "${drawn}"`);
    else icons.set(drawn, scene.id);
  }

  check(
    `${space.id}: every referenced device exists`,
    bad.length === 0,
    bad.length ? bad.slice(0, 4).join(" | ") : `${ids.size} devices, ${space.scenes.length} scenes, ${space.rules.length} rules`,
  );

  check(
    `${space.id}: 3D spaces name a model`,
    space.renderer !== "3d" || Boolean(space.model),
    space.renderer === "3d" ? `model=${space.model}` : "not a 3D space",
  );
}

/* ================================================================== */
console.log("\n14. Staged scenes — ordering, timing and cancellation\n");

/**
 * A purpose-built space rather than a real one.
 *
 * The engine's staging behaviour should be provable without depending on how a
 * particular room happens to be authored today — and a synthetic space lets the
 * stages be 400ms apart and the fades zero, so a failure points at the scheduler
 * instead of at a fade that had not finished yet.
 */
const stagedSpace: Space = {
  id: "test-staged",
  name: "Staged Scene Test",
  segment: "residential",
  category: "Test",
  blurb: "Synthetic space used only by the verification harness.",
  renderer: "illustrated",
  unlisted: true,
  zones: [{ id: "t-zone", name: "Test", areaM2: 20 }],
  devices: [
    {
      id: "t-general",
      kind: "light",
      name: "General",
      zoneId: "t-zone",
      productId: "proplus-downlight",
      subsystem: "lighting",
      dimmable: true,
      fixtures: 4,
      wattsEach: 9,
      lumensEach: 800,
      glow: [],
    },
    {
      id: "t-bedside",
      kind: "light",
      name: "Bedside",
      zoneId: "t-zone",
      productId: "proplus-downlight",
      subsystem: "lighting",
      dimmable: true,
      fixtures: 2,
      wattsEach: 5,
      lumensEach: 300,
      glow: [],
    },
    {
      id: "t-curtain",
      kind: "shade",
      name: "Curtain",
      zoneId: "t-zone",
      productId: "uniser-curtain-track",
      subsystem: "shades",
      layers: ["blackout"],
      watts: 40,
      travelMs: 600,
      window: { x: 0, y: 0, w: 1, h: 1 },
    },
    {
      id: "t-ac",
      kind: "climate",
      name: "AC",
      zoneId: "t-zone",
      productId: "sensibo-airbend",
      subsystem: "climate",
      minC: 16,
      maxC: 30,
      ratedWatts: 1500,
    },
  ],
  scenes: [
    {
      id: "t-on",
      name: "On",
      icon: "☀",
      blurb: "Plain scene, no stages.",
      fadeMs: 0,
      targets: {
        "t-general": { on: true, level: 80 },
        "t-bedside": { on: true, level: 80 },
      },
    },
    {
      id: "t-goodnight",
      name: "Good Night",
      icon: "☾",
      blurb: "Five stages, 400ms apart.",
      fadeMs: 0,
      targets: {
        "t-general": { on: true, level: 80 },
        "t-bedside": { on: true, level: 80 },
      },
      steps: [
        { label: "General dims", holdMs: 400, targets: { "t-general": { level: 30 } } },
        { label: "Bedside reduces", holdMs: 400, targets: { "t-bedside": { level: 10 } } },
        { label: "Curtains close", holdMs: 400, targets: { "t-curtain": { blackout: 100 } } },
        { label: "AC to sleep", holdMs: 400, targets: { "t-ac": { on: true, setpointC: 22 } } },
        {
          label: "Lights off",
          holdMs: 400,
          targets: { "t-general": { on: false }, "t-bedside": { on: false } },
        },
      ],
    },
  ],
  rules: [],
  defaults: { "t-curtain": { blackout: 0 } },
  environment: {
    sunriseMin: 6 * 60 + 20,
    sunsetMin: 18 * 60 + 55,
    outdoorPeakLux: 95000,
    windowFactor: 0.008,
    designLux: 200,
    outdoorMinC: 26,
    outdoorMaxC: 34,
  },
  baseline: {
    lightingWatts: 300,
    hvacWatts: 1500,
    operatingHours: { startMin: 18 * 60, endMin: 23 * 60 },
    note: "Synthetic.",
  },
  tariffPerKwh: 11,
  currency: "₹",
};

/** Advance by wall-clock milliseconds rather than a frame count. */
function runMs(ms: number) {
  run(Math.ceil(ms / FRAME));
}

/**
 * The holds are authored at 400 ms and the engine plays them at `PACE.hold`,
 * so every wait below is expressed as a fraction of the *paced* hold rather
 * than as a wall-clock figure. The question these checks ask — does a stage
 * fire before its pause has elapsed? — is about ordering, and it should not
 * need rewriting every time the demo is dialled faster or slower.
 */
const HOLD = paceHold(400);

store.getState().loadSpace(stagedSpace);
store.getState().applyScene("t-goodnight");

check(
  "stage zero lands immediately, the rest wait",
  lightOf("t-general").level === 80 && lightOf("t-bedside").level === 80,
  `general=${lightOf("t-general").level}, bedside=${lightOf("t-bedside").level}`,
);
check(
  "the sequence is reported before any stage has run",
  store.getState().sequence?.total === 5 && store.getState().sequence?.step === 0,
  JSON.stringify(store.getState().sequence),
);

// Two thirds of the way through the first hold: nothing should have moved.
runMs(HOLD * 0.6);
check(
  "a stage does not fire early",
  lightOf("t-general").level === 80,
  `at ${Math.round(HOLD * 0.6)}ms of a ${HOLD}ms hold, general=${lightOf("t-general").level}`,
);

runMs(HOLD * 0.7); // now past the hold
check(
  "stage 1 fires on time, and only stage 1",
  lightOf("t-general").level === 30 && lightOf("t-bedside").level === 80,
  `general=${lightOf("t-general").level}, bedside=${lightOf("t-bedside").level}`,
);
check(
  "the reported stage advances with its label",
  store.getState().sequence?.step === 1 &&
    store.getState().sequence?.label === "General dims",
  JSON.stringify(store.getState().sequence),
);

runMs(HOLD);
check(
  "stage 2 follows, still in order",
  lightOf("t-bedside").level === 10 &&
    (store.getState().states["t-curtain"] as ShadeState).blackout === 0,
  `bedside=${lightOf("t-bedside").level}, curtain untouched`,
);

// Past the remaining three stages, plus the curtain's own travel time — and
// that travel is *not* paced, so it stays a wall-clock figure.
runMs(HOLD * 3 + 800);
const acEnd = store.getState().states["t-ac"] as ClimateState;
check(
  "every stage has run by the end",
  (store.getState().states["t-curtain"] as ShadeState).blackout === 100 &&
    acEnd.on &&
    acEnd.setpointC === 22 &&
    !lightOf("t-general").on &&
    !lightOf("t-bedside").on,
  `curtain=100, ac=${acEnd.setpointC}°C, lights off`,
);
check(
  "the sequence clears when it finishes",
  store.getState().sequence === null,
  "sequence=null",
);

// Cancellation 1: another scene pressed mid-sequence.
store.getState().loadSpace(stagedSpace);
store.getState().applyScene("t-goodnight");
runMs(HOLD * 1.5); // stage 1 has fired, stage 2 has not
store.getState().applyScene("t-on");
runMs(3000);
check(
  "pressing another scene abandons the sequence",
  store.getState().sequence === null &&
    lightOf("t-general").level === 80 &&
    lightOf("t-bedside").level === 80 &&
    (store.getState().states["t-curtain"] as ShadeState).blackout === 0,
  "no later stage fired after the interruption",
);

// Cancellation 2: a manual control touched mid-sequence.
store.getState().loadSpace(stagedSpace);
store.getState().applyScene("t-goodnight");
runMs(HOLD * 1.5);
store.getState().patch("t-general", { level: 55 }, 0);
runMs(3000);
check(
  "touching a control by hand abandons the sequence",
  store.getState().sequence === null &&
    lightOf("t-general").level === 55 &&
    lightOf("t-bedside").level === 80 &&
    !(store.getState().states["t-ac"] as ClimateState).on,
  `general=${lightOf("t-general").level} held, no later stage fired`,
);

// A scene without `steps` must behave exactly as it always has.
store.getState().loadSpace(stagedSpace);
store.getState().applyScene("t-on");
runMs(2000);
check(
  "a scene with no stages arms nothing",
  store.getState().sequence === null && lightOf("t-general").level === 80,
  "unstaged scenes are unaffected",
);

/* ================================================================== */
console.log("\n15. A scene named after an hour arrives at that hour\n");

store.getState().loadSpace(masterBedroom);
store.getState().setClock(19 * 60 + 20);
store.getState().applyScene("morning");
check(
  "Morning moves the clock to the morning",
  Math.abs(store.getState().clockMin - (7 * 60 + 30)) < 1,
  `${formatClock(store.getState().clockMin)}`,
);

// A mood scene must leave the clock alone, or the circadian demonstration —
// the same button cool at breakfast and warm at bedtime — has nothing to stand
// on.
store.getState().setClock(14 * 60);
store.getState().applyScene("relax");
run(30);
check(
  "Relax leaves the clock where the presenter put it",
  Math.abs(store.getState().clockMin - 14 * 60) < 1,
  `${formatClock(store.getState().clockMin)}`,
);

// Jumping the clock must not fire every schedule rule between here and there.
store.getState().setClock(2 * 60);
const eventsBefore = store.getState().events.length;
store.getState().applyScene("night");
run(60);
check(
  "the jump does not replay the rules it skipped over",
  store.getState().events.length - eventsBefore <= 1,
  `${store.getState().events.length - eventsBefore} event(s) logged`,
);

/* ================================================================== */
console.log("\n16. Input locks while a press plays out, and unlocks after\n");

store.getState().loadSpace(masterBedroom);
check(
  "nothing is locked at rest",
  store.getState().busy === false && store.getState().busyDevices.length === 0,
  `busy=${store.getState().busy} after load`,
);

// Good Night is the long one: four stages, a nine-second curtain inside it.
store.getState().applyScene("goodnight");
check(
  "pressing a staged scene locks",
  store.getState().busy === true,
  `busy=${store.getState().busy}`,
);

run(300); // ~5s
check(
  "still locked while the sequence is mid-flight",
  store.getState().busy === true,
  `${(300 * FRAME) / 1000}s in`,
);

run(1200); // ~20s more, past the whole sequence
check(
  "unlocks once the last stage has landed",
  store.getState().busy === false,
  `${(1500 * FRAME) / 1000}s total`,
);

/**
 * The lock must never come from the rule engine.
 *
 * Daylight harvesting and circadian tuning restart fades every couple of
 * hundred milliseconds. If those raised the flag the demo would be unclickable
 * for as long as it was running, which is the failure worth guarding against.
 */
store.getState().setClock(12 * 60);
run(600);
check(
  "rules firing in the background do not lock anything",
  store.getState().busy === false,
  "ten seconds of rule activity, still unlocked",
);

// A colour-temperature drag is instantaneous, so it must not lock at all.
store.getState().patch("bd-cove", { cct: 3000 });
check(
  "a slider drag does not lock",
  store.getState().busy === false && store.getState().busyDevices.length === 0,
  `busy=${store.getState().busy} devices=[${store.getState().busyDevices}]`,
);

/**
 * A curtain locks — but only itself.
 *
 * This is the distinction the two-level lock exists for. The motor runs for
 * nine seconds, and taking the lights, the fan and the thermostat down with it
 * for all nine is what made the interface feel broken rather than merely slow.
 *
 * Open it first: Good Night left the blackout closed, and a patch that changes
 * nothing is correctly not worth locking for.
 */
store.getState().patch("bd-curtain", { blackout: 0 });
run(700);
store.getState().patch("bd-curtain", { blackout: 100 });
check(
  "a curtain press locks the curtain",
  store.getState().busyDevices.includes("bd-curtain"),
  `busyDevices=[${store.getState().busyDevices}]`,
);
check(
  "a curtain press does not lock the room",
  store.getState().busy === false,
  `busy=${store.getState().busy}`,
);
check(
  "every other fixture stays unlocked",
  store.getState().busyDevices.length === 1,
  `only [${store.getState().busyDevices}] is held`,
);

run(200); // ~3.3s of a 9s travel
check(
  "the curtain is still held mid-travel",
  store.getState().busyDevices.includes("bd-curtain"),
  `${(200 * FRAME) / 1000}s into a 9s travel`,
);

// The point of all of it: a light really does answer while the motor runs.
store.getState().patch("bd-cove", { level: 55 });
const coveMidTravel = store.getState().states["bd-cove"] as LightState;
check(
  "a light responds while the curtain is still moving",
  Math.abs(coveMidTravel.level - 55) < 0.01 &&
    store.getState().busyDevices.includes("bd-curtain"),
  `cove at ${coveMidTravel.level.toFixed(1)}%, curtain still held`,
);

run(400); // past it
check(
  "the curtain unlocks when it seats",
  store.getState().busyDevices.length === 0,
  `${(600 * FRAME) / 1000}s total, busyDevices=[${store.getState().busyDevices}]`,
);

/**
 * A scene supersedes anything already moving — and then owns it.
 *
 * This check used to assert that pressing a scene left `busyDevices` empty,
 * which was right while only a hand on a slider could start a motor: any lock
 * surviving the press was stale, and a stale lock leaves a control disabled
 * inside a scene that has already sent it somewhere else.
 *
 * A scene can start a motor now, because the room has to be able to say
 * "closing the blinds" while a scene is doing exactly that. So the guarantee
 * is no longer "no lock" but "no *stale* lock": the hand's lock is dropped,
 * and whatever the scene itself sets travelling is locked afresh and released
 * when it seats. The third case below is the one that actually protects
 * against the original fault — a scene asking a motor for the position it is
 * already in must lock nothing at all.
 */
store.getState().patch("bd-curtain", { blackout: 0 });
check(
  "the curtain is moving again",
  store.getState().busyDevices.includes("bd-curtain"),
  `busyDevices=[${store.getState().busyDevices}]`,
);
store.getState().applyScene("morning");
check(
  "a scene that moves a motor takes the lock over from the hand that had it",
  store.getState().busyDevices.includes("bd-curtain"),
  `busy=${store.getState().busy} devices=[${store.getState().busyDevices}]`,
);
run(900); // let it land, so section 17 starts from rest
check(
  "and releases it once the scene's own travel has seated",
  store.getState().busyDevices.length === 0,
  `devices=[${store.getState().busyDevices}]`,
);
store.getState().applyScene("morning");
check(
  "a scene asking for the position it is already in locks nothing",
  store.getState().busyDevices.length === 0,
  `devices=[${store.getState().busyDevices}]`,
);
run(60);

/* ================================================================== */
console.log("\n17. Fan speed is visibly different at every setting\n");

const fanOn = (speed: number) => ({ on: true, speed, reverse: false });

check(
  "off means stopped",
  bladeRadPerSec({ on: false, speed: 3, reverse: false }, 5) === 0,
  "0 rad/s",
);

const rates = [1, 2, 3, 4, 5].map((n) => bladeRadPerSec(fanOn(n), 5));
let ascending = true;
for (let i = 1; i < rates.length; i++) if (rates[i] <= rates[i - 1]) ascending = false;
check(
  "every step is faster than the one below it",
  ascending,
  rates.map((r) => r.toFixed(1)).join(" → ") + " rad/s",
);

/**
 * The regression this guards. The first version ran 1.6 to 5.0 rad/s — 15 rpm
 * to 48 rpm — and a client could not tell the settings apart, which is the
 * whole point of a five-speed control.
 */
check(
  "top speed is several times the bottom",
  rates[4] / rates[0] >= 3.5,
  `${(rates[4] / rates[0]).toFixed(1)}x from speed 1 to speed 5`,
);
check(
  "the range is a plausible ceiling fan",
  (rates[0] * 60) / (2 * Math.PI) > 20 && (rates[4] * 60) / (2 * Math.PI) < 200,
  `${((rates[0] * 60) / (2 * Math.PI)).toFixed(0)}–${((rates[4] * 60) / (2 * Math.PI)).toFixed(0)} rpm`,
);

// Three blades repeat every 120 degrees, so more than 60 degrees in a frame
// aliases and the fan appears to run backwards.
check(
  "the per-frame cap stays inside the aliasing limit",
  MAX_BLADE_STEP_RAD < Math.PI / 3,
  `${((MAX_BLADE_STEP_RAD * 180) / Math.PI).toFixed(0)}° cap vs 60° limit`,
);
check(
  "a healthy frame rate never hits the cap",
  (rates[4] / 60) < MAX_BLADE_STEP_RAD,
  `${((rates[4] / 60) * (180 / Math.PI)).toFixed(1)}° per frame at 60fps`,
);

/* ------------------------------------------------------------------ */
console.log("\n18. Scenes settle inside the client's two to three seconds");
/*
 * The client's requirement, made into a gate.
 *
 * Fades and the pauses between a staged scene's beats are design and are
 * scaled by `PACE`. Shade and screen travel is not: a blind takes eight and a
 * half seconds because that is how long the motor takes. So this checks the
 * scenes we actually control — the ones that drive nothing but light — and
 * leaves the ones waiting on a motor out of it, because the honest figure
 * there is the motor's, not ours.
 */
{
  type Step = { holdMs?: number; targets: Record<string, Record<string, unknown>> };
  const movesAMotor = (
    space: (typeof spaces)[number],
    targets: Record<string, Record<string, unknown>>,
  ) =>
    Object.entries(targets).some(([id, patch]) => {
      const device = space.devices.find((d) => d.id === id);
      if (!device) return false;
      if (device.kind === "shade") {
        return ["sheer", "blackout"].some((p) => typeof patch[p] === "number");
      }
      return device.kind === "av" && typeof patch.screen === "number";
    });

  const choreography = (scene: (typeof spaces)[number]["scenes"][number]) => {
    const steps = (scene as unknown as { steps?: Step[] }).steps ?? [];
    let total = paceFade(scene.fadeMs ?? 0);
    for (const step of steps) {
      const fades = Object.values(step.targets).map((t) => paceFade(Number(t.fadeMs ?? 0)));
      total += Math.max(paceHold(step.holdMs ?? 0), fades.length ? Math.max(...fades) : 0);
    }
    return total;
  };

  let worstName = "";
  let worst = 0;
  let counted = 0;
  /**
   * Every staged scene, against the client's three seconds.
   *
   * The gate above excuses any scene that so much as mentions a shade, and
   * the lobby's Evening mentions one: it sets `hl-blinds` fully open, which
   * moves nothing when they already are. That was enough to keep a five-beat
   * storyboard out of the budget while it sat at 3.4 s.
   *
   * These five are named rather than inferred, because they are the ones
   * whose beats are a wait FOR the hardware rather than a pause anyone chose.
   * Den's Movie holds 8.4 s on "Screen descends" because a projector aimed at
   * a half-descended screen is not a demo; Good Night waits on a compressor,
   * Focus Work and Presentation on blinds. Compressing those would sell
   * hardware that does not exist, which is the rule `PACE` already follows by
   * leaving `travelMs` alone.
   *
   * Inferring it from "does a step touch a motor" does not work: it excuses
   * the lobby, and it still misses Den, whose longest hold is on a beat that
   * commands nothing and is purely waiting for the beat before it.
   */
  /**
   * Each client's own number, not one of ours.
   *
   * Three seconds is the restaurant requirement doc's figure for its five
   * beats, and it was the only staged scene in the demo when this gate was
   * written. The showroom's brief asks for about four for its Vehicle
   * Presentation, and that is a longer demonstration with a vehicle at the
   * end of it rather than a slower version of the same one. The lobby's
   * Evening asks for six, because it is narrating a whole dusk. So the
   * budget belongs to the space.
   */
  const STAGED_BUDGET_MS = 3000;
  // The hotel room's brief asks for about eight seconds for Guest Arrival,
  // and most of the back half of that is a four-second curtain track that
  // `PACE` deliberately does not compress. Two beats are authored to land
  // while it is still travelling, which is what the brief asks for and what
  // makes the number legitimately larger than the lobby's dusk.
  // The cabin's Meeting is a six-beat demonstration with a four-second
  // blind preset inside it that `PACE` deliberately does not compress,
  // and the brief asks for about ten seconds end to end.
  const SPACE_BUDGET_MS: Record<string, number> = {
    showroom: 4500,
    lobby: 7000,
    room: 8500,
    cabin: 11000,
    // Five beats with a four-second blind preset inside them, which
    // `PACE` deliberately does not compress; the brief asks for eleven
    // seconds end to end.
    office: 12000,
    // Six beats with a four-second blind and a six-second screen inside
    // them, neither of which `PACE` compresses; the brief asks for about
    // fifteen seconds end to end.
    boardroom: 17000,
  };
  const budgetFor = (spaceId: string) => SPACE_BUDGET_MS[spaceId] ?? STAGED_BUDGET_MS;
  const HARDWARE_PACED = new Set([
    "master-bedroom/goodnight",
    "living-room/movie",
    "den/movie",
    "workspace/focus-work",
    "boardroom/presentation",
  ]);
  let choreoWorst = 0;
  let choreoName = "";
  for (const space of spaces) {
    for (const scene of space.scenes) {
      const steps = (scene as unknown as { steps?: Step[] }).steps ?? [];
      const all = [scene.targets as Record<string, Record<string, unknown>>, ...steps.map((s) => s.targets)];
      const total = choreography(scene);
      if (steps.length && !HARDWARE_PACED.has(`${space.id}/${scene.id}`)) {
        // Measured against its own space's budget, so one room's longer
        // demonstration cannot be judged by another room's requirement doc.
        const over = total / budgetFor(space.id);
        if (over > choreoWorst) {
          choreoWorst = over;
          choreoName = `${space.name} / ${scene.name} at ${total}ms of ${budgetFor(space.id)}ms`;
        }
      }
      if (all.some((t) => movesAMotor(space, t))) continue;
      // Staged scenes are held to three seconds below instead. A storyboard
      // is several beats by definition and cannot land in the time a single
      // cross-fade does; holding both to one number would either break the
      // storyboards or make the gate meaningless for everything else.
      if (steps.length) continue;
      counted++;
      if (total > worst) {
        worst = total;
        worstName = `${space.name} / ${scene.name}`;
      }
    }
  }
  check(
    "every light-only scene lands under two seconds",
    worst < 2000,
    `slowest of ${counted} is ${worstName} at ${worst}ms`,
  );
  check(
    "every staged scene lands inside its space's budget",
    choreoWorst < 1,
    choreoName ? `closest is ${choreoName}` : "no staged scenes",
  );
  check(
    "the pace actually compresses the authored timings",
    paceFade(4000) < 1600 && paceHold(2000) < 800,
    `a 4 s fade plays in ${paceFade(4000)}ms, a 2 s hold in ${paceHold(2000)}ms`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n19. The quality tier is chosen from the GPU, not the CPU");
/*
 * This is the one part of the device check that can be tested without the
 * device. The client's report — fine on a Mac, very slow on an HP — is the
 * signature of a machine with plenty of cores and an integrated GPU being
 * handed the full path, so these are the strings that have to come out low.
 */
{
  const weak = [
    "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "ANGLE (Intel, Intel(R) HD Graphics 5500 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "Google SwiftShader",
    "Mali-G52",
    "Adreno (TM) 619",
  ];
  const strong = [
    "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "Apple M2 Pro",
  ];
  const badWeak = weak.filter((r) => classifyRenderer(r) !== "low");
  const badStrong = strong.filter((r) => classifyRenderer(r) !== "high");
  check(
    "integrated and software renderers come out low",
    badWeak.length === 0,
    badWeak.length ? `missed: ${badWeak.join(" | ")}` : `all ${weak.length} classified low`,
  );
  check(
    "discrete and Apple silicon come out high",
    badStrong.length === 0,
    badStrong.length ? `missed: ${badStrong.join(" | ")}` : `all ${strong.length} classified high`,
  );
  const soft = [
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)",
    "Mesa/X.org, llvmpipe (LLVM 15.0.7, 256 bits)",
    "Microsoft Basic Render Driver",
  ];
  const hardware = [
    "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "Apple M2 Pro",
  ];
  check(
    "software rasterisers are recognised as having no GPU",
    soft.every(isSoftware) && !hardware.some(isSoftware),
    `${soft.length} software strings caught, ${hardware.length} hardware ones left alone`,
  );
  check(
    "an unknown renderer defers to the fallback",
    classifyRenderer("Some Unreleased Thing 9000") === null && classifyRenderer("") === null,
    "returns null rather than guessing",
  );
}


/* ================================================================== */
console.log("\n20. The curtain window — the homography the wipe runs on\n");
/*
 * A projective fit is easy to get subtly wrong and impossible to eyeball:
 * a curtain that is a few per cent off along the track still looks like a
 * curtain. So the one thing that can be checked exactly is checked — the
 * four corners of the quad must land on the four corners of the unit
 * square, because every other pixel's position follows from that.
 */
{
  const spec = JSON.parse(
    readFileSync("public/plates/room/hotspots.json", "utf8"),
  ).curtain as { quad: [number, number][]; pad?: number } | undefined;

  check("the room's plate set ships a window quad", Boolean(spec?.quad), spec ? `${spec.quad.length} corners, pad ${spec.pad}` : "missing");

  const w = curtainWindow(spec, { width: 1920, height: 1080 });
  check("it yields a transform", w !== null, w ? `pad ${w.pad}, soft ${w.soft.map((x) => x.toFixed(4)).join(" / ")}` : "null");

  if (w && spec) {
    const want: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    let worst = 0;
    spec.quad.forEach((corner, i) => {
      const [t, sAxis] = project(w.matrix, corner[0], corner[1]);
      worst = Math.max(worst, Math.abs(t - want[i][0]), Math.abs(sAxis - want[i][1]));
    });
    check(
      "every corner lands on its corner of the unit square",
      worst < 1e-9,
      `worst corner is off by ${worst.toExponential(1)}`,
    );

    /**
     * And the fit is actually projective.
     *
     * The opening is a trapezoid on screen — the far jamb is shorter than
     * the near one — so the midpoint of the diagonal must *not* come back
     * at 0.5. An affine fit would put it there, look perfectly reasonable,
     * and make the near panel sprint while the far one crawled.
     */
    const mid = project(
      w.matrix,
      (spec.quad[0][0] + spec.quad[2][0]) / 2,
      (spec.quad[0][1] + spec.quad[2][1]) / 2,
    );
    check(
      "perspective is carried, not flattened",
      Math.abs(mid[0] - 0.5) > 0.02,
      `the diagonal midpoint sits at t ${mid[0].toFixed(3)}, not 0.5`,
    );

    // Soft edges are a few pixels, not a few per cent of the window.
    check(
      "the edge softness is about four pixels",
      w.soft.every((x) => x > 0 && x < 0.02),
      w.soft.map((x) => `${(x * 100).toFixed(2)}%`).join(" / "),
    );
  }

  check(
    "a space with no quad degrades rather than throws",
    curtainWindow(undefined, { width: 1920, height: 1080 }) === null,
    "undefined -> null, so the stage crossfades instead",
  );
  check(
    "a collapsed quad is rejected",
    curtainWindow({ quad: [[0, 0], [0, 0], [0, 0], [0, 0]] }, { width: 1920, height: 1080 }) === null,
    "four coincident corners -> null",
  );
}

console.log(
  failures === 0
    ? `\n✅  All checks passed.\n`
    : `\n❌  ${failures} check(s) failed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
