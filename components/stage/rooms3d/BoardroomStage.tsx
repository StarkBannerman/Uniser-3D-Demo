"use client";

/**
 * Boardroom, driven by the simulation.
 *
 * Nothing here computes lighting. Levels, colour temperatures, blind positions
 * and the screen's descent all arrive already tweened by the engine — the
 * screen at its motor's own speed rather than at the speed the scene asked for.
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
import { Boardroom3D } from "./Boardroom3D";
import { BoardroomLightRig, type BoardroomFixtures } from "./BoardroomLightRig";
import { makeCityTexture, type ScreenContent } from "./geometry";

/**
 * The whole room, from the back wall.
 *
 * An earlier version stood mid-room on the table's axis and framed a slice of
 * it: you saw the glazing and the table receding and almost nothing of the
 * right-hand wall. A boardroom is sold on being a whole room, so the camera is
 * now hard against the back wall at 11.1 of 11.6 metres, on a 58 degree lens,
 * and everything is in frame — both long walls, the full table and all fourteen
 * chairs, the screen, the cove down both sides, the blinds and the timber wall.
 *
 * Three constraints settled the exact numbers, and all three are worth keeping:
 *
 *  - **Off the room's axis**, at x = 2.25 against a centre of 3.7. Standing on
 *    the axis points the pendant straight at the lens, where five metres of
 *    linear luminaire collapses into a blob directly over the screen.
 *  - **Below the pendant**, at 2.18 against its 2.44. Above it you see the top
 *    of a dark extrusion; below it you see the lit face, which is the point of
 *    specifying a feature luminaire at all.
 *  - **Aimed low**, at y = 1.0. The table is the subject and the ceiling is
 *    not, and tilting down keeps the verticals close enough to parallel that
 *    the room does not read as a wide-angle photograph of itself.
 */
const CAMERA: CameraSpec = {
  position: [2.25, 2.18, 11.1],
  target: [4.0, 1.0, 2.6],
  fov: 58,
};

const OFF: LightState = { on: false, level: 0, cct: 3000, hue: 0, sat: 0 };

export function BoardroomStage() {
  const states = useSim((s) => s.states);
  const clockMin = useSim((s) => s.clockMin);
  const space = useSim((s) => s.space);

  const light = (id: string): LightState =>
    (states[id] as LightState | undefined) ?? OFF;

  const fixtures: BoardroomFixtures = {
    general: light("br-general"),
    cove: light("br-cove"),
    feature: light("br-feature"),
    table: light("br-table"),
    front: light("br-front"),
    vc: light("br-vc"),
  };

  const blinds = (states["br-blinds"] as ShadeState | undefined) ?? {
    sheer: 0,
    blackout: 0,
  };
  const av = states["br-av"] as AvState | undefined;
  const display = states["br-display"] as AvState | undefined;
  const conf = states["br-conf"] as AvState | undefined;

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

  /**
   * What is on whichever surface is live.
   *
   * It matters more here than anywhere else in the building. Presentation and
   * Video Conference light the room in opposite directions for opposite
   * reasons, and they now use different hardware to do it — the projector and
   * its screen for one, the wall panel for the other. Without this they would
   * have been the same room at two brightnesses with the same slide on it.
   */
  const screenContent: ScreenContent = conf?.on
    ? "conference"
    : display?.source === "Room PC" || av?.source === "Room PC"
      ? "desktop"
      : "presentation";

  const projectorOn = Boolean(av?.on);
  /** The panel is dark whenever the fabric has come down in front of it. */
  const displayOn = Boolean(display?.on) && screen < 50;
  /** Either surface counts as a source for the bounce light. */
  const lit = projectorOn || displayOn;

  return (
    <Stage3D
      camera={CAMERA}
      ambient={ambient}
      // A pale room at 400 lux: bloom has to stay modest or the plaster goes
      // milky. The den's 0.78 at a 1.05 threshold is tuned for charcoal walls
      // and a dark screen, which is the opposite problem.
      bloomIntensity={0.55}
      bloomThreshold={1.18}
    >
      <Boardroom3D
        blinds={blinds}
        view={view}
        screen={screen}
        projectorOn={projectorOn}
        displayOn={displayOn}
        screenContent={screenContent}
      />
      <BoardroomLightRig
        fixtures={fixtures}
        daylight={daylight}
        transmission={shadeTransmission(blinds.sheer, blinds.blackout)}
        avOn={lit}
        screenDeployed={screen / 100}
        screenContent={screenContent}
      />
    </Stage3D>
  );
}
