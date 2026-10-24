import type { PlateProfile } from "../profile";

/**
 * The hotel guest room's calibration.
 *
 * Derived by `scripts/measure-plates.py --gains`, anchored so `rm_tunable`
 * alone at full reads about 0.13 mean display luminance, and spread across
 * the other circuits in proportion to `fixtures x lumensEach` from the space
 * file. The two exterior layers are solved inside the glazing mask against
 * the same targets the restaurant uses: night glass median 0.03-0.12, and
 * daytime glass mean 0.65-0.80.
 *
 * The anchor is 0.13 rather than the 0.25 the other rooms use, and that is
 * the one number here chosen by looking rather than by solving. Gain and
 * exposure only ever reach the shader as a product, so the anchor is the
 * whole brightness scale — and at 0.25 these plates put Housekeeping at a
 * 0.55 frame mean with 10.4% of it clipped, because the room has six
 * circuits at full in a small pale box where the lobby has two in a large
 * dark one. At 0.13 the eight scenes run 0.007 to 0.382 with a worst case
 * of 3.4% clipped, which is the lobby's spread with the guest room's much
 * wider dynamic range on top of it.
 *
 * The best-behaved set of the four. The widest gain here is the reading
 * spots at 102 and the narrowest the pendant and floor lamp at 1.5, a range
 * of seventy — against the showroom's fifty thousand. Two narrow beams aimed
 * at a pillow leave almost every pixel of their plate black, which is what a
 * large gain on a small plate mean means, and it is honest rather than a
 * mis-scaled render.
 *
 * Both plate sets — `/plates/room` and `/plates/room_closed` — use this one
 * profile. They are the same eleven circuits in the same room with the
 * curtain in two positions, so a gain that is right for one is right for the
 * other; what differs is the per-layer `scale` each manifest records, and
 * that is read from the manifest rather than from here.
 */
export const ROOM_PROFILE: PlateProfile = {
  gain: {
    rm_tunable: 38.6,
    rm_entry: 41.4,
    rm_bedside: 25.2,
    rm_reading: 103.6,
    rm_cove: 7.8,
    rm_bath: 7.5,
    rm_wardrobe: 2.9,
    rm_deco: 1.5,
    rm_night: 1.6,
    /**
     * The two door indicators, and they are on the lumen line like
     * everything else.
     *
     * Eight lumens apiece looked as though it would have to be overridden
     * to make an indicator visible, and measurement says otherwise: the
     * derivation divides by the plate's *mean*, and an LED plate is black
     * everywhere except one dot, so a tiny mean hands back a large gain.
     * Measured in Night with the room at its lowest, switching Do Not
     * Disturb on moves its brightest pixel by +0.65 — an unmistakable red
     * point. The honest number was already the right one.
     */
    rm_dnd: 6.2,
    rm_service: 2.7,

    /**
     * The view, and the sun on top of it.
     *
     * `sky` and `day_sky` come straight off the glazing solve, which this
     * room can afford where the lobby could not: a 48 m² room with one
     * full-height window is genuinely lit by that window, so the figure
     * that matches how bright the glass *looks* also lights the room
     * behind it. The lobby had to run its day view at two and a half times
     * the solve because its back half never sees the façade.
     *
     * One target the solve does not meet, and should not: the night view's
     * p98 comes out at 0.21 against the restaurant's 0.45 floor. That
     * floor describes a skyline of lit tower windows — the restaurant's
     * night plate has a p98/median ratio of 41. This room looks out at a
     * city glow with a ratio of 3.3. The median, which is the sky itself,
     * lands at 0.075 in the middle of the band.
     *
     * The three sun passes sit on top of whichever view is showing, and in
     * this room they barely register: their plates decode to frame means of
     * 0.022, 0.006 and 0.002, so sweeping all three from 3 to 40 moves
     * Housekeeping's frame mean by 0.010 and its clipping by 0.08 points.
     * A lobby's soffit catches a sun patch forty metres from the glass; a
     * guest room's window puts one on about a square metre of carpet.
     * These are therefore a presence setting rather than a calibration, and
     * they are left where the lumen ordering puts them rather than solved
     * against a target they cannot move.
     */
    sky: 2.86,
    day_sky: 5.66,
    day_morning: 3,
    day_midday: 6,
    day_evening: 5,
  },
  /**
   * 0.08, the lowest of the four rooms, because these are the brightest
   * plates. `rm_cove` decodes to a frame mean of 0.345 against the lobby's
   * brightest circuit at 0.116 — twenty-six metres of cove in a small pale
   * room with a marble wall reaches every surface in it, where the same
   * trick in a double-height lobby lights a ceiling nobody is under.
   */
  exposure: 0.08,
  /**
   * 0.40, below the other three rooms' 0.55, and for a measurable reason.
   *
   * Those sets were rendered neutral and take their warmth entirely from
   * the tint. This one was not: the lit pixels of these plates measure R/B
   * 1.04 to 1.42 before anything is applied, because the renderer put the
   * fixtures' own warmth in. At 0.55 the product of the two lands between
   * 2.9 and 4.0, which is sodium. At 0.40 it lands between 2.2 and 2.9,
   * which brackets the 2.80 the lobby's tinted circuits render at — so the
   * two rooms agree about what 2700 K looks like, which is what matters
   * when a client switches between them in the picker.
   */
  tintSaturation: 0.4,
  /**
   * The two door indicators, which are not white and must not be tinted.
   *
   * Everything else in this room is a white fixture whose plate carries a
   * little warmth. These two are a red LED and a green one, and they
   * measure it: the red plate's lit pixels are R/B 95, the green one's are
   * R/B 0.18 and R/G 0.03. Multiplying either by a 2700 K illuminant is
   * multiplying a colour by a colour — it would leave the red untouched and
   * turn the green one olive.
   */
  neutralLayers: ["rm_dnd", "rm_service"],
  /**
   * Every white circuit but the downlights, at the 2700 K the sheet says.
   *
   * These are dimmer-only fixtures with no colour control, so their state
   * carries the engine's default 3000 K and tinting by that would be
   * tinting by an accident. `rm_tunable` is absent because it is the one
   * circuit whose colour is real: it takes whatever the scene, the
   * circadian curve or the guest has asked for.
   */
  fixedTint: {
    rm_entry: 2700,
    rm_bedside: 2700,
    rm_reading: 2700,
    rm_cove: 2700,
    rm_bath: 2700,
    rm_wardrobe: 2700,
    rm_deco: 2700,
    rm_night: 2700,
  },
  rgbwLayers: [],
  colourBus: null,
};
