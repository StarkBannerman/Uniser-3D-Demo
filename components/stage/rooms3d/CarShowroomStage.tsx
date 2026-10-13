"use client";

/**
 * Car Showroom, driven by the simulation.
 *
 * Nothing here computes lighting. Levels, colour temperatures and the
 * turntable's speed arrive already tweened by the engine.
 */

import type { AvState, FanState, LightState } from "@/lib/sim/types";
import { useSim } from "@/lib/sim/store";
import { roomAmbience } from "@/lib/sim/ambience";
import { clamp01, daylightLux, sunElevation01 } from "@/lib/sim/photometry";
import { bladeRadPerSec } from "@/lib/sim/fan";
import { Stage3D, type CameraSpec } from "../Stage3D";
import { CarShowroom3D } from "./CarShowroom3D";
import { CarShowroomLightRig, type ShowroomFixtures } from "./CarShowroomLightRig";

/**
 * Front-left of the floor, looking diagonally into the depth.
 *
 * Eye height, not drone height: 1.55 m. A showroom photographed from three
 * metres up reads as a floor plan, and what is being sold here is what a
 * customer sees walking in off the street.
 *
 * Pitched down by a degree and a half rather than up. The hotel lobby was
 * pitched *up* two degrees and handed 45 per cent of the frame to an empty
 * ceiling; a shallow downward tilt puts the horizon above centre, which gives
 * the floor — the surface carrying every reflection in the room — the space
 * it needs, and keeps a six-metre column from visibly converging.
 *
 * The diagonal is what makes the room deep. Square to the back wall a 20 m
 * plate is a corridor; on the diagonal the coupé leads in the left
 * foreground, the hero platform sits at the vanishing point, and the columns,
 * lounge and mezzanine open up to the right.
 */
const CAMERA: CameraSpec = {
  position: [7.0, 1.7, 23.0],
  target: [15.5, 1.45, 6.0],
  fov: 45,
};

const OFF: LightState = { on: false, level: 0, cct: 3000, hue: 0, sat: 0 };

export function CarShowroomStage() {
  const states = useSim((s) => s.states);
  const clockMin = useSim((s) => s.clockMin);
  const space = useSim((s) => s.space);

  const light = (id: string): LightState =>
    (states[id] as LightState | undefined) ?? OFF;

  const fixtures: ShowroomFixtures = {
    general: light("cs-general"),
    spots: light("cs-spots"),
    product: light("cs-product"),
    linear: light("cs-linear"),
    accent: light("cs-accent"),
    floor: light("cs-floor"),
    arch: light("cs-arch"),
    rgb: light("cs-rgb"),
  };

  const turntable = states["cs-turntable"] as FanState | undefined;
  const focus = states["cs-focus"] as AvState | undefined;

  /**
   * The source list in the panel is written for a person; the rig needs an id.
   *
   * Keeping the mapping here rather than in the config means the space file
   * stays readable to whoever is writing scenes, and the renderer stays the
   * only thing that knows what the cars are called internally.
   */
  const FOCUS_IDS: Record<string, string> = {
    "Hero SUV": "suv",
    "Silver Coupé": "coupe",
    "Red Sports": "sport",
    "Dark Saloon": "sedan",
    "White Saloon": "white",
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

  const ambient = space
    ? roomAmbience(space, states, clockMin)
    : { level: 0, color: [255, 245, 230] as [number, number, number], lux: 0 };

  /**
   * High-CRI is a circuit that is *on*; standard CRI is what you get when it
   * is off and the ordinary heads carry the display alone.
   *
   * Modelling it this way rather than as a toggle with two light sets means
   * the comparison is the real one a dealership makes — the same fittings,
   * one set rendering colour properly and one not — and it costs no extra
   * lights.
   */
  const standardCri = !fixtures.product.on || fixtures.product.level < 5;

  return (
    <Stage3D
      camera={CAMERA}
      ambient={ambient}
      /**
       * Lower than the media rooms and a touch above the lobby.
       *
       * The LED lines and the coffer ring are meant to bleed; polished
       * concrete is not. A glossy floor returns a great many small highlights
       * and bloom treats every one as a source, which is how the lobby's floor
       * went milky before its threshold came up.
       */
      bloomIntensity={0.52}
      bloomThreshold={1.25}
    >
      <CarShowroom3D
        /**
         * A twelfth of a ceiling fan's rate.
         *
         * `bladeRadPerSec` is calibrated for blades — 29 to 134 rpm — and a
         * display turntable does about one revolution every forty seconds, or
         * 1.5 rpm. Reusing the device kind is worth it for everything else it
         * brings; reusing its speeds without scaling them would spin a car
         * like a washing machine.
         */
        turntableRadiansPerSecond={bladeRadPerSec(turntable, 3) * 0.028}
        // A car's own lamps belong to the moment it is being presented, not
        // to the room's ambient state — so they follow the RGB feature
        // circuit, which is only up in Launch and Event.
        lampsOn={fixtures.rgb.on && fixtures.rgb.level > 20}
        screensOn={Boolean((states["cs-screens"] as { on?: boolean } | undefined)?.on)}
      />
      <CarShowroomLightRig
        fixtures={fixtures}
        daylight={daylight}
        standardCri={standardCri}
        focusId={focus?.on ? FOCUS_IDS[focus.source] : undefined}
      />
    </Stage3D>
  );
}
