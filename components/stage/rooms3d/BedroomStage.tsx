"use client";

/**
 * Master Bedroom, driven by the simulation.
 *
 * The look-dev harness fed this scene hardcoded values. This is the real thing:
 * every light, the curtains and the window's day/night state come from the
 * store, so a scene fade, a rule firing, or the rocker all move the room by the
 * same path.
 *
 * Nothing here computes lighting. Levels and colour temperatures arrive already
 * tweened by the engine, and `BedroomLightRig` converts them with the same
 * photometry the lux sensor and energy model use.
 */

import type { LightState, ShadeState } from "@/lib/sim/types";
import { useSim } from "@/lib/sim/store";
import { sunElevation01 } from "@/lib/sim/photometry";
import { Stage3D, type CameraSpec } from "../Stage3D";
import { MasterBedroom } from "./MasterBedroom";
import { BedroomLightRig, type BedroomFixtures } from "./BedroomLightRig";

/**
 * Fixed camera, matched by eye to the reference frame.
 *
 * Deliberately not orbitable. A salesperson mid-pitch does not want to discover
 * they have dragged the view into a wall, and a fixed frame is also the one the
 * lighting was tuned against.
 */
const CAMERA: CameraSpec = {
  position: [1.6, 1.45, 5.9],
  target: [6.3, 1.05, 0.6],
  fov: 44,
};

const OFF: LightState = { on: false, level: 0, cct: 3000, hue: 0, sat: 0 };

export function BedroomStage() {
  const states = useSim((s) => s.states);
  const clockMin = useSim((s) => s.clockMin);
  const space = useSim((s) => s.space);

  const light = (id: string): LightState =>
    (states[id] as LightState | undefined) ?? OFF;

  const fixtures: BedroomFixtures = {
    cove: light("mb-cove"),
    downlights: light("mb-downlights"),
    pendant: light("mb-pendant"),
    accent: light("mb-accent"),
  };

  const curtain = (states["mb-curtain"] as ShadeState | undefined) ?? {
    sheer: 0,
    blackout: 0,
  };

  // The view beyond the glazing follows the simulated sun, so scrubbing the
  // clock changes what is outside the window as well as the light inside.
  const env = space?.environment;
  const night = env
    ? sunElevation01(clockMin, env.sunriseMin, env.sunsetMin) <= 0.02
    : true;

  return (
    <Stage3D camera={CAMERA}>
      <MasterBedroom curtains={curtain} night={night} />
      <BedroomLightRig fixtures={fixtures} />
    </Stage3D>
  );
}
