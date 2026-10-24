import type { PlateProfile } from "../profile";

/**
 * The open-plan floor's calibration.
 *
 * Derived by `scripts/measure-plates.py --gains`, anchored on `ow_general`
 * and spread across the other circuits in proportion to
 * `fixtures x lumensEach` from the space file.
 *
 * Two things about this set are unlike the other four.
 *
 * It has **one view plate**, not a day/night pair, so `sky` is the daylight
 * through the glass at every hour rather than the city after dark. The
 * runtime handles that — see `soleView` in `weights.ts` — by running it on
 * the day's share with a floor under it, and the two scenes set after dark
 * tint it blue instead of crossfading to a night render that does not
 * exist. It also means the glazing solve has nothing to solve against, so
 * `sky` is set from the scene table rather than from the glass mask.
 *
 * And the **closed set is one layer short**. Both have the sheet's nine
 * circuits except that `office_closed` has no `ow_cove`. The stage points
 * that layer at the base plate in every set rather than refusing the
 * blinds over it, which is also the physically right answer: the cove is
 * inside a dropped ceiling and lowering a blind at the window does not
 * reach it.
 */
export const OFFICE_PROFILE: PlateProfile = {
  gain: {
    ow_general: 110.0,
    ow_linear: 7.7,
    ow_task_a: 3.0,
    ow_task_b: 8.3,
    ow_cove: 1.7,
    ow_meeting: 3.4,
    ow_break: 1.8,
    /**
     * Eight uplights into planting and a backlit keypad, on a plate whose
     * frame mean is 0.00017 — four hundred times smaller than the cove's.
     * A large gain on a small plate mean is what a handful of narrow
     * beams in a wide shot looks like, and it is honest rather than
     * mis-scaled: the derivation divides by the mean, so the lumens do
     * the deciding either way.
     */
    ow_accent: 246.9,
    ow_display: 1.3,

    /**
     * The glazing, and the sun on it.
     *
     * Set against the scene table rather than against a glass mask: that
     * solve needs a daytime view plate *and* a night one to find the
     * glass with, and this set has a single `sky`. The figure puts Start
     * Day's morning glazing at roughly the brightness the other rooms'
     * daytime windows reach, with the blinds up.
     *
     * The three sun passes barely register here, as in the guest room:
     * they decode to frame means of 0.0025, 0.0033 and 0.0010 against the
     * view's 0.035, so they are a presence setting rather than a
     * calibration.
     */
    sky: 7.2,
    day_morning: 40,
    day_midday: 30,
    day_evening: 40,
  },
  exposure: 0.1,
  /**
   * 0.40, as in the guest room and the cabin, because this set was
   * rendered with the fixtures' warmth already in it — the lit pixels
   * measure R/B 1.13 to 1.39 before anything is applied. The 0.55 the
   * restaurant and lobby use would double that into sodium.
   */
  tintSaturation: 0.4,
  /**
   * The meeting-room screen, which is not a luminaire.
   *
   * It measures R/B 0.62 — blue, like every display — and it has no
   * colour control to have chosen that. Tinting it by the engine's
   * default 3000 K would turn the one cool object in the room warm.
   */
  neutralLayers: ["ow_display"],
  /**
   * The two circuits the sheet fixes. The four tunable workspace circuits
   * are absent because their colour is real and shared, and `ow_cove`
   * would be here too if it had a plate.
   */
  fixedTint: { ow_break: 2700, ow_accent: 3000 },
  rgbwLayers: [],
  colourBus: null,
};
