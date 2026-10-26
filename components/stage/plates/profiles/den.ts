import type { PlateProfile } from "../profile";

/**
 * The den's calibration.
 *
 * Derived by `scripts/measure-plates.py --gains`, anchored on
 * `dn_general` and spread across the others in proportion to
 * `fixtures x lumensEach` from the space file. The anchor is the 0.25
 * the brief asks for, as in the living room.
 *
 * This is the first set in the project with **no exterior layers at
 * all**. `sky`, `day_sky` and the three sun passes decode to exactly
 * 0.00000 in all three sets, because the den is an enclosed room and its
 * window is outside the camera. They are absent from `gain` rather than
 * zeroed: a layer with no light in it contributes nothing whatever its
 * gain, and listing five numbers that cannot matter invites somebody to
 * tune them. The space declares `enclosed`, which takes the time-of-day
 * scrubber off a room where it would change nothing.
 *
 * `dn_general` is the dim plate here at a frame mean of 0.0155 — eight
 * bulkheads in a dark media room, where almost every surface is matt
 * black or timber — so its gain is the largest in the project. That is
 * the derivation dividing by the plate mean, not a mis-scaled render.
 */
export const DEN_PROFILE: PlateProfile = {
  gain: {
    dn_general: 509.2,
    dn_cove: 179.3,
    dn_accent: 55.3,
    dn_rgb: 27.2,
    dn_bias: 5.74,

    /**
     * The projected image, derived against `den_screen` — the only set
     * that has it. It measures exactly 0.00000 in the other two, because
     * the screen is up in both, so deriving it against the base set
     * gives the same nonsense the boardroom's did.
     *
     * Not on the lumen line with the circuits: a projector is specified
     * in lumens onto a screen of a known gain and at a known throw, and
     * the honest scale is the one that matches the other room with a
     * projector in it. The boardroom's plate decodes to 0.096 at a gain
     * of 2.64; this one decodes to 0.335, three and a half times as
     * bright, so the matching gain is 2.64 x 0.096 / 0.335.
     */
    dn_projection: 0.75,
  },
  exposure: 0.1,
  /**
   * 0.40, as everywhere. Lit pixels here measure R/B 1.01 to 1.31 before
   * anything is applied — the flattest set in the project, which is what
   * a room finished in matt black and grey timber should measure.
   */
  tintSaturation: 0.4,
  /**
   * The projected image, which has no colour temperature to be tinted
   * by. It is a picture on a screen, not a luminaire — the same
   * reasoning as the boardroom's.
   */
  neutralLayers: ["dn_projection"],
  /**
   * The one circuit the sheet fixes. `dn_general` and `dn_cove` share
   * the room's tunable white; `dn_rgb` and `dn_bias` carry their own
   * colour, which is the point of them.
   */
  fixedTint: { dn_accent: 3000 },
  rgbwLayers: [],
  colourBus: null,
};
