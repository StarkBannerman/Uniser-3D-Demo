/**
 * The simulated clock.
 *
 * This is the demo's spine. One scrubber drives circadian colour, daylight
 * harvesting, solar generation, occupancy patterns and dusk schedules at the
 * same time — which is what demonstrates *automation* rather than *remote
 * control*, and remote control is all a client thinks they're buying until they
 * see this.
 */

import type { SpaceEnvironment } from "./types";
import { clamp, lerp, sunElevation01 } from "./photometry";

export const MINUTES_PER_DAY = 1440;

/** Speed presets for the scrubber, in simulated minutes per real second. */
export const CLOCK_RATES = [
  { label: "Paused", value: 0 },
  { label: "1×", value: 1 / 60 },
  { label: "Fast", value: 4 },
  { label: "Day in 60s", value: MINUTES_PER_DAY / 60 },
] as const;

export function wrapMinutes(minutes: number): number {
  return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

export function formatClock(minutes: number): string {
  const m = Math.floor(wrapMinutes(minutes));
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${suffix}`;
}

export function parseHour(hour: number, minute = 0): number {
  return wrapMinutes(hour * 60 + minute);
}

/** Resolves a schedule rule's trigger time to minutes past midnight. */
export function resolveScheduleTime(
  at: number | "dawn" | "dusk",
  env: SpaceEnvironment,
): number {
  if (at === "dawn") return env.sunriseMin;
  if (at === "dusk") return env.sunsetMin;
  return wrapMinutes(at);
}

/**
 * Outdoor temperature across the day. Peaks mid-afternoon rather than at solar
 * noon, because thermal mass lags insolation by a couple of hours — the same
 * reason an HVAC system's hardest hour is 3pm, not 12pm.
 */
export function outdoorTemperature(
  minutes: number,
  env: SpaceEnvironment,
): number {
  const peakMin = lerp(env.sunriseMin, env.sunsetMin, 0.62);
  const phase = Math.cos(((wrapMinutes(minutes) - peakMin) / MINUTES_PER_DAY) * 2 * Math.PI);
  const t = (phase + 1) / 2;
  return lerp(env.outdoorMinC, env.outdoorMaxC, t);
}

/**
 * Photovoltaic output in watts. Irradiance tracks sun elevation slightly
 * super-linearly; 0.8 folds in inverter, wiring and temperature derating.
 */
export function solarGenerationW(
  minutes: number,
  env: SpaceEnvironment,
  kwp: number,
): number {
  const elevation = sunElevation01(minutes, env.sunriseMin, env.sunsetMin);
  return kwp * 1000 * Math.pow(clamp(elevation, 0, 1), 1.15) * 0.8;
}

/** True when `target` falls inside the interval advanced through this tick. */
export function crossedTime(
  prevMin: number,
  nextMin: number,
  target: number,
): boolean {
  const p = wrapMinutes(prevMin);
  const n = wrapMinutes(nextMin);
  const t = wrapMinutes(target);
  if (p === n) return false;
  // Normal forward interval.
  if (p < n) return t > p && t <= n;
  // The tick wrapped past midnight.
  return t > p || t <= n;
}
