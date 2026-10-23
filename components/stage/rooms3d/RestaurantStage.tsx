"use client";

/**
 * Hotel Restaurant, driven by the simulation.
 *
 * Nothing here computes lighting. Levels and colour temperatures arrive
 * already tweened by the engine; this file only reads them, decides what the
 * room's own bounce should be, and hands both to the rig.
 */

import { Suspense, useMemo } from "react";
import type { AvState, LightState } from "@/lib/sim/types";
import { useSim } from "@/lib/sim/store";
import { roomAmbience } from "@/lib/sim/ambience";
import { clamp01, daylightLux, sunElevation01 } from "@/lib/sim/photometry";
import { Environment, Lightformer } from "@react-three/drei";
import { Stage3D, type CameraSpec } from "../Stage3D";
import { Restaurant3D, RS, RS_PLAN } from "./Restaurant3D";
import { RestaurantLightRig, type RestaurantFixtures } from "./RestaurantLightRig";

/**
 * Eight sky textures, spaced by square root.
 *
 * The same fix the lobby needed, and for the same reason: `makeCityTexture`
 * does most of its work in the bottom of the daylight range, so evenly spaced
 * buckets spend three of eight above daylight 0.5 where nothing changes and
 * none at all in the band where dusk lives. Square-root spacing puts them
 * where the ramp bends.
 */
function skyBucket(daylight: number): number {
  const q = Math.round(Math.sqrt(clamp01(daylight)) * 8) / 8;
  return q * q;
}

/**
 * The client's hero frame, read back into this room's corner coordinates.
 *
 * Standing inside the entrance, a little left of centre, looking diagonally
 * across the covers so the glazing runs away to the right and the bar sits on
 * the left shoulder. Eye height 1.5 m and a shallow downward pitch, which is
 * the only way the tabletops read as surfaces rather than as ellipses.
 *
 * `fov` is the vertical field *at 16:9*; `Stage3D` mounts `LockHorizontalFov`
 * and re-solves it for whatever shape the canvas actually gets, so a taller
 * viewport gains ceiling rather than losing the bar.
 */
export const RESTAURANT_CAMERA: CameraSpec = {
  position: [4.4, 1.5, 20.4],
  target: [8.8, 1.0, 7.4],
  fov: 50,
};

/**
 * The scene, with no props.
 *
 * Split out so an offline path trace can mount exactly what the live stage
 * mounts. The lobby learned this the hard way: a baker with its own copy of
 * the room is a statement about the copy.
 */
export function RestaurantScene() {
  const states = useSim((s) => s.states);
  const clockMin = useSim((s) => s.clockMin);
  const space = useSim((s) => s.space);

  const light = (id: string): LightState =>
    (states[id] as LightState | undefined) ?? {
      on: false,
      level: 0,
      cct: 2700,
      hue: 0,
      sat: 0,
    };

  const fixtures: RestaurantFixtures = {
    general: light("rs-general"),
    tunable: light("rs-tunable"),
    cove: light("rs-cove"),
    pendant: light("rs-pendant"),
    arch: light("rs-arch"),
    feature: light("rs-feature"),
    table: light("rs-table"),
    rgb: light("rs-rgb"),
  };

  const env = space?.environment;
  const daylight = env
    ? clamp01(
        daylightLux(
          sunElevation01(clockMin, env.sunriseMin, env.sunsetMin),
          env.outdoorPeakLux,
        ) / 45000,
      )
    : 0;

  const skyStep = skyBucket(daylight);

  return (
    <>
      <Restaurant3D skyStep={skyStep} />
      <RestaurantLightRig fixtures={fixtures} daylight={daylight} />
    </>
  );
}

export function RestaurantStage() {
  const states = useSim((s) => s.states);
  const clockMin = useSim((s) => s.clockMin);
  const space = useSim((s) => s.space);

  const music = states["rs-music"] as AvState | undefined;

  const base = space
    ? roomAmbience(space, states, clockMin)
    : { level: 0, color: [255, 245, 230] as [number, number, number], lux: 0 };

  /**
   * A floor under the bounce, as the lobby has.
   *
   * Fine Dining runs the ambient layer at twelve per cent on purpose, and the
   * bounce derived from that is small enough that the chairs and the far half
   * of the floor fall to black — the room loses its edges and reads as an
   * empty shape rather than a dim one. A restaurant at this level is dark; it
   * is not featureless, because three hundred square metres of polished stone
   * bounces whatever the pendants and the table lamps are still doing.
   */
  const ambient = useMemo(
    () => ({ ...base, level: Math.max(base.level, 0.05) }),
    [base],
  );

  void music;

  return (
    <Stage3D
      camera={RESTAURANT_CAMERA}
      ambient={ambient}
      /**
       * Lower than the media rooms and a shade under the lobby's.
       *
       * This room has more small bright things in it than any other — eighteen
       * filaments, twelve lamp shades, ninety-six wine glasses catching the
       * pendants — and bloom treats every one of them as a source. At the
       * lobby's 0.5 the glassware smeared into a haze across the covers. 0.42
       * with a threshold of 1.35 blooms the filaments and leaves the stems
       * alone.
       */
      bloomIntensity={0.42}
      bloomThreshold={1.35}
    >
      {/*
        A room-local environment: warm formers where the cove runs and down
        the back bar, and one cool former at the glazing so stone, brass and
        glassware return THIS room rather than a studio. Baked once, costs
        nothing per frame. Its own Suspense, because a suspending sibling
        takes the whole Canvas subtree down with it.
      */}
      <Suspense fallback={null}>
        <Environment resolution={256} frames={1}>
          {[6, 11, 16].map((z, i) => (
            <Lightformer
              key={`warm-${i}`}
              form="rect"
              intensity={1.5}
              color="#ffd49a"
              scale={[9, 0.5, 1]}
              position={[RS.w / 2, RS_PLAN.raft.y + 0.4, z]}
              rotation={[Math.PI / 2, 0, 0]}
            />
          ))}
          <Lightformer
            form="rect"
            intensity={1.5}
            color="#9fc2e8"
            scale={[1, 4, 14]}
            position={[RS.w + 1.5, 2.2, 11]}
            rotation={[0, -Math.PI / 2, 0]}
          />
          <Lightformer
            form="rect"
            intensity={1.8}
            color="#ffc98a"
            scale={[1, 1.6, 8]}
            position={[0.6, 2.0, 14]}
            rotation={[0, Math.PI / 2, 0]}
          />
        </Environment>
      </Suspense>

      <RestaurantScene />
    </Stage3D>
  );
}
