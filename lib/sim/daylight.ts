/**
 * How much daylight is actually getting into the space.
 *
 * Hoisted into its own module because three places need the identical number
 * and they must not disagree: the lux sensor, the stage renderer, and the
 * daylight-harvesting rule. When the rule and the renderer each had their own
 * version, the fixtures trimmed to one answer while the room brightened to
 * another.
 */

import type { DeviceState, ShadeDevice, ShadeState, Space } from "./types";
import {
  daylightLux,
  shadeTransmission,
  sunElevation01,
} from "./photometry";

/**
 * Interior illuminance from daylight alone, in lux — excluding every luminaire.
 *
 * Keeping the fixtures out of this is the whole point. Daylight harvesting that
 * reads *total* illuminance is a positive feedback loop: the sensor sees the
 * light the fixtures are producing, counts it toward the target, and the
 * fixtures then chase their own output. At night that loop has no daylight to
 * work with at all and will happily drive a room to full brightness to reach a
 * 300 lux setpoint, which is the exact opposite of harvesting.
 */
export function interiorDaylightLux(
  space: Space,
  states: Record<string, DeviceState>,
  clockMin: number,
): number {
  const env = space.environment;
  const elevation = sunElevation01(clockMin, env.sunriseMin, env.sunsetMin);
  const outdoor = daylightLux(elevation, env.outdoorPeakLux);
  if (outdoor <= 0) return 0;

  const shades = space.devices.filter((d): d is ShadeDevice => d.kind === "shade");
  if (shades.length === 0) return outdoor * env.windowFactor;

  // Average transmission across the space's windows.
  let sum = 0;
  for (const shade of shades) {
    const state = states[shade.id] as ShadeState | undefined;
    sum += state ? shadeTransmission(state.sheer, state.blackout) : 1;
  }
  const transmission = sum / shades.length;

  return outdoor * env.windowFactor * transmission;
}
