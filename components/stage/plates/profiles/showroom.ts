import type { PlateProfile } from "../profile";

/**
 * The luxury car showroom's calibration, for the v14 re-render.
 *
 * Every gain here is a measurement: each circuit rendered alone at full
 * output, through this file's own exposure and the AgX curve, bisected
 * until the frame mean hits the target its job implies.
 *
 *   0.25  the two circuits that light the room — general and linear
 *   0.12  the ones that light a thing — spots, track, tunable, the
 *         architectural line and the six per-vehicle circuits
 *   0.06  the ones that are decoration — pendants, floor, accent, colour
 *
 * v14 moved the layers a long way relative to each other, which is why no
 * old value survived. `sr_spot` went from twelve narrow beams that barely
 * registered to a wrap around the turntable car plus three low front
 * spots: its plate mean rose 65x and its gain fell from 52 263 to 355.
 * `sr_floor` gained the ring on the floor and rose 5.1x. `sr_general`
 * halved, `sr_arch` lost the pillar washes and gained the desk grazer, and
 * `sr_linear` moved its output off the diffuser and onto the floor.
 *
 * `sr_deco` is new: three opal globes over the reception desk. Like any
 * decorative circuit whose fixtures are in shot, its plate mean is carried
 * by a few hundred very bright pixels — 0.0369 against `sr_general`'s
 * 0.0164 from three globes against sixty-four downlights — so 0.06 is the
 * target that makes it read as glass rather than as a lamp.
 *
 * The six vehicle circuits are the exception worth knowing about, and the
 * reason is in their plates. Four heads aimed at one car in a 900 m² wide
 * shot leave 76% to 99% of the frame black, so a frame-mean target spends
 * all of its light on the few hundred pixels that are lit. At the 0.12
 * these are solved to, each car's own hotspot clips hard with the circuit
 * alone at full: zone 6 at 62% of the disc, zone 1 at 57%, zone 5 at 56%,
 * zone 4 at 34%. The scenes carry them below full for that reason, and the
 * figures are in the space file beside the levels. A frame mean is the
 * wrong statistic for a circuit that is deliberately not lighting the
 * frame, and the honest fix is a target measured at the car.
 *
 * Two things are deliberately absent. There are no RGBW layers: the sheet
 * puts colour on the feature-wall fins and nowhere else, so `sr_rgb` tints
 * its own plate and nothing follows it — which is also what keeps the cars
 * white under a coloured wall in New Car Launch. And there are no neutral
 * layers, because nothing here was rendered with its lamp colour baked in.
 */
export const SHOWROOM_PROFILE: PlateProfile = {
  gain: {
    sr_general: 50.56,
    sr_linear: 9.449,

    sr_spot: 355.4,
    sr_track: 409.0,
    sr_tunable: 2370,
    sr_arch: 2.996,

    /**
     * Six four-head circuits, solved on the car and then on the room.
     *
     * Not on the frame. A frame-mean target asks a circuit that lights one
     * vehicle to light the whole picture, and the only way it can is by
     * amplifying what is nearly nothing everywhere else: at the gains that
     * produced, selecting a car covered the walls in grey denoiser cloud,
     * put visible 8-bit banding in the floor, and — the red coupe's spots
     * bouncing red light off red paint — turned the entire showroom pink.
     *
     * Each gain here is the lower of two measurements, with the noise gate
     * below already applied:
     *
     *   the car   the circuit alone at full reads a mean of 0.45 inside
     *             its own hotspot box, +/-8% of the frame
     *   the room  the same circuit puts no more than 0.06 on everything
     *             outside all six boxes
     *
     * Whichever binds first wins, because a vehicle circuit that lights
     * the room is not doing its job however bright the car gets.
     *
     *   zone  gain       car box  room   contrast  binds on
     *   1     459.3      0.423    0.060  7.0x      room
     *   2     2123       0.097    0.060  1.6x      room
     *   3     14030      0.069    0.060  1.1x      room
     *   4     4263       0.220    0.060  3.7x      room
     *   5     23130      0.450    0.047  9.6x      car
     *   6     1490000    0.450    0.016  27.7x     car
     *
     * Two of them cannot isolate their vehicle at any gain. `sr_zone_2`
     * and `sr_zone_3` reach 1.6x and 1.1x their own spill, because in v14
     * their brightest pixels are not the car — the energy-weighted
     * centroid of each one's top 1% sits at v 0.33 and v 0.28, up on the
     * ceiling, which is the lit fixture rather than the vehicle under it.
     * No gain fixes a pass that puts its light somewhere else. Those two
     * want re-aiming in the render.
     */
    sr_zone_1: 459.3,
    sr_zone_2: 2123,
    sr_zone_3: 14030,
    sr_zone_4: 4263,
    sr_zone_5: 23130,
    sr_zone_6: 1490000,

    sr_deco: 162.9,
    sr_floor: 4.641,
    sr_accent: 3.237,
    sr_rgb: 107.4,
  },
  /**
   * 0.20. Gain and exposure are one calibration — only their product
   * matters — and the gains above were solved against this number, so
   * moving it invalidates all sixteen of them at once.
   */
  exposure: 0.2,
  tintSaturation: 0.55,
  /**
   * The pendants are opal glass and the globes are in shot, so their
   * warmth is a property of the object. The device carries no `tunable`
   * range for the same reason; this is the other half of that statement.
   */
  fixedTint: { sr_deco: 2700 },
  neutralLayers: [],
  rgbwLayers: [],
  colourBus: "sr-rgb",
  /**
   * The six vehicle circuits, and only those.
   *
   * Each one lights a single car in a wide shot and needs a gain in the
   * thousands to do it, which turned what is nearly nothing across the
   * rest of its plate into something: grey denoiser cloud over the walls,
   * 8-bit banding in the floor, and — because the light bouncing off a
   * red car is red — a pink room whenever the red coupe was selected.
   * The gate removes the bounce and leaves the car.
   */
  noiseFloor: [
    "sr_zone_1",
    "sr_zone_2",
    "sr_zone_3",
    "sr_zone_4",
    "sr_zone_5",
    "sr_zone_6",
  ],
};
