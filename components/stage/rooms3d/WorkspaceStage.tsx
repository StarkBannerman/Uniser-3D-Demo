"use client";

/**
 * Open-plan workspace, driven by the simulation.
 *
 * Nothing here computes lighting. Levels, colour temperatures and blind
 * positions all arrive already tweened by the engine — the blinds at their
 * motor's own speed rather than at the speed the scene asked for.
 */

import { useMemo } from "react";
import type { AvState, FanState, LightState, ShadeState } from "@/lib/sim/types";
import { useSim } from "@/lib/sim/store";
import { roomAmbience } from "@/lib/sim/ambience";
import {
  clamp01,
  daylightLux,
  shadeTransmission,
  sunElevation01,
} from "@/lib/sim/photometry";
import { Stage3D, type CameraSpec } from "../Stage3D";
import { Workspace3D } from "./Workspace3D";
import { WorkspaceLightRig, type WorkspaceFixtures } from "./WorkspaceLightRig";
import { makeCityTexture, type ScreenContent } from "./geometry";

/**
 * The near right corner, looking across the whole plate.
 *
 * An open plan is sold on being one space with several things happening in it,
 * so a view that frames a slice of it throws the room away. From here the desk
 * benches run away down the left against the glazing, the glazed meeting room
 * sits square in the middle distance, and the break area is in the near right —
 * all three zones that the scenes rebalance, visible at once.
 *
 * Three things fixed the numbers:
 *
 *  - **Back against the near wall**, at z = 12.9 of 13.5. Anywhere further in
 *    and the break area is behind the lens, which is the zone two of the seven
 *    scenes exist for.
 *  - **In the corner, looking diagonally**, and on a 70 degree lens. Sixteen
 *    metres by thirteen and a half does not fit a normal lens from inside
 *    itself: at 60 degrees you get the desks and the meeting room and the
 *    glazing is a sliver at the edge, which throws away the wall that makes
 *    the daylight scenes mean anything. The diagonal is the longest sightline
 *    the room has, so it is the one that holds all four zones at once.
 *  - **Low**, at y = 2.02. Not for the tilt — at this distance the pitch
 *    barely changes — but for headroom. The ceiling is only 3.4 m, so a camera
 *    at 2.5 has 0.9 m above it and the plenum fills the top third of the frame
 *    however far down you aim. Dropping half a metre doubles that clearance and
 *    gives the floor back to the desks.
 */
const CAMERA: CameraSpec = {
  position: [13.4, 2.15, 12.8],
  target: [5.9, 1.0, 3.5],
  fov: 70,
};

const OFF: LightState = { on: false, level: 0, cct: 4000, hue: 0, sat: 0 };

export function WorkspaceStage() {
  const states = useSim((s) => s.states);
  const clockMin = useSim((s) => s.clockMin);
  const space = useSim((s) => s.space);

  const light = (id: string): LightState =>
    (states[id] as LightState | undefined) ?? OFF;

  const fixtures: WorkspaceFixtures = {
    general: light("ws-general"),
    linear: light("ws-linear"),
    task: light("ws-task"),
    cove: light("ws-cove"),
    meeting: light("ws-meeting"),
    break: light("ws-break"),
  };

  const blinds = (states["ws-blinds"] as ShadeState | undefined) ?? {
    sheer: 0,
    blackout: 0,
  };
  const display = states["ws-display"] as AvState | undefined;
  const fan = states["ws-fan"] as FanState | undefined;

  const env = space?.environment;
  const outdoorLux = env
    ? daylightLux(
        sunElevation01(clockMin, env.sunriseMin, env.sunsetMin),
        env.outdoorPeakLux,
      )
    : 0;
  const daylight = clamp01(outdoorLux / 45000);

  /**
   * Darkness, measured as darkness.
   *
   * Separate from `daylight`, which is normalised against noon. Keying the
   * exposure to that meant half past five with 27,000 lux outside scored 0.61
   * and the room opened at 82 per cent exposure — the cabin next door shipped
   * that bug. This asks whether the sun has set, not how far it is from noon.
   */
  const night = clamp01(1 - outdoorLux / 6000);

  /**
   * Quantised to eight steps.
   *
   * The skyline takes a daylight level rather than a night flag, so dusk is a
   * real state — but rebuilding a 2048x1024 canvas on every tick of the clock
   * is a stall a second. Eight buckets is finer than anyone can see through
   * glass and rebuilds at most eight times across a whole day.
   */
  const skyStep = Math.round(clamp01(daylight) * 8) / 8;
  const view = useMemo(() => makeCityTexture(skyStep), [skyStep]);

  const base = space
    ? roomAmbience(space, states, clockMin)
    : { level: 0, color: [255, 245, 230] as [number, number, number], lux: 0 };
  /** After dark the fill comes down, but a lit floor still bounces. */
  const ambient = { ...base, level: base.level * (1 - 0.6 * night) };

  const displayOn = Boolean(display?.on);
  const screenContent: ScreenContent =
    display?.source === "Conference"
      ? "conference"
      : display?.source === "Room PC"
        ? "desktop"
        : "presentation";

  const fanSpeed = fan?.on ? fan.speed : 0;

  return (
    <Stage3D
      camera={CAMERA}
      ambient={ambient}
      /**
       * Modest, like the boardroom's and for the same reason.
       *
       * A pale room at 400 lux goes milky the moment bloom is generous — the
       * den's 0.78 at a 1.05 threshold is tuned for charcoal walls and a dark
       * screen, which is the opposite problem. The threshold sits above the
       * lit ceiling so only the fittings themselves bloom.
       */
      bloomIntensity={0.5}
      bloomThreshold={1.25}
    >
      <Workspace3D
        blinds={blinds}
        view={view}
        displayOn={displayOn}
        screenContent={screenContent}
        fanSpeed={fanSpeed}
      />
      <WorkspaceLightRig
        fixtures={fixtures}
        daylight={daylight}
        transmission={shadeTransmission(blinds.sheer, blinds.blackout)}
        displayOn={displayOn}
      />
    </Stage3D>
  );
}
