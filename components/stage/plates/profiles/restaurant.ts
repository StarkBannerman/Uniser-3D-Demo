import type { PlateProfile } from "../profile";

/**
 * The hotel restaurant's calibration, for the v8 re-render.
 *
 * Derived by `scripts/measure-plates.py --gains` against `fixtures x
 * lumensEach` from the space file, anchored so `rs_general` alone at full
 * reads a frame mean of 0.25 — measured at 0.253, with 2.6% of pixels
 * clipped.
 *
 * v8 changed what a layer *is*, which is why these numbers moved so far.
 * Every circuit now carries its own fixtures: a downlight lens, a strip, a
 * pendant globe glows only inside its own layer, and a circuit at zero
 * shows its fixtures unlit. That makes a plate's mean a worse proxy for
 * the light a circuit casts than it already was, because the few hundred
 * pixels of a bright lens can outweigh the wash it throws. Two layers are
 * off the lumen line for exactly that reason:
 *
 * `rs_pendant` at 0.51. Eighteen 280-lumen globes are the smallest circuit
 * in the room and the largest object in frame; its plate decodes to a mean
 * of 0.292, a hundred times `rs_general`.
 *
 * `rs_arch` at 600 against a lumen-derived 5841. Its plate is nearly empty
 * — a mean of 0.00007 — and the derivation divides by that. See the note
 * on the space file's `rs-arch`: in v8 this layer holds one lit object on
 * the right of frame and no architectural wash at all, where v7 held 256
 * times the linear energy. 600 lets that object read without flaring; the
 * lumen figure would blow its brightest 256 pixels to white and still
 * light nothing else. This wants a re-render rather than a gain.
 *
 * The two exterior layers are measured inside a mask of the glazing rather
 * than a box over the right of frame, and the night figure is a median
 * rather than a mean. See `scripts/measure-plates.py`, which carries the
 * targets:
 *
 *   sky     01:00, circuits off — glass median 0.03-0.12, p98 above 0.45.
 *   sky_day 13:00, circuits off — glass mean 0.65-0.80, frame not clipping.
 */
export const RESTAURANT_PROFILE: PlateProfile = {
  gain: {
    rs_general: 669.1,
    rs_tunable: 1058.9,
    rs_cove: 1577.0,
    rs_pendant: 2.5753,
    rs_arch: 8000,
    rs_feature: 10.9,
    rs_table: 138.0,
    /**
     * The bottle displays, the back bar and the wine wall, split out of
     * `rs_feature` in v8. 4.9 is its lumen share and it happens to land
     * where the brief asks — the shelves read at a p99 of 0.75 with half
     * a per cent of pixels clipped, which is lit glass rather than glare.
     */
    rs_shelf: 10.0,
    rs_rgb: 73,
    /**
     * `sky_day` carries the daytime view and the light coming in with it, so
     * it is the one that has to make the room read as naturally lit. `sky`
     * is the night view and sits lower, because a city at night should be
     * visible through the glass without lighting the dining room. The three
     * sun angles are accents on top of whichever view is showing;
     * `day_morning` needs 600 to register at all, its plate decoding to a
     * mean of 0.00001, which is close enough to empty that it is listed
     * mostly so the asymmetry is on the record.
     */
    sky: 6.7,
    sky_day: 43.5,
    day_morning: 600,
    day_midday: 25,
    day_evening: 15,
  },
  exposure: 0.25,
  tintSaturation: 0.55,
  /**
   * The pendants are smoked amber glass and the globes are in shot, so that
   * warmth is a property of the object rather than of the beam; tinting it
   * again by a 2000 K circuit colour applies it twice.
   */
  fixedTint: { rs_shelf: 3000 },
  neutralLayers: ["rs_pendant"],
  /**
   * A cove run and a linear architectural profile are almost always RGBW in
   * a room specified like this — the white dies light dinner, the colour
   * dies are why the same floor can be sold for a party.
   */
  rgbwLayers: ["rs_cove", "rs_arch"],
  colourBus: "rs-rgb",
};
