import type { PlateProfile } from "../profile";

/**
 * The hotel restaurant's calibration.
 *
 * The gains put the circuits back into proportion, because the plate set is
 * not internally consistent: measured mean frame luminance at full output
 * ran from 0.33 for the pendants to 0.0005 for the track, a factor of six
 * hundred between eighteen 280-lumen globes and thirty-four 900-lumen heads,
 * which is backwards. They are derived rather than dialled —
 *
 *     gain ~ (lumens / general's lumens) / (what the plate actually puts out)
 *
 * — using `fixtures x lumensEach` from the space file. The second term is
 * the awkward one: a plate's mean conflates the light a circuit *casts* with
 * the brightness of its own fixtures where they are in shot, a ratio running
 * from 0.45 for the track, which appears nowhere, to 43 for the pendants,
 * which are the largest object in frame. So lumens set the shape and the
 * scenes settled the rest, against the brief's test — Cleaning brightest and
 * most even, Fine Dining clearly the darkest service scene, Private Event
 * above Dinner and Evening, only Party carrying colour.
 *
 * The two exterior layers are measured inside a mask of the glazing rather
 * than a box over the right of frame, and the night figure is a median
 * rather than a mean. See `scripts/measure-plates.py`, which carries the
 * targets:
 *
 *   sky     01:00, circuits off — glass median 0.03-0.12, p98 above 0.45.
 *   sky_day 13:00, circuits off — glass mean 0.65-0.80, frame not clipping.
 */
export const RESTAURANT_PROFILE: PlateProfile = {
  gain: {
    rs_general: 90,
    rs_tunable: 260,
    rs_cove: 7,
    rs_pendant: 1.2,
    rs_arch: 5,
    rs_feature: 0.1,
    rs_table: 5,
    /**
     * 2.5x what lumen share alone would give it.
     *
     * Mounted low, behind the planters and up the window piers, so at its
     * fair share it washed a thin bright line along the sill and nothing
     * else — a strip of tape rather than a room with colour in it.
     */
    rs_rgb: 1.5,
    /**
     * `sky_day` carries the daytime view and the light coming in with it, so
     * it is the one that has to make the room read as naturally lit. `sky`
     * is the night view and sits lower, because a city at night should be
     * visible through the glass without lighting the dining room. The three
     * sun angles are accents on top of whichever view is showing;
     * `day_morning` needs 600 to register at all, its plate decoding to a
     * mean of 0.00001, which is close enough to empty that it is listed
     * mostly so the asymmetry is on the record.
     */
    sky: 6.7,
    sky_day: 43.5,
    day_morning: 600,
    day_midday: 25,
    day_evening: 15,
  },
  exposure: 0.25,
  tintSaturation: 0.55,
  /**
   * The pendants are smoked amber glass and the globes are in shot, so that
   * warmth is a property of the object rather than of the beam; tinting it
   * again by a 2000 K circuit colour applies it twice.
   */
  neutralLayers: ["rs_pendant"],
  /**
   * A cove run and a linear architectural profile are almost always RGBW in
   * a room specified like this — the white dies light dinner, the colour
   * dies are why the same floor can be sold for a party.
   */
  rgbwLayers: ["rs_cove", "rs_arch"],
  colourBus: "rs-rgb",
};
