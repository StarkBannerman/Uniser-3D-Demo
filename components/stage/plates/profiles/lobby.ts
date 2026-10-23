import type { PlateProfile } from "../profile";

/**
 * The hotel common area's calibration.
 *
 * Derived by `scripts/measure-plates.py --gains`, anchored so `ca_tunable`
 * alone at full reads about 0.25 mean display luminance, and spread across
 * the other circuits in proportion to `fixtures x lumensEach` from the space
 * file. The two exterior layers are solved inside the glazing mask against
 * the same targets the restaurant uses: night glass median 0.03-0.12, and
 * daytime glass mean 0.65-0.80.
 *
 * This is the best-behaved of the three plate sets. Nothing is off by orders
 * of magnitude the way the restaurant's track and the showroom's zones were
 * — the widest gap here is the accent circuit at 1192, and that is honest:
 * thirty narrow spots on artwork and plants in a wide shot leave almost
 * every pixel of their plate black.
 */
export const LOBBY_PROFILE: PlateProfile = {
  gain: {
    ca_tunable: 35.1,
    ca_arch: 3.6,
    ca_deco: 6.4,
    ca_feature: 7.9,
    ca_accent: 2916,
    ca_cove: 12.9,
    ca_facade: 17.4,
    /**
     * The view and the sun, separately.
     *
     * `day_sky` is the blue outside seen through the glass and `sky` is the
     * city after dark; they crossfade, and a scene that names an hour sets
     * them directly. The three sun passes sit on top of whichever is
     * showing and are accents rather than illumination — a lobby this size
     * is lit by its own fixtures even at noon.
     */
    sky: 1.67,
    /**
     * The view, and the sun on top of it.
     *
     * `day_sky` runs at about two and a half times what the glazing solve
     * asks for. That solve matches how bright the sky *looks* through the
     * glass and got that right while leaving the room behind it dark — at
     * 1 PM the ceiling was black and the lobby read dimmer than it did at
     * midnight. These layers carry the daylight bouncing in as well as the
     * view, so they are worth more than the view alone says.
     *
     * The three suns are solved against the scene table rather than
     * against the glass: `day_midday` so Day lands at 0.32, and
     * `day_morning` low because by the time the sky is at 70% Morning is
     * already at 0.270 and the brief wants about 0.27. At 2 the early sun
     * is visible in the frame without pushing Morning up level with Day,
     * which is also how a low sun at half past seven actually behaves.
     */
    day_sky: 6.46,
    day_morning: 2,
    day_midday: 8.1,
    day_evening: 4.5,
  },
  /**
   * 0.10, which is the lowest of the three rooms and for a plain reason:
   * the lobby's plates are the brightest. Six of its seven circuits decode
   * to frame means an order of magnitude above the restaurant's, because
   * they light a pale double-height room with a polished floor rather than
   * a dark dining one.
   *
   * Measured scene means here: Night 0.14, Day 0.19, Morning 0.23,
   * Cleaning 0.24, Evening 0.25, Welcome 0.25, Event 0.26, with worst-case
   * clipping at 2.1%. Day sits below Evening by mean and reads brighter
   * anyway, which is the thing a mean cannot see: it is cool and even where
   * Evening is warm and pooled.
   */
  exposure: 0.1,
  tintSaturation: 0.55,
  /**
   * Six of the seven circuits are fixed warm white on the sheet, and the
   * plates were rendered that way — the cove measures R/B 1.50, the accent
   * 1.35, the decoratives 1.28. A 2700 K tint on top of that is R/B 2.8
   * again, and the two multiply into something closer to sodium than to a
   * hotel lobby. So the circuits that already carry their colour keep it,
   * and only the tunable downlights are tinted, which is also the only
   * circuit whose colour the client can actually change.
   */
  neutralLayers: ["ca_cove", "ca_deco", "ca_accent", "ca_feature"],
  /**
   * The two circuits that are fixed warm white and whose plates are not.
   *
   * `ca_cove`, `ca_deco`, `ca_accent` and `ca_feature` were rendered with
   * their colour in them and are left alone above. These two came out
   * neutral, so they need the 2700 K the sheet specifies — and they need it
   * stated, because a dimmer-only fixture's state carries the engine's
   * default 3000 K and tinting by that is tinting by an accident.
   */
  fixedTint: { ca_arch: 2700, ca_facade: 2700 },
  rgbwLayers: [],
  colourBus: null,
};
