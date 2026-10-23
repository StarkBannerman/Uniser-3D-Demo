import type { PlateProfile } from "../profile";

/**
 * The luxury car showroom's calibration.
 *
 * Derived, not dialled, by `scripts/measure-plates.py --gains`, anchored so
 * `sr_general` alone at full reads about 0.25 mean display luminance — the
 * brief's own test — and spread across the other circuits in proportion to
 * `fixtures x lumensEach` from the space file.
 *
 * The spread is wide because the plate set is not internally consistent. At
 * full output the architectural line decodes to a mean of 0.212 and the
 * product spots to 0.00002, a factor of ten thousand between a circuit of
 * 72 000 lumens and one of 26 000 — so the gains run from 1.1 to 8900 and
 * that is the measurement, not a preference.
 *
 * Two things are deliberately absent. There are no RGBW layers: the sheet
 * puts colour on the feature-wall fins and the planter uplights and nowhere
 * else, so `sr_rgb` tints its own plate and nothing follows it. And there
 * are no neutral layers, because unlike the restaurant nothing here was
 * rendered with its lamp colour baked in — the two plates that measure
 * coloured are `sr_floor` at R/B 1.29, which is a warm floor being lit, and
 * `sr_zone_4` at 3.61, which is the red coupe reflecting its own paint.
 * Both are surfaces doing what surfaces do, and tinting them is correct.
 */
export const SHOWROOM_PROFILE: PlateProfile = {
  gain: {
    sr_general: 29.4,
    /**
     * Four figures, and it is not a mistake.
     *
     * The product ring decodes to a frame mean of 0.00002 — it is twelve
     * narrow beams onto one car in a wide shot, so almost every pixel of
     * its plate is black. The plate uses its full 8-bit range where it is
     * lit, so there is nothing to amplify but signal.
     *
     * Solved against the turntable car rather than against the frame, for
     * the same reason the zones are: this ring is the only thing that
     * actually lights that vehicle, so what matters is what it does there.
     */
    sr_spot: 52263,
    sr_track: 296,
    sr_linear: 3.4,
    sr_accent: 1.1,
    sr_floor: 6.6,
    sr_arch: 2.1,
    sr_tunable: 552,
    sr_rgb: 29,
    /**
     * Six identical four-spot circuits, equalised at their own car.
     *
     * Normalising these on frame mean like the rest was wrong: a narrow
     * circuit aimed at one vehicle in a wide shot is almost all black, so
     * matching frame means matched the black and left the cars unequal —
     * the side-on saloon came out dimmer under its own spotlights than its
     * neighbours were under the ambient. These are instead solved so each
     * zone delivers the same luminance inside its own car's hotspot, which
     * is the thing the presenter is actually looking at — and solved
     * against the rendered composite rather than against linear plate
     * values, because AgX is not linear and equal light at the car is not
     * the same as equal *picture* at the car.
     *
     * `sr_zone_3` is the exception and is deliberately low. Its pass puts
     * almost nothing on the turntable car — equalising it the same way asks
     * for a gain of 964 639 — and what light it does carry lands on the
     * cars either side, so raising it would brighten the neighbours of the
     * vehicle it is meant to isolate. The turntable car's light is the
     * high-CRI ring above it, which is why `sr-spot` is attached to that
     * option as a companion in the space file.
     */
    sr_zone_1: 149,
    sr_zone_2: 5921,
    sr_zone_3: 50,
    sr_zone_4: 5628,
    sr_zone_5: 2648,
    sr_zone_6: 25301,
  },
  /**
   * 0.20, which is lower than the restaurant's because the gains are
   * larger. The two are one calibration: what matters is their product.
   *
   * Measured scene means at this setting: Closing 0.07, Vehicle
   * Presentation 0.22, Customer Consultation 0.25, Delivery 0.26, Premium
   * 0.26, New Car Launch 0.30, Event 0.33, Showroom Open 0.35. Under
   * Vehicle Presentation each of the six cars reads 1.43x to 1.56x the
   * brightest other car, which is the number that says the selection is
   * visibly doing something.
   */
  exposure: 0.2,
  tintSaturation: 0.55,
  neutralLayers: [],
  rgbwLayers: [],
  colourBus: "sr-rgb",
};
