import type { PlateProfile } from "../profile";

/**
 * The living room's calibration.
 *
 * Derived by `scripts/measure-plates.py --gains`, anchored on `lv_general`
 * and spread across the others in proportion to `fixtures x lumensEach`
 * from the space file, with the two views solved inside the glazing mask
 * against the targets every other set uses.
 *
 * The anchor is the 0.25 the brief asks for, which makes this the first
 * set in six not to need pulling back. Gain and exposure only ever reach
 * the shader as a product, so the anchor is the whole brightness scale,
 * and every previous room had to come down to 0.13 because 0.25 pushed
 * its bright scenes into the top of the AgX curve. Measured here it does
 * not: the six scenes run 0.008 to 0.323 with a worst case of 1.4% of
 * pixels clipped, against the cabin's 3.3% at the same anchor. At 0.13
 * the same six ran 0.003 to 0.215 and the room read as underlit —
 * nothing below the cove line resolved at all. This is a dark render of
 * a dark room, and it has the headroom.
 *
 * One number is the opposite of what the brief predicts and is worth
 * saying plainly. The brief expects `lv_deco` to be a dim layer needing a
 * high gain, "because the pendants and the table lamp are small sources".
 * In this render they are not: the plate decodes to a frame mean of 0.232,
 * the second brightest circuit in the room, because the dining pendants
 * are large lit shades in shot and the table lamp fills the near corner.
 * `lv_general` is the dim one at 0.008 — nine downlights whose light lands
 * mostly on a dark floor — which is why it carries a gain two orders of
 * magnitude above everything else. Both figures are the derivation
 * dividing by the plate mean and doing its job.
 */
export const LIVING_PROFILE: PlateProfile = {
  gain: {
    lv_general: 194.0,
    lv_cove: 6.04,
    lv_deco: 1.365,
    lv_accent: 14.02,
    lv_tvwall: 2.12,
    lv_rgb: 1.26,

    /**
     * The skyline by night and the same view by day.
     *
     * Both come off the glazing solve, which this room can take: a living
     * room behind a full-height glazed wall is genuinely lit by it. The
     * three sun passes sit on top of whichever view is showing and are
     * accents — they decode to frame means around 0.02 against the day
     * view's 0.192.
     */
    sky: 0.26,
    day_sky: 6.54,
    day_morning: 6,
    day_midday: 8,
    day_evening: 6,
  },
  exposure: 0.1,
  /**
   * 0.40, as in every set rendered with the fixtures' own warmth in it.
   * Lit pixels here measure R/B 1.11 to 1.88 before anything is applied,
   * the deco circuit being the warm end of that — which is what a pair of
   * 2700 K pendants in shot should measure.
   */
  tintSaturation: 0.4,
  neutralLayers: [],
  /**
   * The three circuits the sheet fixes. `lv_general` and `lv_cove` are
   * absent because they share the room's tunable white, and `lv_rgb` is
   * absent because its colour is the point — it was rendered white so the
   * browser can tint it, exactly as the cabin's shelves are.
   */
  fixedTint: {
    lv_deco: 2700,
    lv_accent: 3000,
    lv_tvwall: 3000,
  },
  /**
   * Empty, and `colourBus` with it.
   *
   * The colour here is contained the way the cabin's is: `lv_rgb` carries
   * its own `hue` and `sat` and nothing follows it. Party cycles that one
   * circuit — a cove that changed colour with it would light the whole
   * ceiling magenta, which is a nightclub rather than a living room.
   */
  rgbwLayers: [],
  colourBus: null,
};
