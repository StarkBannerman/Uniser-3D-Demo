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
   * Beside the seating, three-quarters on, level with the coffee table.
   *
   * Two cameras before this one looked at the back of the sofa, because a sofa
   * squared up to a screen has no other side to be seen from — its front faces
   * the screen, so the only viewpoint that sees the seats is between the two,
   * with the screen behind the lens. The sectional is turned 57 degrees off
   * the screen for that reason; see `DN_PLAN.seating`.
   *
   * From here the frame holds the seats and cushions 21 degrees left of
   * centre, the coffee table in front of them, the screen wall 21 right, and
   * the lounge chair and curtains on the right beyond it. The shelving sits
   * just past the left edge at this focal length, which is the one thing the
   * brief asked for that would not fit — pulling it in costs a 60 degree lens
   * and the bowed verticals that come with it.
   *
   * 1.42 m: seated eye height, so the room is seen from where somebody using
   * it would see it, and low enough that the coffee table has a top.
   */
  position: [6.9, 1.42, 5.6],
  target: [3.07, 1.0, 2.39],
  fov: 52,
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
