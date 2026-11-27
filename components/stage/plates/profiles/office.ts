import type { PlateProfile } from "../profile";

/**
 * The open-plan floor's calibration.
 *
 * Re-derived against the v18 plates, November 2026.
 *
 * Derived by `scripts/measure-plates.py --gains`, anchored on `ow_general`
 * and spread across the other circuits in proportion to
 * `fixtures x lumensEach` from the space file. The anchor is 0.25 and it
 * was honest before and is honest now: on the v17 plates the shipped gain
 * of 110 measured `ow_general` alone at full at 0.2508, and the only
 * reason these numbers move is that the converter's scales did. v18 hid
 * every strip and lens inside its own circuit, which took `ow_general`'s
 * scale from 30.2 to 4.26 and `ow_task_b`'s from 34.3 to 3.01, so the same
 * gains read 37% and 84% low until re-solved.
 *
 * The derivation lands close to where v17 sat, which is the check that it
 * is measuring rather than inventing. Alone at full, v17 then v18:
 * general 0.2508 / 0.2508, linear 0.2059 / 0.2545, cove 0.0495 / 0.0562,
 * meeting 0.0444 / 0.0492, break 0.0486 / 0.0450, task A 0.0224 / 0.0176,
 * task B 0.0329 / 0.0291, display 0.0045 / 0.0036.
 *
 * The exception is `ow_accent`, 0.0087 down to 0.0024, and it is supposed
 * to be: v18 took the plant uplights out, so the circuit is a backlit
 * keypad and a matte panel and nothing else. It is now the dimmest thing
 * in the room, which is what the sheet asks for.
 *
 * One thing about this set is still unlike the other four. It has **one
 * view plate**, not a day/night pair, so `sky` is the daylight through the
 * glass at every hour rather than the city after dark. The runtime handles
 * that — see `soleView` in `weights.ts` — by running it on the day's share
 * with a floor under it, and the two scenes set after dark tint it blue
 * instead of crossfading to a night render that does not exist. It also
 * means the glazing solve has nothing to solve against, so `sky` is set
 * from the scene table rather than from the glass mask.
 *
 * What is no longer unlike the others: the closed set used to be one layer
 * short — `office_closed` had no `ow_cove`, and the stage pointed that
 * layer at the base plate in every set rather than refusing the blinds
 * over it. v18 renders it, so all three sets now carry the same thirteen
 * layers and the warning that used to appear on every office load is gone.
 */
export const OFFICE_PROFILE: PlateProfile = {
  gain: {
    ow_general: 291.6,
    ow_linear: 15.04,
    ow_task_a: 6.710,
    ow_task_b: 35.14,
    ow_cove: 3.363,
    ow_meeting: 3.892,
    ow_break: 1.792,
    /**
     * A backlit keypad and a matte panel, and that is all of it now: v18
     * removed the eight uplights that used to wash the planting. The
     * plate's frame mean is 0.00008, a thousandth of the cove's, so the
     * gain is large and the circuit is still the dimmest in the room at
     * 0.0024 alone at full. A large gain on a small plate mean is what a
     * couple of small sources in a wide shot looks like, and it is honest
     * rather than mis-scaled: the derivation divides by the mean, so the
     * lumens do the deciding either way.
     */
    ow_accent: 748.0,
    ow_display: 1.279,

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
   * rendered with the fixtures' warmth already in it — re-measured on
   * v18, the lit pixels run R/B 1.06 to 1.35 before anything is applied,
   * near enough to v17's 1.13 to 1.39 to leave alone. The 0.55 the
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
   * The two circuits the sheet fixes, which are exactly the two dimmable
   * lights with no colour control. Everything else is absent for a
   * reason: `ow_general`, `ow_linear`, `ow_task_a`, `ow_task_b`,
   * `ow_cove` and `ow_meeting` all declare `tunable`, so their colour is
   * real and belongs to the scene, and `ow_display` is in
   * `neutralLayers` above because it is a screen rather than a luminaire.
   *
   * An earlier note here said `ow_cove` would be in this list if it had a
   * plate. That was wrong twice over — it has had a plate in the base set
   * all along, and it is tunable, so it would not belong here in any
   * case.
   */
  fixedTint: { ow_break: 2700, ow_accent: 3000 },
  rgbwLayers: [],
  colourBus: null,
};
