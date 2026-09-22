/**
 * How much bounced light is in the room, and what colour it is.
 *
 * Real-time rendering has no interreflection: a surface not facing a light is
 * black unless something fills it in. Every real-time interior therefore needs a
 * fill term standing in for the light that would have bounced off the floor,
 * ceiling and walls.
 *
 * The trap — and a bug this project shipped for a while — is making that fill a
 * constant. A fixed ambient means switching every fixture off leaves the room
 * clearly visible, dimming barely changes anything, and every scene looks much
 * like every other one. The lighting controls stop mattering, which is fatal for
 * a demo whose entire subject is lighting control.
 *
 * So the fill is derived from the same illuminance the lux sensor and the energy
 * model use: bounce light scales with the light available to bounce.
 */

import type {
  DeviceState,
  LightDevice,
  LightState,
  Space,
} from "./types";
import {
  cctToRgb,
  clamp01,
  daylightCct,
  daylightLux,
  estimateLux,
  lightColor,
  lightOutput,
  sunElevation01,
} from "./photometry";
import { interiorDaylightLux } from "./daylight";

export interface Ambience {
  /** 0..1 fill strength. 0 in a genuinely dark room. */
  level: number;
  /** Chromaticity of the dominant illuminant, 0..255 per channel. */
  color: [number, number, number];
  /** Total illuminance in lux, for anything that wants the raw figure. */
  lux: number;
}

/**
 * Fill strength for a given illuminance, 0..1.
 *
 * Deliberately *not* `roomIllumination`, which is Stevens' power law — how
 * bright a room feels, cube-rooted. That curve is right for driving an
 * illustration's overall exposure and wrong for driving a light: bounced light
 * is close to linear in the flux available to bounce, so a cube root hands a
 * 12-lux reading scene a 43% fill and quietly lights the whole room from
 * nowhere. Using it here made every dark scene look like a dimmed bright one.
 *
 * The exponent is a compromise rather than pure physics. Fully linear fill goes
 * to nothing faster than a real room does, because a real room also has a
 * standing contribution from every surface that is still catching a little
 * light. 0.62 keeps low scenes genuinely dark while leaving a lit room's fill
 * almost where it was.
 */
function bounce(lux: number, designLux: number): number {
  if (designLux <= 0) return 0;
  return clamp01(Math.pow(clamp01(lux / designLux), 0.62));
}

export function roomAmbience(
  space: Space,
  states: Record<string, DeviceState>,
  clockMin: number,
): Ambience {
  const env = space.environment;
  const area = space.zones.reduce((a, z) => a + z.areaM2, 0) || 1;

  let mixR = 0;
  let mixG = 0;
  let mixB = 0;
  let weight = 0;
  const add = (c: [number, number, number], w: number) => {
    if (w <= 0) return;
    mixR += c[0] * w;
    mixG += c[1] * w;
    mixB += c[2] * w;
    weight += w;
  };

  const lights = space.devices.filter((d): d is LightDevice => d.kind === "light");
  const contributions = lights.map((device) => {
    const state = states[device.id] as LightState | undefined;
    const on = state?.on ?? false;
    const level = state?.level ?? 0;
    if (state && on) {
      add(lightColor(state), device.lumensEach * device.fixtures * lightOutput(level));
    }
    return { lumensEach: device.lumensEach, fixtures: device.fixtures, on, level };
  });

  const artificial = estimateLux(contributions, area);
  const daylight = interiorDaylightLux(space, states, clockMin);

  if (daylight > 0) {
    const elevation = sunElevation01(clockMin, env.sunriseMin, env.sunsetMin);
    // Lux back to a lumen-equivalent so daylight competes fairly with fixtures.
    add(cctToRgb(daylightCct(elevation)), (daylight * area) / 0.5);
  }

  const lux = artificial + daylight;

  return {
    level: bounce(lux, env.designLux),
    color:
      weight > 0 ? [mixR / weight, mixG / weight, mixB / weight] : [255, 245, 230],
    lux,
  };
}

export { daylightLux };
