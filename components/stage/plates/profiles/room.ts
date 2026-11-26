import type { PlateProfile } from "../profile";

/**
 * The hotel guest room's calibration.
 *
 * Re-derived against the v12 plates, November 2026.
 *
 * Derived by `scripts/measure-plates.py --gains`, anchored so `rm_tunable`
 * alone at full reads about 0.25 mean display luminance, and spread across
 * the other circuits in proportion to `fixtures x lumensEach` from the space
 * file. The two exterior layers are solved inside the glazing mask against
 * the same targets the restaurant uses: night glass median 0.03-0.12, and
 * daytime glass mean 0.65-0.80, and the v12 re-render left both in band —
 * they are unchanged here.
 *
 * The anchor is 0.25 now, the same as every other room, and the reason the
 * previous set had to run at 0.13 has been rendered away. That anchor was
 * chosen because these plates put Housekeeping at a 0.55 frame mean with
 * 10.4% of the frame clipped, and the clipping was two channels and three
 * deep in places. The v12 plates are a different exposure: the converter
 * records `rm_tunable` at a scale of 6.15 where v11 recorded 31.03, and
 * `rm_cove` at 11.32 where it recorded 37.33. Decoded, the brightest circuit
 * in the room is now a frame mean of 0.155 against the old 0.345. So the
 * same 0.25 anchor that blew the old set out lands the new one inside the
 * band every other room sits in.
 *
 * Measured at these gains, nothing in this room reaches white in any scene.
 * The peak display luminance across all eight is 0.9292, in Housekeeping,
 * and across every circuit alone at full it is 0.9295, in `rm_cove`. What
 * the clip counter reports — 15.5% of Housekeeping, 6.35% of `rm_cove` on
 * its own — is the red channel railing under a 2700 K tint and nothing else:
 * not one pixel in the room has a second channel at the rail, let alone a
 * third. A warm fixture with a saturated red channel is what a warm fixture
 * looks like.
 *
 * The gains are two orders of magnitude larger than v11's and that is the
 * manifest scale moving, not the room. Gain and scale only reach the shader
 * as a product. The spread is what to read instead: `rm_tunable` at 603
 * against `rm_wardrobe` at 8.8, a range of about seventy, unchanged from the
 * old set and against the showroom's fifty thousand. Two narrow beams aimed
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
    rm_tunable: 602.8,
    rm_entry: 396.2,
    rm_bedside: 87.65,
    rm_reading: 465.7,
    rm_cove: 53.07,
    rm_bath: 23.57,
    rm_wardrobe: 8.843,
    rm_deco: 14.46,
    rm_night: 15.14,
    /**
     * The two door indicators, and they are on the lumen line like
     * everything else.
     *
     * Eight lumens apiece looked as though it would have to be overridden
     * to make an indicator visible, and measurement says otherwise: the
     * derivation divides by the plate's *mean*, and an LED plate is black
     * everywhere except one dot, so a tiny mean hands back a large gain.
     * Re-measured on the v12 plates: in Night, with the room at its lowest,
     * switching Do Not Disturb on takes its own pixels from 0.020 to 0.515
     * mean and its peak from 0.42 to 0.80 — an unmistakable red point. The
     * green one does the same work against a far harder background, going
     * 0.199 to 0.620 in Housekeeping with the curtains back at midday. The
     * honest number was already the right one.
     */
    rm_dnd: 18.95,
    rm_service: 8.156,

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
   * 0.08, and left alone through the v12 re-balance.
   *
   * Exposure and gain only ever reach the shader as a product, so moving
   * one is moving the other and the split between them is bookkeeping. The
   * whole of the v12 change is therefore in `gain` above, where it can be
   * read circuit by circuit, rather than smeared across both.
   *
   * `rm_cove` is still the brightest circuit in the room — it decodes to a
   * frame mean of 0.155, against the lobby's brightest at 0.116. Twenty-six
   * metres of cove in a small pale room with a marble wall reaches every
   * surface in it, where the same trick in a double-height lobby lights a
   * ceiling nobody is under. v12 made it a hidden cove rather than a lit
   * line, which more than halved the number without changing that.
   */
  exposure: 0.08,
  /**
   * 0.40, below the other three rooms' 0.55, and for a measurable reason.
   *
   * Those sets were rendered neutral and take their warmth entirely from
   * the tint. This one was not: the lit pixels of these plates measure R/B
   * 1.03 to 1.44 before anything is applied, because the renderer put the
   * fixtures' own warmth in. At 0.55 the product of the two lands around
   * 2.9 to 4.0, which is sodium. At 0.40 it lands between 2.14 and 2.98,
   * which brackets the 2.80 the lobby's tinted circuits render at — so the
   * two rooms agree about what 2700 K looks like, which is what matters
   * when a client switches between them in the picker.
   *
   * Re-measured on the v12 plates and unchanged: the re-render moved the
   * native warmth of the white circuits by at most 0.02 in R/B, so the
   * figure that was right for v11 is right here.
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
