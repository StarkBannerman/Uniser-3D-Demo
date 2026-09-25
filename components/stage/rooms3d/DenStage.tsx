"use client";

/**
 * Den / Media Room, driven by the simulation.
 *
 * Nothing here computes lighting. Levels, colour temperatures and the screen's
 * position arrive already tweened by the engine — including the screen, whose
 * travel is a property of its motor rather than of the scene that asked for it.
 */

import { useMemo } from "react";
import type { AvState, LightState, ShadeState } from "@/lib/sim/types";
import { useSim } from "@/lib/sim/store";
import { roomAmbience } from "@/lib/sim/ambience";
import {
  clamp01,
  daylightLux,
  shadeTransmission,
  sunElevation01,
} from "@/lib/sim/photometry";
import { Stage3D, type CameraSpec } from "../Stage3D";
import { Den3D } from "./Den3D";
import { DenLightRig, type DenFixtures } from "./DenLightRig";
import { makeCityTexture } from "./geometry";

/**
 * Straight down the room, on axis.
 *
 * A one-point perspective is the only setup that shows both side walls at once,
 * and this room needs both: the display wall with its shelving, artwork and work
 * zone down the left, the curtains down the right, the screen square ahead. The
 * curtains closing is a stage of the headline scene, so leaving them out of
 * frame was never an option.
 */
const CAMERA: CameraSpec = {
  /**
   * The room's near-left corner, looking across at the far-right one — the
   * sheet's viewpoint, and the only one that holds every callout at once: the
   * display wall raking away on the left with its poster, shelving, slat panel
   * and work zone, the screen and speakers ahead, the lounge chair and the
   * curtains at the right edge.
   *
   * Solved against the drawing rather than chosen. Reading the sheet, the
   * elements sit at these fractions of frame width, and from here they land:
   *
   *   poster 0.17 -> 0.12    screen   0.66 -> 0.66
   *   slats  0.35 -> 0.34    speakers 0.86 -> 0.84
   *   desk   0.42 -> 0.41    curtains 0.97 -> 0.98
   *
   * 56 degrees rather than 50 because at 50 there is no camera position in this
   * room that holds all of them — the corner-to-corner spread simply does not
   * fit an 79 degree horizontal field.
   */
  position: [2.9, 1.55, 9.4],
  target: [1.73, 1.2, 1.49],
  fov: 56,
};

const OFF: LightState = { on: false, level: 0, cct: 3000, hue: 0, sat: 0 };

export function DenStage() {
  const states = useSim((s) => s.states);
  const clockMin = useSim((s) => s.clockMin);
  const space = useSim((s) => s.space);

  const light = (id: string): LightState =>
    (states[id] as LightState | undefined) ?? OFF;

  const fixtures: DenFixtures = {
    general: light("dn-general"),
    cove: light("dn-cove"),
    accent: light("dn-accent"),
    rgb: light("dn-rgb"),
  };

  const curtains = (states["dn-curtain"] as ShadeState | undefined) ?? {
    sheer: 0,
    blackout: 0,
  };
  const av = states["dn-av"] as AvState | undefined;
  const audio = states["dn-audio"] as AvState | undefined;
  const desk = states["dn-desk"] as AvState | undefined;

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

  const screen = av?.screen ?? 0;

  return (
    <Stage3D
      camera={CAMERA}
      ambient={ambient}
      // A dark room with a bright screen and saturated colour in it: bloom
      // wants a higher threshold here, or the charcoal walls go milky.
      bloomIntensity={0.55}
      bloomThreshold={1.3}
    >
      <Den3D
        curtains={curtains}
        view={view}
        screen={screen}
        projectorOn={Boolean(av?.on)}
        deskOn={Boolean(desk?.on)}
        audioLevel={audio?.on ? audio.volume / 100 : 0}
      />
      <DenLightRig
        fixtures={fixtures}
        daylight={daylight}
        transmission={shadeTransmission(curtains.sheer, curtains.blackout)}
        projectorOn={Boolean(av?.on)}
        screenDeployed={screen / 100}
      />
    </Stage3D>
  );
}
