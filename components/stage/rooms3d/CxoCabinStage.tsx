"use client";

/**
 * CXO Cabin, driven by the simulation.
 *
 * Nothing here computes lighting. Levels, colour temperatures, curtain
 * positions and the fan's speed all arrive already tweened by the engine.
 */

import { useMemo } from "react";
import type { LightState, ShadeState } from "@/lib/sim/types";
import { useSim } from "@/lib/sim/store";
import { roomAmbience } from "@/lib/sim/ambience";
import {
  clamp01,
  daylightLux,
  shadeTransmission,
  sunElevation01,
} from "@/lib/sim/photometry";
import { Stage3D, type CameraSpec } from "../Stage3D";
import { CxoCabin3D } from "./CxoCabin3D";
import { CxoCabinLightRig, type CxoFixtures } from "./CxoCabinLightRig";
import { makeCityTexture } from "./geometry";

/**
 * Down the diagonal, into the corner.
 *
 * Taken from the client's own scene sheet, which prints all seven scenes from
 * one viewpoint and settles what two earlier guesses got wrong. Both long walls
 * recede: the glass down the left, the lit joinery down the right, the desk
 * across the middle with its chairs in front of it. Standing left of centre is
 * what opens the glazing out into the left third instead of flattening it into
 * the frame edge.
 *
 * Close to the desk, which is the whole composition.
 *
 * Measured against the reference rather than judged: there the desk's near
 * edge takes 46 per cent of the frame width and the lens sits about 4.2 m from
 * it. Mine was giving the desk 19 per cent from 6.7 m, with the bottom 40 per
 * cent of the picture bare floor — which is exactly the "zoomed out" of it.
 *
 * Moving in to 4.3 m on a 52 degree lens buys the desk back without touching
 * the architecture, and pushes the empty carpet out of frame rather than
 * trying to fill it.
 */
const CAMERA: CameraSpec = {
  position: [5.25, 1.74, 6.75],
  target: [2.5, 1.12, 2.1],
  fov: 52,
};

const OFF: LightState = { on: false, level: 0, cct: 3000, hue: 0, sat: 0 };

export function CxoCabinStage() {
  const states = useSim((s) => s.states);
  const clockMin = useSim((s) => s.clockMin);
  const space = useSim((s) => s.space);

  const light = (id: string): LightState =>
    (states[id] as LightState | undefined) ?? OFF;

  const fixtures: CxoFixtures = {
    decorative: light("cx-decorative"),
    cove: light("cx-cove"),
    general: light("cx-general"),
    task: light("cx-task"),
    accent: light("cx-accent"),
    rgb: light("cx-rgb"),
  };

  const curtains = (states["cx-curtain"] as ShadeState | undefined) ?? {
    sheer: 0,
    blackout: 0,
  };

  const env = space?.environment;
  const outdoorLux = env
    ? daylightLux(
        sunElevation01(clockMin, env.sunriseMin, env.sunsetMin),
        env.outdoorPeakLux,
      )
    : 0;
  /** How much daylight reaches the glass, normalised against a bright noon. */
  const daylight = clamp01(outdoorLux / 45000);
  /**
   * How dark it is *outside*, which is a different question.
   *
   * Exposure and ambient were keyed to `daylight`, which saturates against
   * noon — so at 5:20 PM, the hour this room opens at, 27,000 lux outdoors
   * scored 0.61 and the room arrived at 82 per cent exposure with its fill cut
   * by a third. That is a bright afternoon being rendered as late dusk, and it
   * is why the cabin looked dark on load.
   *
   * What those two actually want to know is whether the sun has gone, not how
   * far it is from its peak. Anything above about 6,000 lux outside is plain
   * daylight and the room should be exposed normally; below that it ramps down
   * through twilight and reaches night when the sun is actually down.
   */
  const night = clamp01(1 - outdoorLux / 6000);

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
   * Exposure and ambient fill, both driven by the time of day.
   *
   * `roomAmbience` derives its fill from the room's own lux, which is right for
   * inter-reflection and wrong as the only term: at 8 PM with the cove and the
   * accent up it returned 0.65, so a hemisphere light flooded every surface
   * evenly and the room read as a grey box with some strips in it.
   *
   * After dusk there is no sky to fill a room. The fill drops to a sixth and
   * the exposure comes down with it, so what is left is the fixtures' own
   * light — which is the whole point of a scene called Evening.
   */
  const ambient = {
    ...base,
    level: base.level * (1 - 0.84 * night),
  };
  /**
   * The night floor went 0.42, then 0.55, now 0.72.
   *
   * The first two were chosen while Evening was being pushed towards a lounge.
   * An office with its own lights on after dark is not a dim room — the
   * fixtures are doing the same work they do at four in the afternoon, and the
   * only thing that has actually changed is that there is no daylight adding
   * to them. Stopping the aperture down by nearly half on top of that was
   * double-counting the dark.
   */
  const exposure = 1 - 0.28 * night;

  /**
   * Screens follow the desk zone: off when the room stands down, dim when it
   * is only decorative. Task alone would leave them dark through Evening,
   * which has no task light but is plainly still occupied.
   */
  const deskLevel = (st: LightState) => (st.on ? st.level / 100 : 0);
  const screens = Math.max(deskLevel(fixtures.task), deskLevel(fixtures.decorative));

  return (
    <Stage3D
      camera={CAMERA}
      ambient={ambient}
      // A warm dark room with a lot of small bright sources in it — shelf
      // strips, a pendant blade, a lamp. Bloom carries most of the "premium"
      // instruction, so it runs a little hotter than the boardroom's, with a
      // threshold high enough that the plaster does not go milky.
      // Only the strips and the lamp should bloom. At a 1.08 threshold the
      // lit joinery, the stone and half the ceiling were over it too.
      bloomIntensity={0.42}
      bloomThreshold={1.9}
    >
      <CxoCabin3D curtains={curtains} view={view} screens={screens} />
      <CxoCabinLightRig
        fixtures={fixtures}
        daylight={daylight}
        transmission={shadeTransmission(curtains.sheer, curtains.blackout)}
        exposure={exposure}
      />
    </Stage3D>
  );
}
