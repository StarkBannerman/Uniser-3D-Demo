"use client";

/**
 * CXO Cabin, driven by the simulation.
 *
 * Nothing here computes lighting. Levels, colour temperatures, curtain
 * positions and the fan's speed all arrive already tweened by the engine.
 */

import { useMemo } from "react";
import type { LightState, ShadeState } from "@/lib/sim/types";
import { useSim } from "@/lib/sim/store";
import { roomAmbience } from "@/lib/sim/ambience";
import {
  clamp01,
  daylightLux,
  shadeTransmission,
  sunElevation01,
} from "@/lib/sim/photometry";
import { Stage3D, type CameraSpec } from "../Stage3D";
import { CxoCabin3D } from "./CxoCabin3D";
import { CxoCabinLightRig, type CxoFixtures } from "./CxoCabinLightRig";
import { makeCityTexture } from "./geometry";

/**
 * Down the diagonal, into the corner.
 *
 * Taken from the client's own scene sheet, which prints all seven scenes from
 * one viewpoint and settles what two earlier guesses got wrong. Both long walls
 * recede: the glass down the left, the lit joinery down the right, the desk
 * across the middle with its chairs in front of it. Standing left of centre is
 * what opens the glazing out into the left third instead of flattening it into
 * the frame edge.
 *
 * A little above standing height and tilted down, so the rug and the desk top
 * are both in shot and the verticals stay near enough parallel.
 */
const CAMERA: CameraSpec = {
  position: [6.6, 1.95, 9.8],
  target: [1.25, 1.0, 1.7],
  fov: 60,
};

const OFF: LightState = { on: false, level: 0, cct: 3000, hue: 0, sat: 0 };

export function CxoCabinStage() {
  const states = useSim((s) => s.states);
  const clockMin = useSim((s) => s.clockMin);
  const space = useSim((s) => s.space);

  const light = (id: string): LightState =>
    (states[id] as LightState | undefined) ?? OFF;

  const fixtures: CxoFixtures = {
    decorative: light("cx-decorative"),
    cove: light("cx-cove"),
    general: light("cx-general"),
    task: light("cx-task"),
    accent: light("cx-accent"),
    rgb: light("cx-rgb"),
  };

  const curtains = (states["cx-curtain"] as ShadeState | undefined) ?? {
    sheer: 0,
    blackout: 0,
  };

  const env = space?.environment;
  const daylight = env
    ? clamp01(
        daylightLux(
          sunElevation01(clockMin, env.sunriseMin, env.sunsetMin),
          env.outdoorPeakLux,
        ) / 45000,
      )
    : 0;

  const night = daylight <= 0.02;
  const view = useMemo(() => makeCityTexture(night), [night]);

  const ambient = space
    ? roomAmbience(space, states, clockMin)
    : { level: 0, color: [255, 245, 230] as [number, number, number], lux: 0 };

  return (
    <Stage3D
      camera={CAMERA}
      ambient={ambient}
      // A warm dark room with a lot of small bright sources in it — shelf
      // strips, a pendant blade, a lamp. Bloom carries most of the "premium"
      // instruction, so it runs a little hotter than the boardroom's, with a
      // threshold high enough that the plaster does not go milky.
      bloomIntensity={0.72}
      bloomThreshold={1.08}
    >
      <CxoCabin3D curtains={curtains} view={view} />
      <CxoCabinLightRig
        fixtures={fixtures}
        daylight={daylight}
        transmission={shadeTransmission(curtains.sheer, curtains.blackout)}
      />
    </Stage3D>
  );
}
