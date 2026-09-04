/**
 * The energy and ROI model.
 *
 * Commercial clients do not buy ambiance, they buy a payback period. This model
 * exists so the salesperson can answer "what does this actually save me?" with
 * a number that holds up to a facilities manager's scrutiny.
 *
 * Savings are attributed across two distinct layers, because they are two
 * separate purchase decisions:
 *
 *   baseline   conventional fixtures, conventional AC, lights on through
 *              operating hours whether or not anyone is there
 *   ledOnly    Uniser LED fixtures, but no automation — full output, fixed
 *              setpoint, same operating hours
 *   actual     what the simulated space is really drawing right now
 *
 * baseline - ledOnly is what the hardware saves. ledOnly - actual is what the
 * automation layer saves on top. Presenting one lump sum invites the obvious
 * pushback — "so I'll just change the bulbs" — and this separation answers it.
 */

import type {
  AirState,
  AvState,
  ClimateState,
  Device,
  DeviceState,
  LightState,
  SolarState,
  Space,
} from "./types";
import { clamp } from "./photometry";
import { outdoorTemperature, wrapMinutes } from "./clock";

export interface PowerSnapshot {
  lightingW: number;
  climateW: number;
  avW: number;
  airW: number;
  otherW: number;
  totalW: number;
  baselineW: number;
  ledOnlyW: number;
  solarW: number;
  /** Net import from the grid; solar can cover the whole load. */
  gridW: number;
}

export interface EnergyTotals {
  actualKwh: number;
  ledOnlyKwh: number;
  baselineKwh: number;
  solarKwh: number;
  gridKwh: number;
  /** Simulated hours elapsed since the space was loaded or reset. */
  hours: number;
}

export const zeroTotals: EnergyTotals = {
  actualKwh: 0,
  ledOnlyKwh: 0,
  baselineKwh: 0,
  solarKwh: 0,
  gridKwh: 0,
  hours: 0,
};

/**
 * LED driver power against dimmer level.
 *
 * Deliberately *not* the square-law curve used for light output. A constant-
 * current driver's input power is close to linear in dimming level with a fixed
 * overhead — which is why dimming to 50% saves noticeably less than 50% of the
 * energy. Claiming otherwise would inflate the savings figure by a wide margin
 * and is the kind of number that gets caught in due diligence.
 */
const DRIVER_OVERHEAD = 0.09;

function lightPower(fixtures: number, wattsEach: number, state: LightState): number {
  if (!state.on) return 0;
  const s = clamp(state.level / 100, 0, 1);
  return fixtures * wattsEach * (DRIVER_OVERHEAD + (1 - DRIVER_OVERHEAD) * s);
}

/**
 * Compressor load from how far the setpoint is from outdoors. The 0.18 floor is
 * cycling plus the indoor fan, which run even when the space is at temperature.
 */
function climatePower(
  ratedWatts: number,
  state: ClimateState,
  outdoorC: number,
): number {
  if (!state.on) return 0;
  if (state.mode === "fan") return ratedWatts * 0.12;

  const delta =
    state.mode === "heat" ? state.setpointC - outdoorC : outdoorC - state.setpointC;
  const load = clamp(delta / 12, 0.18, 1);
  const fanTrim = state.fan === 0 ? 1 : 0.9 + state.fan * 0.05;
  return ratedWatts * load * fanTrim;
}

function withinOperatingHours(minutes: number, startMin: number, endMin: number): boolean {
  const m = wrapMinutes(minutes);
  const s = wrapMinutes(startMin);
  const e = wrapMinutes(endMin);
  return s <= e ? m >= s && m < e : m >= s || m < e;
}

/** Instantaneous draw of every device, plus the two comparison cases. */
export function powerSnapshot(
  space: Space,
  states: Record<string, DeviceState>,
  minutes: number,
): PowerSnapshot {
  const outdoorC = outdoorTemperature(minutes, space.environment);
  const lightingHours = space.baseline.operatingHours;
  const hvacHours = space.baseline.hvacHours ?? lightingHours;

  const lightsOpen = withinOperatingHours(
    minutes,
    lightingHours.startMin,
    lightingHours.endMin,
  );
  const hvacOpen = withinOperatingHours(
    minutes,
    hvacHours.startMin,
    hvacHours.endMin,
  );

  let lightingW = 0;
  let climateW = 0;
  let avW = 0;
  let airW = 0;
  let otherW = 0;
  let solarW = 0;

  // The "LED fixtures, no automation" case: every fixture at full output and
  // every AC at a fixed setpoint, through operating hours.
  let ledOnlyLightingW = 0;
  let ledOnlyClimateW = 0;

  for (const device of space.devices) {
    const state = states[device.id];
    if (!state) continue;

    switch (device.kind) {
      case "light": {
        lightingW += lightPower(device.fixtures, device.wattsEach, state as LightState);
        if (lightsOpen) ledOnlyLightingW += device.fixtures * device.wattsEach;
        break;
      }
      case "climate": {
        climateW += climatePower(device.ratedWatts, state as ClimateState, outdoorC);
        if (hvacOpen) ledOnlyClimateW += device.ratedWatts * 0.75;
        break;
      }
      case "av": {
        // Standby draw is real and worth being honest about.
        avW += (state as AvState).on ? device.ratedWatts : 2;
        break;
      }
      case "air": {
        const s = state as AirState;
        airW += s.on ? device.ratedWatts * (0.4 + 0.2 * clamp(s.speed, 0, 3)) : 0;
        break;
      }
      case "solar": {
        solarW += (state as SolarState).generationW;
        break;
      }
      case "lock":
      case "sensor":
        // Battery or PoE trickle; counted so the total is not misleadingly tidy.
        otherW += 0.5;
        break;
      case "shade":
        // Motors only draw while travelling, for a few seconds a day. Genuinely
        // negligible against everything else here, so it is left out rather
        // than modelled badly.
        break;
    }
  }

  const totalW = lightingW + climateW + avW + airW + otherW;
  const baselineW =
    (lightsOpen ? space.baseline.lightingWatts : 0) +
    (hvacOpen ? space.baseline.hvacWatts : 0);
  const ledOnlyW = ledOnlyLightingW + ledOnlyClimateW + avW + airW + otherW;

  return {
    lightingW,
    climateW,
    avW,
    airW,
    otherW,
    totalW,
    baselineW,
    ledOnlyW,
    solarW,
    gridW: Math.max(0, totalW - solarW),
  };
}

/** Integrate a snapshot over a slice of simulated time. */
export function accumulate(
  totals: EnergyTotals,
  snapshot: PowerSnapshot,
  simMinutes: number,
): EnergyTotals {
  const hours = simMinutes / 60;
  const kwh = (w: number) => (w * hours) / 1000;
  return {
    actualKwh: totals.actualKwh + kwh(snapshot.totalW),
    ledOnlyKwh: totals.ledOnlyKwh + kwh(snapshot.ledOnlyW),
    baselineKwh: totals.baselineKwh + kwh(snapshot.baselineW),
    solarKwh: totals.solarKwh + kwh(snapshot.solarW),
    gridKwh: totals.gridKwh + kwh(snapshot.gridW),
    hours: totals.hours + hours,
  };
}

export interface SavingsBreakdown {
  /** Saved by the fixtures alone. */
  ledKwh: number;
  /** Saved by dimming, scheduling, occupancy and daylight harvesting. */
  automationKwh: number;
  /** Consumption avoided outright: fixtures plus automation. */
  consumptionSavedKwh: number;
  /** Generated on site rather than bought. Not the same thing as using less. */
  solarKwh: number;
  /** Total kWh not bought from the grid — avoided plus generated. */
  totalKwh: number;
  /**
   * Share of the conventional baseline's *consumption* avoided, 0..1.
   *
   * Solar is deliberately excluded. A 3 kWp array can out-generate a small
   * space's entire baseline, which made a combined figure read as "148% saved"
   * — true in cash terms, nonsense as an efficiency claim, and the sort of
   * number that discredits everything next to it.
   */
  fraction: number;
  /** Fraction of what the space actually used that solar covered, 0..1+. */
  solarCoverage: number;
  costSaved: number;
  /** Extrapolated from the simulated period. Null until enough time has run. */
  annualKwh: number | null;
  annualCostSaved: number | null;
}

const HOURS_PER_YEAR = 8760;

/**
 * Turn the integrals into the numbers the panel shows.
 *
 * Nothing is clamped to look good. Run the clock through the small hours with
 * the AC on and the automation figure will legitimately go negative — a
 * conventional space is off then, so there is nothing to beat. Extrapolating a
 * partial day would compound that distortion, so the annual figures stay null
 * until a full simulated day has elapsed.
 */
export function savings(totals: EnergyTotals, tariffPerKwh: number): SavingsBreakdown {
  const ledKwh = totals.baselineKwh - totals.ledOnlyKwh;
  const automationKwh = totals.ledOnlyKwh - totals.actualKwh;
  const consumptionSavedKwh = ledKwh + automationKwh;
  const totalKwh = consumptionSavedKwh + totals.solarKwh;

  const fraction =
    totals.baselineKwh > 0 ? consumptionSavedKwh / totals.baselineKwh : 0;
  const solarCoverage =
    totals.actualKwh > 0 ? totals.solarKwh / totals.actualKwh : 0;

  const fullDay = totals.hours >= 24;
  const scale = totals.hours > 0 ? HOURS_PER_YEAR / totals.hours : 0;

  return {
    ledKwh,
    automationKwh,
    consumptionSavedKwh,
    solarKwh: totals.solarKwh,
    totalKwh,
    fraction,
    solarCoverage,
    costSaved: totalKwh * tariffPerKwh,
    annualKwh: fullDay ? totalKwh * scale : null,
    annualCostSaved: fullDay ? totalKwh * scale * tariffPerKwh : null,
  };
}

export function formatKwh(kwh: number): string {
  const abs = Math.abs(kwh);
  if (abs >= 1000) return `${(kwh / 1000).toFixed(1)} MWh`;
  if (abs >= 10) return `${kwh.toFixed(0)} kWh`;
  if (abs >= 1) return `${kwh.toFixed(1)} kWh`;
  return `${(kwh * 1000).toFixed(0)} Wh`;
}

export function formatWatts(w: number): string {
  return w >= 1000 ? `${(w / 1000).toFixed(2)} kW` : `${Math.round(w)} W`;
}
