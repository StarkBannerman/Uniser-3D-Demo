"use client";

/**
 * CXO Cabin, driven by the simulation.
 *
 * Nothing here computes lighting. Levels, colour temperatures, curtain
 * positions and the fan's speed all arrive already tweened by the engine.
 */

import { useMemo } from "react";
import type { AvState, FanDevice, FanState, LightState, ShadeState } from "@/lib/sim/types";
import { useSim } from "@/lib/sim/store";
import { roomAmbience } from "@/lib/sim/ambience";
import { bladeRadPerSec } from "@/lib/sim/fan";
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
 * Solved rather than eyeballed. Aiming at the desk put the lens 28 degrees off
 * the room's axis and threw the whole glazed wall outside the frustum — the
 * first render had no window in it at all. Aiming at x = 3.4 instead holds the
 * glazing between 0.16 and 0.27 of the frame width and still leaves the desk at
 * 0.65, which is where the sheet has it.
 */
const CAMERA: CameraSpec = {
  position: [2.3, 2.0, 9.7],
  target: [3.7, 1.1, 2.0],
  fov: 58,
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

  /**
   * Blade speed, handed to the geometry as a rate rather than an angle.
   *
   * The angle is advanced inside the render loop. Computing it here and pushing
   * it in with `setState` meant a state update from the render phase, which
   * schedules another render, which schedules another — an infinite loop that
   * pegged the thread and timed out every click on the page.
   */
  const fanDevice = space?.devices.find((d): d is FanDevice => d.kind === "fan");
  const fanState = fanDevice ? (states[fanDevice.id] as FanState | undefined) : undefined;
  const fanRate = bladeRadPerSec(fanState, fanDevice?.speeds ?? 5);

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
      <CxoCabin3D curtains={curtains} view={view} fanRate={fanRate} />
      <CxoCabinLightRig
        fixtures={fixtures}
        daylight={daylight}
        transmission={shadeTransmission(curtains.sheer, curtains.blackout)}
      />
    </Stage3D>
  );
}
