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
/**
 * Framed to take in the whole room, which is what the reference is.
 *
 * This stood at x = 13.2 with a 50° vertical field — 79° horizontal, so 39.6°
 * either side of the sightline. The reception desk is at x = 28.4 and sits
 * 60° off that axis; the customer lounge, the RGB wall and the left-hand
 * foreground are all outside it too. None of that was dark in our render, it
 * was off the edge of the picture, and no amount of work on the half of the
 * room still in frame was going to put it back.
 *
 * So: wider, further back, and aimed right. 62° vertical is 94° horizontal,
 * which is an architectural lens and the kind of lens the reference was shot
 * on. Aiming at x = 16.5 rather than 14.9 brings the reception zone in on the
 * right while keeping the display floor left of centre, which is the
 * photograph's composition — cars left, customers right.
 *
 * Both numbers are a second pass. The first went to 68° aimed at x = 20,
 * which did get the desk in and overshot: the hero and the ring were pushed
 * against the left edge and the left-hand brand panel went out of frame on
 * the other side. Swinging the aim 3.5 m back toward the middle and taking
 * six degrees off the lens puts the hero 6° left of the axis and 43% across
 * the frame, against roughly 40% in the reference.
 *
 * Checked rather than eyeballed, against a 46.9° half-field: desk 36.8° R,
 * lounge 32.9° R, RGB wall 24.3° R, hero 6.1° L, far sedan 31.0° L, left
 * brand panel 34.9° L. Everything the photograph shows is inside the frame.
 */
export const SHOWROOM_CAMERA: CameraSpec = {
  position: [10.0, 1.75, 23.2],
  target: [16.5, 1.55, 7.0],
  fov: 62,
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
   * Fill, scaled back hard for this room, and warmed.
   *
   * `roomAmbience` derives bounce from illuminance against the space's design
   * lux, which is right in a room with ordinary surfaces. It was scaled back
   * here because the room used to be charcoal throughout and there was a
   * fraction of the inter-reflection the model assumes; left alone it lit
   * every car from every direction at once, and light that arrives from
   * everywhere cannot model anything.
   *
   * The colour is forced warm against the reference. `roomAmbience` returns
   * something near neutral, and bounced light is not neutral: it is the
   * illuminant, minus whatever the surfaces took out of it. The photograph
   * holds B ≈ 0.68R on its ceiling, its wall and its floor alike — one warm
   * source, everywhere — where ours came back at B ≈ 1.03R, a cool ceiling in
   * a warm room.
   *
   * The level is 0.38 and the history is worth keeping, because the obvious
   * reading of it is wrong. A hemisphere light has no inverse square, so it
   * looked like the reason our floor held 158 → 145 across the depth of the
   * room where the reference falls off; it was cut to 0.2 on that reasoning
   * and the floor moved by three values. It was never the floor. What it
   * actually carries is the *ceiling* — a downward-facing surface in a room
   * whose fittings all point at the floor receives nothing else — and cutting
   * it left the ceiling 25 values dark and still neutral. Hence 0.38: below
   * the old 0.55, which did flatten the cars, and well above the cut that
   * bought nothing and cost the one surface this term exists to light.
   */
  const bounced = space
    ? roomAmbience(space, states, clockMin)
    : { level: 0, color: [255, 245, 230] as [number, number, number], lux: 0 };
  const ambient = {
    ...bounced,
    level: bounced.level * 0.38,
    color: [255, 214, 172] as [number, number, number],
  };

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
