import type { PlateProfile } from "../profile";

/**
 * The hotel common area's calibration.
 *
 * Re-balanced against the v16 plates, November 2026.
 *
 * Started from `scripts/measure-plates.py --gains`, spread across the
 * circuits in proportion to `fixtures x lumensEach` from the space file,
 * then held against what the room actually looked like before the
 * re-render. The two exterior layers are solved inside the glazing mask
 * against the same targets the restaurant uses: night glass median
 * 0.03-0.12, and daytime glass mean 0.65-0.80.
 *
 * One correction worth recording, because this header used to claim it.
 * `ca_tunable` is *not* anchored at 0.25 and never was. On the v15 plates
 * the shipped gain of 35.1 put it at 0.1502 alone at full, and on v16 the
 * same gain reads 0.1187 — the lens glow came out of that layer and the
 * converter's scale went 7.47 to 6.22 with it. The lobby's brightness has
 * always been set by its scene table rather than by a single-circuit
 * anchor, which the exterior gains below already said out loud. So the
 * gain here is solved to reproduce what v15 put on screen, 51.26, and the
 * seven scenes land within 6.4% of where they were. Anchoring at a true
 * 0.25 would need 134 and would roughly double every scene in the room.
 *
 * `ca_deco` stays at 6.4 and is the one circuit meant to change. v16 lights
 * every candle on the chandelier, puts a sparkle inside each crystal tier
 * and a glow down onto the lounge, and hangs four opal globes over the
 * table; at the same gain the circuit decodes 2.4x brighter than v15
 * (0.0234 to 0.0570 alone at full). Evening clips 0.45% of the frame with
 * it at 100, against the 2% the brief allows, so it keeps the whole rise.
 *
 * `ca_accent` stays at 2916, and the art wall it is supposed to light is
 * dark — see the note on that gain below. This is the only figure in the
 * file that is waiting on a re-render rather than on a decision.
 *
 * The widest gap is still the accent circuit, and that is honest: thirty
 * narrow spots on artwork and plants in a wide shot leave almost every
 * pixel of their plate black.
 */
export const LOBBY_PROFILE: PlateProfile = {
  gain: {
    ca_tunable: 51.26,
    ca_arch: 3.6,
    ca_deco: 6.4,
    ca_feature: 7.9,
    /**
     * Unchanged at 2916, and it cannot fix what is wrong here.
     *
     * v16 replaced the art wall's two 260 W spots with one centred 420 W
     * profile, and the wall went dark: its pixels decode to 0.00000 in
     * this layer against v15's 0.00742, which is not dimmer, it is
     * nothing. In the Event scene the wall reads 0.231 where v15 read
     * 0.758 — 30% of it, and all of that from other circuits.
     *
     * The cause is in `render/lobby_build_v16.py:463`. `cyl()` places a
     * cylinder with its *base* at the point given, so `art_profile_head`
     * spans z 4.40 to 4.60, and `art_profile` sits at z 4.52 — the spot is
     * inside its own closed metal housing, on its axis. A gain cannot
     * reach light that was never traced: taking this layer to 150 000
     * brings the wall to 0.125, still a sixth of v15, and by then the
     * plants and floor pools the circuit also lights are at 23x.
     *
     * So it is left where it is, which keeps everything the circuit still
     * reaches at exactly its v15 brightness, and the fix belongs in the
     * next render — drop the light below the housing, or shorten it.
     */
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
   * Measured scene means on the v16 plates, with the v15 figure each one
   * replaces beside it — those were stale by a wide margin and are
   * corrected here rather than carried forward:
   *
   *   Night 0.151 (0.145)    Cleaning 0.355 (0.183)   Event 0.250 (0.233)
   *   Morning 0.267 (0.266)  Evening  0.280 (0.276)   Welcome 0.381 (0.375)
   *   Day 0.298 (0.299)
   *
   * Worst-case clipping is 4.79%, in Welcome, and it is single-channel
   * everywhere: no pixel in any scene of this room has two channels at the
   * rail, and the peak display luminance across all seven is 0.926.
   *
   * The two that moved are both deliberate. Cleaning nearly doubled because
   * it now runs every circuit at full instead of three. Evening and Event
   * rose a few per cent on the new decoratives. Day sits above Evening by
   * mean and the ranking is not the point: Day is cool and even where
   * Evening is warm and pooled, which is the thing a mean cannot see.
   */
  exposure: 0.1,
  tintSaturation: 0.55,
  /**
   * Six of the seven circuits are fixed warm white on the sheet, and the
   * plates were rendered that way — re-measured on v16, the cove is R/B
   * 1.54, the accent 2.03, the decoratives 1.64 (up from 1.28: the new
   * chandelier candles are warmer than what they replaced) and the water
   * wall 0.45, which is blue and must keep that too. A 2700 K tint on top
   * of any of them is R/B 2.8
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
