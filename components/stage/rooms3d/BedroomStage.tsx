"use client";

/**
 * Master Bedroom, driven by the simulation.
 *
 * Every light, the curtains, the fan and the window's day/night state come from
 * the store, so a scene fade, a rule firing, a staged sequence and the rocker
 * all move the room by the same path.
 *
 * Nothing here computes lighting. Levels and colour temperatures arrive already
 * tweened by the engine, and `BedroomLightRig` converts them with the same
 * photometry the lux sensor and energy model use.
 */

import type { FanState, LightState, ShadeState } from "@/lib/sim/types";
import { useSim } from "@/lib/sim/store";
import { roomAmbience } from "@/lib/sim/ambience";
import {
  clamp01,
  daylightLux,
  shadeTransmission,
  sunElevation01,
} from "@/lib/sim/photometry";
import { Stage3D, type CameraSpec } from "../Stage3D";
import { MasterBedroom } from "./MasterBedroom";
import { BedroomLightRig, type BedroomFixtures } from "./BedroomLightRig";

/**
 * Fixed camera.
 *
 * Wide and low, from the back-left corner: a 52° vertical field is roughly a
 * 24mm lens, which is what interior photography actually uses and what the
 * client's own reference images were shot on. It is the only position from
 * which the wardrobe, the bed and the full run of glazing are in one frame —
 * and all three have to be, because each carries a lighting group the
 * requirement asks for.
 *
 * Deliberately not orbitable. A salesperson mid-pitch does not want to discover
 * they have dragged the view into a wall, and a fixed frame is also the one the
 * lighting was tuned against.
 */
const CAMERA: CameraSpec = {
  position: [0.95, 1.52, 5.85],
  target: [5.2, 1.05, 0.9],
  fov: 52,
};

const OFF: LightState = { on: false, level: 0, cct: 3000, hue: 0, sat: 0 };

/**
 * Blade speed, radians per second.
 *
 * A real ceiling fan runs about 100–350 rpm across its range. Rendered at 60fps
 * that strobes badly, so this is deliberately slowed to a rate that reads as
 * "turning, and faster than the last setting" — which is the only thing the
 * viewer needs from it. Honest about being a representation rather than
 * wrong-looking and technically correct.
 */
function bladeSpeed(state: FanState | undefined, speeds: number): number {
  if (!state?.on) return 0;
  return 1.6 + (3.4 * (state.speed - 1)) / Math.max(1, speeds - 1);
}

export function BedroomStage() {
  const states = useSim((s) => s.states);
  const clockMin = useSim((s) => s.clockMin);
  const space = useSim((s) => s.space);

  const light = (id: string): LightState =>
    (states[id] as LightState | undefined) ?? OFF;

  const fixtures: BedroomFixtures = {
    general: light("bd-general"),
    cove: light("bd-cove"),
    bedsideLeft: light("bd-bedside-l"),
    bedsideRight: light("bd-bedside-r"),
    readingLeft: light("bd-reading-l"),
    readingRight: light("bd-reading-r"),
    wardrobe: light("bd-wardrobe"),
    night: light("bd-night"),
  };

  const curtain = (states["bd-curtain"] as ShadeState | undefined) ?? {
    sheer: 0,
    blackout: 0,
  };

  const fanDevice = space?.devices.find((d) => d.id === "bd-fan");
  const fanSpeeds = fanDevice?.kind === "fan" ? fanDevice.speeds : 5;
  const fanSpin = bladeSpeed(states["bd-fan"] as FanState | undefined, fanSpeeds);

  // The view beyond the glazing follows the simulated sun, so scrubbing the
  // clock changes what is outside the window as well as the light inside.
  const env = space?.environment;
  const night = env
    ? sunElevation01(clockMin, env.sunriseMin, env.sunsetMin) <= 0.02
    : true;

  const daylight = env
    ? clamp01(
        daylightLux(
          sunElevation01(clockMin, env.sunriseMin, env.sunsetMin),
          env.outdoorPeakLux,
        ) / 45000,
      )
    : 0;

  // Bounce light, from the same illuminance the sensor and energy model read.
  // A constant fill here is what made every scene look alike.
  const ambient = space
    ? roomAmbience(space, states, clockMin)
    : { level: 0, color: [255, 245, 230] as [number, number, number], lux: 0 };

  return (
    <Stage3D camera={CAMERA} ambient={ambient} bloomIntensity={0.5} bloomThreshold={1.05}>
      <MasterBedroom
        curtains={curtain}
        night={night}
        fanRadiansPerSecond={fanSpin}
      />
      <BedroomLightRig
        fixtures={fixtures}
        daylight={daylight}
        transmission={shadeTransmission(curtain.sheer, curtain.blackout)}
      />
    </Stage3D>
  );
}
