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
  position: [3.8, 1.58, 8.8],
  target: [3.8, 1.2, 0.5],
  fov: 50,
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
