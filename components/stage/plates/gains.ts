/**
 * Per-layer calibration.
 *
 * The plates are each encoded against their own peak, so `scale` recovers a
 * pass exactly as it was rendered — but it says nothing about whether the
 * passes are in proportion to *each other*. In this set they are not, by a
 * long way. Measured mean frame luminance at full output, the pendants come
 * out at 0.328 and the track at 0.0005: a factor of six hundred between a
 * circuit of eighteen 280-lumen globes and one of thirty-four 900-lumen
 * heads, which is backwards.
 *
 * So these gains put the circuits back into proportion, and they are derived
 * rather than dialled. For each circuit:
 *
 *     gain = GENERAL_GAIN x (lumens / general's lumens) / (measured mean)
 *
 * using `fixtures x lumensEach` from `restaurant.ts` and the measured mean of
 * the decoded plate. `GENERAL_GAIN` is then chosen so that the general
 * circuit alone at full reads as a normally lit room — mean display luminance
 * about 0.235 — which leaves `EXPOSURE` free to sit at 1.
 *
 * The consequence worth understanding: a plate's mean conflates the light a
 * circuit *casts* with the brightness of its own fixtures where they are in
 * shot. The pendants are mostly the latter, which is why their gain is 0.21
 * and why that is correct — 5040 lumens of decorative glass has no business
 * lighting a 330 m² floor. The globes still read, because their peak is
 * enormous and the tone curve keeps them.
 *
 * When the plates are re-rendered these want recomputing, not nudging. The
 * script that measures them is the one thing that should change.
 */

/** Layers not listed here are used at their encoded scale. */
export const LAYER_GAIN: Record<string, number> = {
  /* Circuits. */
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
   * The colour circuit is mounted low, behind the planters and up the window
   * piers, so at its fair share it washed a thin bright line along the sill
   * and nothing else — which read as a strip of tape rather than as a room
   * with colour in it. Party is the one scene that uses it and the one scene
   * whose whole argument is the colour, so it is allowed to be louder than
   * its lumens.
   */
  rs_rgb: 1.5,

  /**
   * Exterior and daylight, calibrated by `scripts/measure-plates.py`.
   *
   * Both are measured inside a mask of the glazing rather than a box over
   * the right-hand third of frame, because in this camera that box is mostly
   * columns and tables: with the room lit at 1 AM it reads 0.252 against the
   * daytime 0.230, which says the night sky is as bright as noon when it is
   * not. And the night figure is a median rather than a mean, because the
   * glass is a dark sky behind thousands of lit tower windows and the mean
   * lands between the two describing neither.
   *
   *   sky     01:00, circuits off — glass median 0.03-0.12, p98 above 0.45
   *                                 so the skyline still reads as lights.
   *   sky_day 13:00, circuits off — glass mean 0.65-0.80, frame not clipping.
   *
   * `sky` was 50, which put the night sky background at a 0.342 mid-grey and
   * poured sky bounce over the dining room after dark. The three sun angles
   * sit on top of whichever view is showing and are accents rather than
   * illumination; `day_morning` needs 600 to register at all, its plate
   * decoding to a mean of 0.00001, which is close enough to empty that it is
   * listed mostly so the asymmetry is on the record.
   */
  sky: 6.7,
  sky_day: 43.5,
  day_morning: 600,
  day_midday: 25,
  day_evening: 15,
};

export function gainOf(layer: string): number {
  return LAYER_GAIN[layer] ?? 1;
}

/**
 * Exposure on the summed HDR, before the tone curve.
 *
 * One number for the whole room and applied once, after every layer has been
 * added in linear — never per layer, which would tone-map the same pixel
 * several times and is what makes a composite go flat and brown.
 *
 * 0.25 with the gains above. It is low because the gains are large, and the
 * two are one calibration rather than two: what matters is their product and
 * where that lands the summed HDR on the AgX curve. Too high and the scenes
 * compress into the top of the curve and stop being distinguishable, which
 * is the failure that made Evening, Dinner, Fine Dining and Private Event
 * look like the same room.
 */
export const EXPOSURE = 0.25;

/**
 * How far a colour temperature is allowed to pull the picture.
 *
 * A blackbody tint at 2700 K, normalised to luminance 1, is a strongly
 * saturated orange, and multiplying a whole plate by it makes white
 * tablecloths look salmon. Real rooms do not read that way because the eye
 * adapts to the illuminant; nothing in a still frame does that for us, so the
 * chroma is pulled back toward neutral by this much and the warmth survives
 * as warmth rather than as a colour cast.
 *
 * It applies to the white locus only. A saturated `rs_rgb` is a real colour
 * rather than an illuminant the eye would discount, and Party has to stay
 * magenta, so the hue mix happens after this and is not capped.
 */
export const TINT_SATURATION = 0.55;

/** Seconds-ish: how long clock-driven layers take to catch up. */
export const CLOCK_EASE_MS = 1500;
