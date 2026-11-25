import type { PlateProfile } from "../profile";

/**
 * The hotel restaurant's calibration, for the v8h re-render.
 *
 * Not lumen-proportional, and deliberately so. `--gains` divides a
 * circuit's lumen share by its plate mean, and v8 changed what a plate
 * *contains*: every circuit now carries its own fixtures, so a downlight
 * lens, a strip or a pendant globe glows inside its own layer and is dark
 * when that circuit is at zero. A few hundred pixels of bright lens then
 * outweigh the wash the circuit actually throws, and the lumen line puts
 * the decorative layers far too high and the ambient ones far too low —
 * which is what produced the overexposed scenes in the first v8 pass.
 *
 * So each circuit is solved alone at full against a target chosen by what
 * the circuit is *for*, with `measure-plates.py`'s own anchor maths:
 *
 *   0.25  the three ambient layers — general, track, cove
 *   0.12  the four accent layers — feature, shelf, arch, table — and rgb
 *   0.06  the pendants, which are an object in frame rather than a layer
 *
 * Measured alone at full, in that order: 0.250, 0.247, 0.247 / 0.118,
 * 0.113, 0.035, 0.118, 0.131 / 0.060. `rs_general` anchors the set and
 * clips 2.60% of the frame at full, which is its own forty-two lenses.
 *
 * One layer misses its target and is capped instead. `rs_arch` reads 0.035
 * against 0.12, and reaching it needs a gain near 55,000 — at which the
 * layer amplifies path-tracer sampling noise rather than lighting
 * anything: high-frequency energy across a ceiling region containing no
 * fixture rises 85x between 3,000 and that figure. Its plate is nearly
 * empty, a mean of 0.00007, holding one lit object on the right of frame
 * and no architectural wash at all where v7 held 256 times the linear
 * energy. 8,000 lets that object read without flaring. This wants a
 * re-render rather than a gain.
 *
 * v8h re-rendered `rs_general` alone, to make the lit lenses read: its
 * plate mean rose 1.10x and its lit coverage 81% -> 87%, which moved the
 * anchor from 669.1 to 512.5. Every other circuit's plate is identical to
 * within encoder noise, so every other gain is unchanged — the room is the
 * brightness it was, and the scene table below is the only thing moving it.
 *
 * The two exterior layers are measured inside a mask of the glazing rather
 * than a box over the right of frame, and the night figure is a median
 * rather than a mean. See `scripts/measure-plates.py`, which carries the
 * targets:
 *
 *   sky     01:00, circuits off — glass median 0.03-0.12, p98 above 0.45.
 *   sky_day 13:00, circuits off — glass mean 0.65-0.80, frame not clipping.
 *
 * Both are `--solve` output against this render: 0.075 and 0.725.
 */
export const RESTAURANT_PROFILE: PlateProfile = {
  gain: {
    rs_general: 512.5,
    rs_tunable: 1058.9,
    rs_cove: 1577.0,
    rs_pendant: 2.5753,
    rs_arch: 8000,
    rs_feature: 10.9,
    rs_table: 138.0,
    /**
     * The bottle displays, the back bar and the wine wall, split out of
     * `rs_feature` in v8. Its lumen share would be 4.0; 10.0 is what puts
     * it on the 0.12 accent target, and at that gain the shelves clip
     * 1.42% of the frame — lit glass rather than glare.
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
    sky: 6.841,
    sky_day: 44.594,
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
