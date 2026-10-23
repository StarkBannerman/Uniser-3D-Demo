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
import { Environment, Lightformer } from "@react-three/drei";
import { Suspense } from "react";
import { Stage3D, type CameraSpec } from "../Stage3D";
import { HotelLobby3D } from "./HotelLobby3D";
import { HotelLobbyLightRig, type LobbyFixtures } from "./HotelLobbyLightRig";

/**
 * The brief's viewpoint: standing in the open front of the lobby, on the
 * centre line, looking straight down the long axis.
 *
 * Brief (0, 1.6, 0) looking -Z with zero yaw and 3-4 degrees of downward
 * pitch; in this file's corner frame that is (10, 1.6, 27) aimed at
 * (10, 0.38, 7). Position and target share an x, so the yaw is exactly zero -
 * the previous camera ran six degrees off the axis from a position beside the
 * left wall, which is what put the reception wall edge-on.
 *
 * `fov` is the vertical field at 16:9 and `LockHorizontalFov` holds the
 * horizontal field across viewport shapes, so this is not the brief's number:
 * 78 degrees horizontal at 16:9 is 2*atan(tan(39)/1.778) = 49 vertical. At
 * the 1264x843 the landmarks are measured in, that same horizontal field
 * gives the ~57 vertical the brief quotes.
 */
export const LOBBY_CAMERA: CameraSpec = {
  position: [10, 1.6, 27],
  target: [10, 0.38, 7],
  fov: 49,
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

  const base = space
    ? roomAmbience(space, states, clockMin)
    : { level: 0, color: [255, 245, 230] as [number, number, number], lux: 0 };
  /**
   * A floor under the fill, as the den has.
   *
   * Night runs the general layer at eighteen per cent, and the bounce the
   * ambience model derives from that is small enough that the navy rug and
   * the dark half of the floor fell to black — the room lost its pattern and
   * its material and read as an empty shape. A lobby at two in the morning is
   * dim; it is not featureless, because a 400 m² marble floor bounces
   * whatever the reception desk and the cove are still doing.
   *
   * It costs nothing in the scenes that are genuinely lit, where the derived
   * level is well above it.
   */
  const ambient = { ...base, level: Math.max(base.level, 0.2) };

  const audioLevel = music?.on ? music.volume / 100 : 0;

  return (
    <Stage3D
      camera={LOBBY_CAMERA}
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
      {/*
        A lobby-local environment: warm formers where the coves run and a
        cool one at the glazing, so marble, lacquer and glass return THIS
        room. Baked once, costs nothing per frame. Own Suspense, because a
        suspending sibling takes the Canvas subtree down with it.
      */}
      <Suspense fallback={null}>
        <Environment resolution={256} frames={1}>
          {[6, 12, 18].map((z, i) => (
            <Lightformer
              key={i}
              form="rect"
              intensity={3}
              color="#ffd9a0"
              scale={[14, 0.5, 1]}
              position={[8.5, 7, z - 12]}
              rotation={[Math.PI / 2, 0, 0]}
            />
          ))}
          <Lightformer
            form="rect"
            intensity={1.6}
            color="#35537d"
            scale={[10, 6, 1]}
            position={[10, 2.5, 0]}
            rotation={[0, -Math.PI / 2, 0]}
          />
        </Environment>
      </Suspense>
      <LobbyScene />
    </Stage3D>
  );
}

/**
 * The room's contents, with no stage wrapper around them.
 *
 * Split out so the offline path tracer in `/bake` mounts the SAME geometry
 * and the SAME rig as the live stage rather than a copy of them - the two
 * cannot drift, which is the only way a baked result is a statement about
 * this room rather than about a second model of it.
 *
 * It reads the simulation itself instead of taking props, so the bake only
 * has to load the space and apply a scene; everything else follows.
 */
export function LobbyScene() {
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
  const skyStep = Math.round(clamp01(daylight) * 8) / 8;
  const audioLevel = music?.on ? (music.volume ?? 0) / 100 : 0;

  return (
    <>
      <HotelLobby3D
        daylight={daylight}
        skyStep={skyStep}
        blinds={blinds}
        audioLevel={audioLevel}
        musicOn={Boolean(music?.on)}
        occupied={(occ?.value ?? 1) > 0.5}
      />
      <HotelLobbyLightRig
        gain={0.72}
        fixtures={fixtures}
        daylight={daylight}
        transmission={shadeTransmission(blinds.sheer, blinds.blackout)}
      />
    </>
  );
}
