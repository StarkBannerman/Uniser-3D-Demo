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
import type { ScreenContent } from "./geometry";
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
   * Behind and left of the seating, elevated, looking down the room at the
   * screen — and the reasoning is worth keeping, because three other cameras
   * were tried first.
   *
   * The seats face the screen, which is what a media room is for. That makes
   * "see the seats and the screen wall together" geometrically impossible: a
   * camera between the two sees the seats with the screen behind the lens, and
   * from anywhere else the two sit about sixty degrees apart, so the frame's
   * centre lands on the window wall between them. Measured on three positions,
   * all three gave a picture of the curtains.
   *
   * So this takes the shot a real media room is actually photographed from.
   * The sectional is five metres away rather than in the lens, the chaise
   * returns on the left so its seats and cushions are visible in profile
   * rather than only its back, the coffee table and the pouf sit between it
   * and the screen, and the screen wall — the thing the room exists for — is
   * the subject.
   */
  position: [1.3, 2.0, 8.4],
  target: [4.4, 1.0, 1.2],
  fov: 55,
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
    /**
   * Quantised to eight steps, deliberately.
   *
   * The skyline now takes the daylight level rather than a night flag, so dusk
   * is a real state — but rebuilding a 2048x1024 canvas on every tick of the
   * clock would be a stall a second. Eight buckets is finer than anyone can see
   * through glass and rebuilds at most eight times across a whole day.
   */
  const skyStep = Math.round(Math.min(Math.max(daylight, 0), 1) * 8) / 8;
  const view = useMemo(() => makeCityTexture(skyStep), [skyStep]);

  const base = space
    ? roomAmbience(space, states, clockMin)
    : { level: 0, color: [255, 245, 230] as [number, number, number], lux: 0 };
  /**
   * A floor under the fill, because this room is graded for a dark room.
   *
   * A media room *should* be dark, and this one was tuned in one — on a good
   * panel in a dim office it reads beautifully. On a laptop in a bright room,
   * or compressed down a screenshare, the bottom two stops disappear entirely
   * and the furniture goes with them. The floor costs nothing in the scenes
   * that are genuinely lit and keeps the room legible in the ones that are
   * not, which is where it is actually being sold.
   */
  const ambient = { ...base, level: Math.max(base.level, 0.085) };

  const screen = av?.screen ?? 0;

  /**
   * What the projector is showing, from the source the scene selected.
   *
   * Without this Work, Movie, Presentation and Gaming were the same room at
   * four brightnesses. The screen is the one object that says what the room is
   * being used for, so the source has to reach it.
   */
  const screenContent: ScreenContent =
    av?.source === "Console"
      ? "game"
      : av?.source === "Laptop"
        ? "presentation"
        : "streaming";

  return (
    <Stage3D
      camera={CAMERA}
      ambient={ambient}
      // A dark room with a bright screen and saturated colour in it: bloom
      // wants a higher threshold here, or the charcoal walls go milky.
      // Enough bloom that the cove and the screen bleed into what is beside
      // them. Below about 0.7 a strip light reads as a painted line.
      bloomIntensity={0.78}
      bloomThreshold={1.05}
    >
      <Den3D
        curtains={curtains}
        view={view}
        screen={screen}
        projectorOn={Boolean(av?.on)}
        deskOn={Boolean(desk?.on)}
        audioLevel={audio?.on ? audio.volume / 100 : 0}
        screenContent={screenContent}
      />
      <DenLightRig
        fixtures={fixtures}
        daylight={daylight}
        transmission={shadeTransmission(curtains.sheer, curtains.blackout)}
        projectorOn={Boolean(av?.on)}
        screenDeployed={screen / 100}
        screenContent={screenContent}
      />
    </Stage3D>
  );
}
