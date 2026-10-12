"use client";

/**
 * Hotel Lobby, driven by the simulation.
 *
 * Nothing here computes lighting. Levels, colour temperatures and the blinds'
 * position arrive already tweened by the engine — including the blinds, whose
 * travel is a property of their motor rather than of the scene that asked for
 * them.
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
import { HotelLobby3D } from "./HotelLobby3D";
import { HotelLobbyLightRig, type LobbyFixtures } from "./HotelLobbyLightRig";

/**
 * Inside the lobby, near the left front, looking diagonally into the depth.
 *
 * Three things set this, and all three came from the reference.
 *
 * **Eye height, not drone height.** 1.6 m. A lobby photographed from three
 * metres up reads as an architect's model; the thing being sold here is what a
 * guest sees walking in, and a guest is 1.6 m tall.
 *
 * **Verticals all but straight, and pitched down rather than up.** The target
 * is 1.15 m *below* the camera over an eighteen-metre throw — three and a half
 * degrees. It was two degrees the other way, which put the horizon below
 * centre and handed the top 45 per cent of the frame to an empty ceiling.
 * Tilting down raises the horizon and takes the ceiling to roughly a third,
 * and three and a half degrees of convergence on a seven-metre column is not
 * something the eye picks up. Any more and it is a phone photograph.
 *
 * **Diagonal, so the room has depth.** Square to the back wall, a 24 m room is
 * a corridor with a wall at the end of it. On the diagonal the reception desk
 * runs away down the left, the lounge crosses the middle, and the chandelier
 * and the water wall sit at the vanishing point with the façade and the
 * driveway opening up on the right — which is the reference's composition
 * exactly, and the reason nothing large sits within two metres of the lens.
 *
 * The yaw is six degrees off the long axis rather than twenty-four, and that
 * was measured rather than judged. The reception wall stands at x = 0.2 with
 * the camera at x = 5.6, so it is nearly edge-on: at the wider angle its whole
 * length fell outside the left edge of the frame and the hotel's own name was
 * not in its own lobby. Six degrees puts the far half of it in shot, which is
 * what a wall you are standing beside is supposed to do.
 */
const CAMERA: CameraSpec = {
  position: [5.6, 1.5, 22.6],
  target: [7.7, 0.35, 4.2],
  fov: 48,
};

const OFF: LightState = { on: false, level: 0, cct: 3000, hue: 0, sat: 0 };

export function HotelLobbyStage() {
  const states = useSim((s) => s.states);
  const clockMin = useSim((s) => s.clockMin);
  const space = useSim((s) => s.space);

  const light = (id: string): LightState =>
    (states[id] as LightState | undefined) ?? OFF;

  const fixtures: LobbyFixtures = {
    general: light("hl-general"),
    cove: light("hl-cove"),
    arch: light("hl-arch"),
    decor: light("hl-decor"),
    accent: light("hl-accent"),
    feature: light("hl-feature"),
    facade: light("hl-facade"),
  };

  const blinds = (states["hl-blinds"] as ShadeState | undefined) ?? {
    sheer: 0,
    blackout: 0,
  };
  const music = states["hl-music"] as AvState | undefined;
  const occ = states["hl-occ"] as { value: number } | undefined;

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
   * Quantised to eight steps, deliberately.
   *
   * The exterior takes the daylight level rather than a night flag, so dusk is
   * a real state — but rebuilding the sky on every tick of the clock would be
   * a stall a second. Eight buckets is finer than anyone can see through glass.
   */
  const skyStep = Math.round(clamp01(daylight) * 8) / 8;

  const ambient = space
    ? roomAmbience(space, states, clockMin)
    : { level: 0, color: [255, 245, 230] as [number, number, number], lux: 0 };

  const audioLevel = music?.on ? music.volume / 100 : 0;

  return (
    <Stage3D
      camera={CAMERA}
      ambient={ambient}
      /**
       * Lower than the media rooms, higher than the office.
       *
       * The chandelier and the water wall are meant to bleed; the marble floor
       * is not. At the den's 0.78 the floor's specular highlights smeared into
       * a milky sheet across the bottom third of the frame — a polished floor
       * returns a great many small highlights and bloom treats every one of
       * them as a light source. 0.5 with a threshold of 1.3 blooms the globes
       * and leaves the stone alone.
       */
      bloomIntensity={0.5}
      bloomThreshold={1.3}
    >
      <HotelLobby3D
        daylight={daylight}
        skyStep={skyStep}
        blinds={blinds}
        audioLevel={audioLevel}
        musicOn={Boolean(music?.on)}
        occupied={(occ?.value ?? 1) > 0.5}
      />
      <HotelLobbyLightRig
        fixtures={fixtures}
        daylight={daylight}
        transmission={shadeTransmission(blinds.sheer, blinds.blackout)}
      />
    </Stage3D>
  );
}
