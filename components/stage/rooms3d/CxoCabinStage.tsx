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
 * Across the room from the lounge corner, looking at the desk.
 *
 * The sheet's viewpoint, and it is a diagonal for a reason. This room is two
 * rooms — a desk against a stone wall, and a lounge in front of the glazing —
 * and the only camera that holds both is one standing in the corner of the
 * second looking at the first. Square on to the desk, the lounge is behind the
 * lens and the room reads as an office with a good wall.
 *
 * The glazing then runs away down the left edge with the drapes on it, which is
 * what puts the city in shot without the window becoming the subject.
 *
 * Solved against the sheet, by reading where each element sits as a fraction of
 * its frame width and aiming for the same:
 *
 *   glazing  0.14 - 0.48      stone wall  0.58 - 0.70
 *   desk     0.28 - 0.72      shelving    0.71 - 0.84
 *   sofa     0.00 - 0.22      framed art  0.86 - 0.97
 *
 * Two numbers did most of the work, and both were wrong before. The height:
 * the sheet's vanishing point sits at 0.42 of frame height, which puts the lens
 * at about 1.4 m — near enough seated, not the 2.0 m standing view it had. And
 * the distance: 2.8 m from the desk rather than 6.6, because at six metres a
 * 3.4 m desk takes a fifth of the picture and the sheet gives it nearly half.
 *
 * Standing back and up is the safe instinct and it is what makes a room read as
 * a floor plan with furniture on it. The sheet is close and low, which is why
 * its desk looks like somebody's desk.
 */
const CAMERA: CameraSpec = {
  position: [3.8, 1.45, 8.6],
  target: [4.9, 1.0, 1.6],
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
