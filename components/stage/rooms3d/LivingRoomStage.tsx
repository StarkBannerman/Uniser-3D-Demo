"use client";

/**
 * Living Room, driven by the simulation.
 */

import type {
  AvState,
  ClimateState,
  FanState,
  LightState,
  ShadeState,
} from "@/lib/sim/types";
import { useSim } from "@/lib/sim/store";
import { useMemo } from "react";
import { roomAmbience } from "@/lib/sim/ambience";
import { bladeRadPerSec } from "@/lib/sim/fan";
import {
  clamp01,
  daylightLux,
  shadeTransmission,
  sunElevation01,
} from "@/lib/sim/photometry";
import { Stage3D, type CameraSpec } from "../Stage3D";
import { LivingRoom3D } from "./LivingRoom3D";
import { makeCityTexture } from "./geometry";
import { LivingRoomLightRig, type LivingFixtures } from "./LivingRoomLightRig";

/** Fixed viewpoint, matched to the client's reference photograph. */
const CAMERA: CameraSpec = {
  /**
   * Standing eye height, aimed level.
   *
   * The pitch is the thing that was wrong. Tilted down from two metres the room
   * read as a security camera looking into a box — verticals converged, the
   * floor filled the frame and every object looked oversized. Interior
   * photography keeps the camera near eye level and the axis close to
   * horizontal, so walls stay vertical and the room keeps its scale. This drops
   * 16 cm over eight metres: about one degree.
   */
  position: [3.4, 1.58, 8.4],
  target: [5.9, 1.2, 0.8],
  fov: 50,
};

const OFF: LightState = { on: false, level: 0, cct: 3000, hue: 0, sat: 0 };

export function LivingRoomStage() {
  const states = useSim((s) => s.states);
  const clockMin = useSim((s) => s.clockMin);
  const space = useSim((s) => s.space);

  const light = (id: string): LightState =>
    (states[id] as LightState | undefined) ?? OFF;

  const fixtures: LivingFixtures = {
    downlights: light("lv-downlights"),
    cove: light("lv-cove"),
    decorative: light("lv-decorative"),
    accent: light("lv-accent"),
    rgb: light("lv-rgb"),
  };

  const curtains = (states["lv-curtain"] as ShadeState | undefined) ?? {
    sheer: 0,
    blackout: 0,
  };
  const tv = states["lv-tv"] as AvState | undefined;
  const climate = states["lv-ac"] as ClimateState | undefined;
  const audio = states["lv-audio"] as AvState | undefined;

  const fanDevice = space?.devices.find((d) => d.id === "lv-fan");
  const fanSpeeds = fanDevice?.kind === "fan" ? fanDevice.speeds : 5;
  const fanSpin = bladeRadPerSec(states["lv-fan"] as FanState | undefined, fanSpeeds);

  const env = space?.environment;
  const daylight = env
    ? clamp01(
        daylightLux(
          sunElevation01(clockMin, env.sunriseMin, env.sunsetMin),
          env.outdoorPeakLux,
        ) / 45000,
      )
    : 0;

  /**
   * The city beyond the glazing, redrawn only when the sun crosses the horizon.
   *
   * Regenerating a 2048px canvas every frame would be pointless work; the view
   * only has two states the eye can tell apart.
   */
  const night = daylight <= 0.02;
  const view = useMemo(() => makeCityTexture(night), [night]);

  // Bounce light, from the same illuminance the sensor and energy model read.
  // A constant fill here is what made every scene look alike.
  const ambient = space
    ? roomAmbience(space, states, clockMin)
    : { level: 0, color: [255, 245, 230] as [number, number, number], lux: 0 };

  return (
    <Stage3D
      camera={CAMERA}
      ambient={ambient}
      bloomIntensity={0.42}
      bloomThreshold={1.6}
    >
      <LivingRoom3D
        view={view}
        curtains={curtains}
        tvOn={Boolean(tv?.on)}
        daylight={daylight}
        audioLevel={audio?.on ? audio.volume / 100 : 0}
        fanRadiansPerSecond={fanSpin}
        ac={{ on: Boolean(climate?.on), fan: climate?.fan ?? 0 }}
      />
      <LivingRoomLightRig
        fixtures={fixtures}
        daylight={daylight}
        transmission={shadeTransmission(curtains.sheer, curtains.blackout)}
      />
    </Stage3D>
  );
}
