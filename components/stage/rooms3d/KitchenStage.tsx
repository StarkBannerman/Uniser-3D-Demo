"use client";

/** Kitchen, driven by the simulation. */

import type { AirState, LightState, ShadeState } from "@/lib/sim/types";
import { useSim } from "@/lib/sim/store";
import { roomAmbience } from "@/lib/sim/ambience";
import {
  clamp01,
  daylightLux,
  shadeTransmission,
  sunElevation01,
} from "@/lib/sim/photometry";
import { Stage3D, type CameraSpec } from "../Stage3D";
import { Kitchen3D } from "./Kitchen3D";
import { KitchenLightRig, type KitchenFixtures } from "./KitchenLightRig";

/** Square on to the cabinet run, which is how kitchens are photographed. */
const CAMERA: CameraSpec = {
  position: [3.5, 1.68, 5.7],
  target: [3.95, 1.2, 0.2],
  fov: 56,
};

const OFF: LightState = { on: false, level: 0, cct: 3000, hue: 0, sat: 0 };

export function KitchenStage() {
  const states = useSim((s) => s.states);
  const clockMin = useSim((s) => s.clockMin);
  const space = useSim((s) => s.space);

  const light = (id: string): LightState =>
    (states[id] as LightState | undefined) ?? OFF;

  const fixtures: KitchenFixtures = {
    underCabinet: light("kt-undercabinet"),
    pendants: light("kt-pendants"),
    downlights: light("kt-downlights"),
    plinth: light("kt-plinth"),
  };

  const blindState = (states["kt-blind"] as ShadeState | undefined) ?? {
    sheer: 0,
    blackout: 0,
  };
  const fan = states["kt-fan"] as AirState | undefined;

  const env = space?.environment;
  const daylight = env
    ? clamp01(
        daylightLux(
          sunElevation01(clockMin, env.sunriseMin, env.sunsetMin),
          env.outdoorPeakLux,
        ) / 45000,
      )
    : 0;

  // Bounce light, from the same illuminance the sensor and energy model read.
  // A constant fill here is what made every scene look alike.
  const ambient = space
    ? roomAmbience(space, states, clockMin)
    : { level: 0, color: [255, 245, 230] as [number, number, number], lux: 0 };

  return (
    <Stage3D
      camera={CAMERA}
      ambient={ambient}
      // A daylit room already sits near the top of the range; the bedroom's
      // bloom settings turn every pale surface here into haze.
      bloomIntensity={0.3}
      bloomThreshold={1.9}
    >
      <Kitchen3D
        blind={blindState.blackout}
        fanSpeed={fan?.on ? fan.speed : 0}
        daylight={daylight}
      />
      <KitchenLightRig
        fixtures={fixtures}
        daylight={daylight}
        transmission={shadeTransmission(blindState.sheer, blindState.blackout)}
      />
    </Stage3D>
  );
}
