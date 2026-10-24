import type { PlateProfile } from "../profile";

/**
 * The executive cabin's calibration.
 *
 * Derived by `scripts/measure-plates.py --gains`, anchored so `cx_general`
 * alone at full reads about 0.13 mean display luminance, and spread across
 * the other circuits in proportion to `fixtures x lumensEach` from the space
 * file. The two exterior layers are solved inside the glazing mask against
 * the same targets the restaurant uses: night glass median 0.03-0.12, and
 * daytime glass mean 0.65-0.80.
 *
 * The anchor is 0.13 rather than the 0.25 the brief names, the same
 * departure the guest room makes and for the same measured reason. Gain
 * and exposure only ever reach the shader as a product, so the anchor is
 * the whole brightness scale — and at 0.25 the seven scenes ran 0.009 to
 * 0.500 with 9.7% of Evening clipped. At 0.13 they run 0.003 to 0.323
 * with a worst case of 3.3%, which is the guest room's spread and the
 * lobby's clipping.
 *
 * The tidiest set of the five. The widest gain is the two lounge
 * downlights at 160 and the narrowest the cove at 6, a range of
 * twenty-seven — against the showroom's fifty thousand. Nothing here is
 * mis-scaled; the spread is just the difference between twenty-two metres
 * of cove filling most of the frame and two downlights over a sofa in the
 * corner of it.
 */
export const CABIN_PROFILE: PlateProfile = {
  gain: {
    cx_cove: 6.0,
    cx_general: 88.4,
    cx_task: 11.5,
    cx_accent: 97.7,
    cx_feature: 13.1,
    cx_shelf: 6.4,
    cx_plinth: 29.8,
    cx_deco: 53.6,
    cx_lounge: 159.7,

    /**
     * The skyline, and the sun on top of it.
     *
     * `sky` and `day_sky` come straight off the glazing solve. A corner
     * cabin behind one full-height glazed wall is genuinely lit by that
     * wall, so the figure that matches how bright the glass *looks* also
     * lights the room behind it — the lobby had to run its day view at two
     * and a half times the solve because its back half never sees the
     * façade, and this room has no back half.
     *
     * The three sun passes are solved against the scene table rather than
     * against the glass. `day_morning` is the one that matters and is the
     * one held down hardest: it is direct sun across the desk at nine in
     * the morning, it decodes to a frame mean of 0.133 against midday's
     * 0.003, and left on the lumen line it put Welcome two stops above
     * every other scene in the room.
     */
    sky: 1.18,
    day_sky: 4.08,
    day_morning: 0.5,
    day_midday: 8,
    day_evening: 5,
  },
  /**
   * 0.10, the same as the lobby and above the hotel room's 0.08.
   *
   * These plates sit between the two: the cove decodes to a frame mean of
   * 0.245 against the guest room's 0.345 and the lobby's brightest circuit
   * at 0.116. Gain and exposure only ever reach the shader as a product,
   * so this is a reparameterisation rather than a brightness control —
   * what sets the scale is the 0.25 anchor on `cx_general`.
   */
  exposure: 0.1,
  /**
   * 0.40, as in the hotel room, and for the same measured reason: this set
   * was rendered with the fixtures' own warmth already in it. The lit
   * pixels measure R/B 1.03 to 1.89 before anything is applied, so the
   * 0.55 the restaurant and lobby use would land the product between 2.9
   * and 5.3 — sodium. At 0.40 it brackets the 2.80 the lobby's tinted
   * circuits render at, so the rooms agree about what 2700 K looks like.
   */
  tintSaturation: 0.4,
  /**
   * Nothing. Every circuit here is a white fixture whose plate carries a
   * little warmth, including the shelves — they are rendered white so that
   * the browser can tint them any colour, which is the whole point of the
   * one RGB circuit in the room.
   */
  neutralLayers: [],
  /**
   * The five circuits the sheet fixes at 2700 K.
   *
   * Absent are the three tunable ones and the shelves, which are the four
   * whose colour is real: the cove, the downlights and the pendant take
   * whatever the scene or the circadian curve asks for, and the shelves
   * take whatever the colour picker does.
   */
  fixedTint: {
    cx_accent: 2700,
    cx_feature: 2700,
    cx_plinth: 2700,
    cx_deco: 2700,
    cx_lounge: 2700,
  },
  /**
   * Empty, and `colourBus` with it.
   *
   * Those two exist for a room where one RGB circuit drags others onto its
   * hue — the restaurant's Party, where the cove and the architecture
   * follow the wash. Here the colour is deliberately contained: the
   * shelves carry their own `hue` and `sat` on their own state and nothing
   * follows them. A cove that changed colour with the shelves would turn a
   * boardroom into a bar, which is the note the brief makes twice.
   */
  rgbwLayers: [],
  colourBus: null,
};
