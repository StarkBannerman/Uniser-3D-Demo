"use client";

/**
 * Living Room, driven by the simulation.
 */

import type { AvState, LightState, ShadeState } from "@/lib/sim/types";
import { useSim } from "@/lib/sim/store";
import {
  clamp01,
  daylightLux,
  shadeTransmission,
  sunElevation01,
} from "@/lib/sim/photometry";
import { Stage3D, type CameraSpec } from "../Stage3D";
import { LivingRoom3D } from "./LivingRoom3D";
import { LivingRoomLightRig, type LivingFixtures } from "./LivingRoomLightRig";

/** Fixed viewpoint, matched to the client's reference photograph. */
const CAMERA: CameraSpec = {
  // Stands at the near end and looks down the length of the room: glazing to
  // the left, media wall to the right, hallway at the far end.
  position: [2.55, 1.62, 6.75],
  target: [3.9, 1.12, 1.5],
  // Wide, as interior photography is — the reference is roughly a 20mm frame.
  fov: 58,
};

const OFF: LightState = { on: false, level: 0, cct: 3000, hue: 0, sat: 0 };

export function LivingRoomStage() {
  const states = useSim((s) => s.states);
  const clockMin = useSim((s) => s.clockMin);
  const space = useSim((s) => s.space);

  const light = (id: string): LightState =>
    (states[id] as LightState | undefined) ?? OFF;

  const fixtures: LivingFixtures = {
    cove: light("lv-cove"),
    downlights: light("lv-downlights"),
    wash: light("lv-wash"),
    accent: light("lv-accent"),
  };

  const curtains = (states["lv-curtain"] as ShadeState | undefined) ?? {
    sheer: 0,
    blackout: 0,
  };
  const av = states["lv-av"] as AvState | undefined;

  const env = space?.environment;
  const daylight = env
    ? clamp01(
        daylightLux(
          sunElevation01(clockMin, env.sunriseMin, env.sunsetMin),
          env.outdoorPeakLux,
        ) / 45000,
      )
    : 0;

  return (
    <Stage3D camera={CAMERA}>
      <LivingRoom3D
        curtains={curtains}
        tvOn={Boolean(av?.on)}
        daylight={daylight}
      />
      <LivingRoomLightRig
        fixtures={fixtures}
        daylight={daylight}
        transmission={shadeTransmission(curtains.sheer, curtains.blackout)}
      />
    </Stage3D>
  );
}
