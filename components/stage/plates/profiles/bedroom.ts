import type { PlateProfile } from "../profile";

/**
 * The bedroom's calibration.
 *
 * Derived by `scripts/measure-plates.py --gains`, anchored on
 * `br_general` and spread across the others in proportion to
 * `fixtures x lumensEach` from the space file. The two exterior layers
 * are solved inside the glazing mask against the same targets the
 * restaurant uses.
 *
 * Two of these numbers look odd and are not. `br_cove` decodes to a
 * frame mean of 0.64 — twenty-four metres in a tray ceiling reaching
 * every surface of a 34 m² room — so its gain is tiny. And the two
 * bedside lamps differ by a factor of four despite being the same
 * fitting: the near lamp is close to the camera and fills far more of
 * the frame than the far one, and the derivation divides by the plate
 * mean, so the far lamp needs more gain to emit the same light. That is
 * the correction doing its job rather than an asymmetry in the room.
 */
export const BEDROOM_PROFILE: PlateProfile = {
  gain: {
    br_general: 114.3,
    br_cove: 5.35,
    br_bedside_l: 28.1,
    br_bedside_r: 7.8,
    br_reading: 226.1,
    br_wardrobe: 19.2,
    br_path: 46.9,

    /**
     * The balcony, by night and by day.
     *
     * Both come off the glazing solve, which this room can afford: a
     * 34 m² bedroom behind a balcony door is genuinely lit by it, so the
     * figure that matches how bright the glass looks also lights the
     * room behind it.
     *
     * The three sun passes sit on top of whichever view is showing and
     * are accents — their plates decode to frame means around 0.005
     * against the day view's 0.079.
     */
    sky: 0.18,
    day_sky: 6.89,
    day_morning: 6,
    day_midday: 8,
    day_evening: 6,
  },
  exposure: 0.1,
  /**
   * 0.40, as in every set rendered with the fixtures' own warmth in it.
   * Lit pixels here measure R/B 1.04 to 1.56 before anything is applied.
   */
  tintSaturation: 0.4,
  neutralLayers: [],
  /**
   * The four circuits the sheet fixes, including the path lighting at
   * 2200 K — amber on purpose, because the one circuit that is on at
   * three in the morning must not be the one that wakes anybody up.
   * `br_general` and `br_cove` are absent: their colour is real and
   * shared.
   */
  fixedTint: {
    br_bedside_l: 2700,
    br_bedside_r: 2700,
    br_reading: 3000,
    br_wardrobe: 3000,
    br_path: 2200,
  },
  rgbwLayers: [],
  colourBus: null,
};
