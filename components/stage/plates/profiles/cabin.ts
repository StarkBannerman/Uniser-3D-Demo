import type { PlateProfile } from "../profile";

/**
 * The executive cabin's calibration.
 *
 * Re-derived against the v3 plates, November 2026.
 *
 * Derived by `scripts/measure-plates.py --gains`, anchored so `cx_general`
 * alone at full reads about 0.25 mean display luminance, and spread across
 * the other circuits in proportion to `fixtures x lumensEach` from the space
 * file. The two exterior layers are solved inside the glazing mask against
 * the same targets the restaurant uses: night glass median 0.03-0.12, and
 * daytime glass mean 0.65-0.80.
 *
 * The anchor is 0.25 now, and the reason it could not be before has been
 * rendered away. v2 ran at 0.13 because at 0.25 the seven scenes clipped
 * up to 9.7% of Evening — and what clipped was the lens glow, which v3
 * takes out of the frame and puts inside each circuit's own layer. The
 * converter records `cx_general` at a scale of 6.12 where v2 recorded
 * 30.6, and `cx_accent` at 4.84 against 30.3. Re-measured at 0.25, the
 * scenes now run 0.0002 to 0.4935 with a worst case of 5.46% in Welcome,
 * and not one pixel of any scene is pure white: peak display luminance
 * across all seven is 0.927.
 *
 * The gains are an order of magnitude larger than v2's and that is the
 * manifest scale moving, not the room — gain and scale only reach the
 * shader as a product. The spread is what to read instead: `cx_lounge` at
 * 904 against `cx_shelf` at 21, a range of about forty-four, against the
 * showroom's fifty thousand. Nothing here is mis-scaled; it is the
 * difference between fourteen metres of concealed strip filling much of
 * the frame and two downlights over a sofa in the corner of it.
 */
export const CABIN_PROFILE: PlateProfile = {
  gain: {
    cx_cove: 55.77,
    cx_general: 530.6,
    cx_task: 22.63,
    cx_accent: 224.96,
    cx_feature: 25.98,
    cx_shelf: 20.65,
    cx_plinth: 59.17,
    cx_deco: 105.7,
    cx_lounge: 903.7,

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
   * Unchanged through the v3 re-balance, because exposure and gain only
   * ever reach the shader as a product: moving one is moving the other,
   * and the whole of the change is in `gain` above where it can be read
   * circuit by circuit. What sets the scale is the 0.25 anchor on
   * `cx_general`.
   *
   * The plates are dimmer than they were now the lens glow is gone — the
   * cove decodes to a frame mean of 0.052 against v2's 0.245 — which is
   * exactly why the same anchor that blew v2 out is comfortable here.
   */
  exposure: 0.1,
  /**
   * 0.40, as in the hotel room, and for the same measured reason: this set
   * was rendered with the fixtures' own warmth already in it. Re-measured
   * on v3, the lit pixels run R/B 1.01 to 2.15 before anything is applied,
   * so the 0.55 the restaurant and lobby use would push the product past
   * sodium. At 0.40 the fixed circuits land at 2.10 to 2.65 — the shelves
   * at 2.59, the decorative pair the outlier at 4.47 because their plate
   * is already R/B 2.15 — which brackets the 2.80 the lobby's tinted
   * circuits render at, so the rooms agree about what warm white is.
   *
   * Measure that product in linear light, as above, and not off the
   * rendered frame. AgX desaturates highlights by design, so a bright
   * warm surface reads R/B below 1 on the output while the light on it is
   * strongly warm — the shelves measure 0.83 that way and 2.59 this way,
   * and only the second figure is about the lighting.
   */
  tintSaturation: 0.4,
  /**
   * Nothing. Every circuit here is a white fixture whose plate carries a
   * little warmth, the shelves included — and since the client ruled
   * colour out of the shelves, there is no longer any circuit in this room
   * that wants its plate left untinted.
   */
  neutralLayers: [],
  /**
   * Six circuits now: five at 2700 K, and the shelves at 3000 K.
   *
   * Absent are only the three tunable ones — the cove, the downlights and
   * the desk light — whose colour is real and comes from the scene or the
   * circadian curve. The shelves used to be absent too, because they were
   * the room's one RGB circuit; they are fixed warm white now, which is
   * the change the brief asks for and the reason `rgb` and `tunable` came
   * off the device as well.
   */
  fixedTint: {
    cx_accent: 2700,
    cx_feature: 2700,
    cx_plinth: 2700,
    cx_deco: 2700,
    cx_lounge: 2700,
    /**
     * 3000 K, and the shelves no longer choose.
     *
     * They used to be the one RGB circuit in the room and the scenes used
     * it — amber in Relax, deep blue in Evening. The client has decided
     * against it: shelves are warm white everywhere, so the colour comes
     * off the device as well as out of the scenes and the plate is tinted
     * from here instead. 3000 K rather than the 2700 the other five take,
     * because it is what the sheet specifies for this circuit and it
     * keeps books legible rather than sepia.
     */
    cx_shelf: 3000,
  },
  /**
   * Empty, and `colourBus` with it.
   *
   * Those two exist for a room where one RGB circuit drags others onto its
   * hue — the restaurant's Party, where the cove and the architecture
   * follow the wash. This room has no RGB circuit left to do it. The
   * shelves were the only one, and the client's answer to "where should
   * the colour go" turned out to be nowhere: a shelf is for finding a
   * book on, and warm white is the colour that makes that easy.
   */
  rgbwLayers: [],
  colourBus: null,
};
