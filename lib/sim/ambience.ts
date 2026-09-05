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
  daylightCct,
  daylightLux,
  estimateLux,
  lightColor,
  lightOutput,
  roomIllumination,
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
    level: roomIllumination(lux, env.designLux),
    color:
      weight > 0 ? [mixR / weight, mixG / weight, mixB / weight] : [255, 245, 230],
    lux,
  };
}

export { daylightLux };
