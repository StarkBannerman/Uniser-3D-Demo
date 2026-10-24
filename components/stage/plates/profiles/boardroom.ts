import type { PlateProfile } from "../profile";

/**
 * The boardroom's calibration.
 *
 * Derived by `scripts/measure-plates.py --gains`, anchored on
 * `bd_general` and spread across the others in proportion to
 * `fixtures x lumensEach` from the space file.
 *
 * Three things about this set are worth knowing.
 *
 * `bd_feature` decodes to a frame mean of **1.34** — eighty times the
 * general downlights and the brightest plate in the whole project. Thirty
 * two metres grazing a timber wall in a 96 m² room reaches almost every
 * pixel, so its gain is correspondingly tiny. That is not a mis-scaled
 * render; it is what a wall-washing circuit looks like measured.
 *
 * `bd_projection` is empty in two of the three sets and had to be derived
 * against the third. It is rendered only with the screen down, measures
 * exactly 0.00000 in `boardroom` and `boardroom_closed`, and is pinned to
 * the screen set at runtime so its spill reaches the whole room — see
 * `Space.plates.overlay`. Deriving it against the base set gives a gain
 * of ninety-one million, which the tool now refuses to print.
 *
 * `day_evening` is empty in all three sets. The low evening sun does not
 * reach this elevation at all, so the layer contributes nothing at any
 * hour and is left at its encoded scale.
 */
export const BOARDROOM_PROFILE: PlateProfile = {
  gain: {
    bd_general: 89.2,
    bd_table: 5.5,
    bd_feature: 0.81,
    bd_front: 111.6,
    bd_vc: 4.3,
    bd_accent: 1.37,
    /** Derived against `boardroom_screen`, the only set that has it. */
    bd_projection: 2.64,

    /**
     * The glazing, and the sun on it.
     *
     * Set against the scene table rather than a glass mask, as in the
     * office: that solve wants a day view plate and a night one to find
     * the glass with, and this set has a single `sky` that serves every
     * hour. The three sun passes are accents — `day_evening` is empty
     * outright.
     */
    sky: 7,
    day_morning: 6,
    day_midday: 8,
    day_evening: 6,
  },
  exposure: 0.1,
  /**
   * 0.40, as in the room, the cabin and the office: this set was
   * rendered with the fixtures' warmth already in it, measuring R/B 1.09
   * to 1.42 on lit pixels before anything is applied.
   */
  tintSaturation: 0.4,
  /**
   * The projected image, which has no colour temperature to be tinted by.
   *
   * It is a photograph on a wall, not a luminaire. Its plate carries
   * whatever the slide is, and multiplying that by the engine's default
   * 3000 K would warm somebody's chart.
   */
  neutralLayers: ["bd_projection"],
  /** The two circuits the sheet fixes. The four tunable ones are absent. */
  fixedTint: { bd_feature: 3000, bd_accent: 2700 },
  rgbwLayers: [],
  colourBus: null,
};
