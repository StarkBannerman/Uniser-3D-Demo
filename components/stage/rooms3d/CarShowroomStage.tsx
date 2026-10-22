"use client";

/**
 * Car Showroom, driven by the simulation.
 *
 * Nothing here computes lighting. Levels, colour temperatures and the
 * turntable's speed arrive already tweened by the engine.
 */

import type { AvState, LightState } from "@/lib/sim/types";
import { useSim } from "@/lib/sim/store";
import { roomAmbience } from "@/lib/sim/ambience";
import { clamp01, daylightLux, sunElevation01 } from "@/lib/sim/photometry";
import { Stage3D, useStillDevice, type CameraSpec } from "../Stage3D";
import { CarShowroom3D } from "./CarShowroom3D";
import { CarShowroomLightRig, type ShowroomFixtures } from "./CarShowroomLightRig";
import { ShowroomPlate } from "./ShowroomPlate";

/**
 * Near-axial, from the front of the floor at eye height.
 *
 * Rebuilt against the reference photograph. The previous camera ran a hard
 * diagonal across the plate, which is what drove a saloon into the bottom of
 * the frame at arm's length and left the hero behind it. The reference is not
 * a diagonal: it looks almost straight down the depth of the room from a
 * little right of centre, with the hero platform just left of the middle, the
 * brand walls down the left and the lounge and reception opening up on the
 * right. Everything stays whole and nothing is closer than about nine metres.
 *
 * Eye height, not drone height: 1.62 m. A showroom photographed from three
 * metres up reads as a floor plan, and what is being sold is what a customer
 * sees walking in off the street.
 *
 * 50° rather than 45°, because the reference is a wide frame — it holds the
 * left-hand brand wall and the right-hand reception in one shot, which a
 * 45° lens from this distance cannot.
 *
 * Standing at x = 13.2, not 15. The stage is not the browser window — the
 * control panel takes the right third, so the plate is about 1.35:1 and not
 * the 1.6 the viewport suggests. At x = 15 that narrower frame cut the left
 * edge off the coupé however far back the car was moved, because shifting a
 * car toward the lens narrows the frame faster than the car travels. The
 * camera had to move, not the vehicle.
 *
 * The target sits at 1.5 m, barely below the lens. Aimed at 1.15 it pitched
 * down far enough to hand the bottom 45 per cent of the plate to bare floor,
 * which is the same mistake the hotel lobby made with its ceiling, upside
 * down. The reference gives the floor about a third: enough to carry the
 * reflections, not so much that it becomes the subject.
 */
export const SHOWROOM_CAMERA: CameraSpec = {
  position: [13.2, 1.66, 20.8],
  target: [14.9, 1.5, 4.0],
  fov: 50,
};

const OFF: LightState = { on: false, level: 0, cct: 3000, hue: 0, sat: 0 };

/**
 * Everything the showroom derives from the simulation, in one place.
 *
 * Pulled out so the offline bake and the live stage agree by construction:
 * the backplate is rendered from exactly the geometry, rig and fixture states
 * the live layer will be drawn on top of. A plate that disagrees with what is
 * composited over it is worse than no plate, and the surest way to disagree
 * is to describe the room twice.
 */
export function useShowroomState() {
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

  const focus = states["cs-focus"] as AvState | undefined;

  // The turntable is a device, and it does not turn. Tell the render pump, or
  // the room never goes idle in any scene that leaves it switched on.
  useStillDevice("cs-turntable", true);

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

  /**
   * Fill, scaled back hard for this room.
   *
   * `roomAmbience` derives bounce from illuminance against the space's design
   * lux, which is right in a room with ordinary surfaces and wrong here: the
   * ceiling, walls and columns are all charcoal at a reflectance of 0.08 to
   * 0.12, so there is a fraction of the inter-reflection the model assumes.
   * Left alone it sat at its cap and lit every car from every direction at
   * once — the coupé's bonnet and its flank came back eleven values apart,
   * which is a car with no form in it. Light that arrives from everywhere
   * cannot model anything, and modelling is the entire job of a display rig.
   */
  const bounced = space
    ? roomAmbience(space, states, clockMin)
    : { level: 0, color: [255, 245, 230] as [number, number, number], lux: 0 };
  const ambient = { ...bounced, level: bounced.level * 0.55 };

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

  return {
    ambient,
    standardCri,
    fixtures,
    daylight,
    focusId: focus?.on ? FOCUS_IDS[focus.source] : undefined,
    lampsOn: fixtures.rgb.on && fixtures.rgb.level > 20,
    screensOn: Boolean((states["cs-screens"] as { on?: boolean } | undefined)?.on),
  };
}

/** The room itself: geometry and rig, with no stage or composer around it. */
export function ShowroomScene({
  state,
}: {
  state: ReturnType<typeof useShowroomState>;
}) {
  return (
    <>
      <CarShowroom3D
        /**
         * The hero car stands still.
         *
         * The turntable is still a device — it has a speed, the scenes set it
         * and the controls show it — but the client asked for the car not to
         * turn, and they are right: a slow rotation reads as drift on a
         * screenshot and as a stutter on a weak GPU, and it costs a continuous
         * frame loop for the whole session.
         */
        turntableRadiansPerSecond={0}
        lampsOn={state.lampsOn}
        screensOn={state.screensOn}
      />
      <CarShowroomLightRig
        fixtures={state.fixtures}
        daylight={state.daylight}
        standardCri={state.standardCri}
        focusId={state.focusId}
      />
    </>
  );
}

export function CarShowroomStage() {
  const state = useShowroomState();

  return (
    /*
     * The plate sits over the live room rather than replacing it, and the
     * wrapper is here rather than in `Stage3D` so this trial cannot reach any
     * other room. Without `?plate=1` it renders nothing at all.
     */
    <div className="relative h-full w-full">
      <Stage3D
        camera={SHOWROOM_CAMERA}
        ambient={state.ambient}
        /**
         * Lower than the media rooms and a touch above the lobby.
         *
         * The LED lines and the coffer ring are meant to bleed; polished
         * concrete is not. A glossy floor returns a great many small
         * highlights and bloom treats every one as a source, which is how the
         * lobby's floor went milky before its threshold came up.
         */
        bloomIntensity={0.52}
        bloomThreshold={1.25}
      >
        <ShowroomScene state={state} />
      </Stage3D>
      <ShowroomPlate />
    </div>
  );
}
