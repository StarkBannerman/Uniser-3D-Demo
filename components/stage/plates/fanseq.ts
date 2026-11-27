/**
 * A ceiling fan that actually turns.
 *
 * The overlay path this replaces composites one motion-blurred still inside
 * `fan_rect`: the fan reads as "running" and never as *turning*, and because
 * the still is a separate render of the same room, any crossfade between it
 * and the base plate shows both fans at once. A sequence fixes both — the
 * blades move, and every frame is the base render with only the blades in a
 * different place, so there is nothing to double.
 *
 * The assets are one atlas per *circuit that lights the fan*, not one atlas
 * of the finished picture, and that is the whole reason this works with the
 * rest of the renderer. A finished picture would have to be re-rendered for
 * every scene, every dimmer level and every colour temperature. An atlas per
 * circuit goes through the same sum as the base plates — same gain, same
 * level, same tint — so the fan is lit by whatever the room is doing,
 * including being dark when the room is dark.
 *
 * Nothing here is loaded until the fan is first switched on, and a space
 * with no `*_fanseq` directory simply never loads one and keeps the still.
 * That is how the bedroom and the living room go on working untouched.
 */

/** `fanseq.json`, as the converter writes it. */
export interface FanSeqFile {
  /** How many frames the sequence holds; `frames` wraps to 0. */
  frames: number;
  cols: number;
  rows: number;
  /** Degrees of rotation the sequence covers — one blade period, not a turn. */
  period_deg: number;
  /** Decode exponent. Must match the base manifest's. */
  gamma: number;
  /** Tile size in pixels, HD then SD. */
  tile: [number, number];
  tile_sd: [number, number];
  /** Where the fan sits, v measured downward, as `hotspots.json` does. */
  rect_uv: [number, number, number, number];
  rect_px: [number, number, number, number];
  plate_size: [number, number];
  /** The circuits that light the fan, with the scale each atlas decodes by. */
  layers: Record<string, { scale: number }>;
  /**
   * A hash of the atlases, written by `scripts/stamp-plates.mts`.
   *
   * The atlases sit under `hd/` and `sd/`, which `next.config.mjs` serves
   * `immutable` for a year, and their paths do not change between
   * renders. This file is not matched by that rule, so it is always fresh
   * and is the right place to keep the pointer — exactly as a plate set's
   * `manifest.json` does for its own layers.
   */
  rev?: string;
  note?: string;
}

export interface FanSeq {
  file: FanSeqFile;
  /** One atlas per layer, in the order the caller asked for them. */
  order: string[];
  images: (ImageBitmap | HTMLImageElement)[];
  /** Atlas dimensions, which are `tile * cols` by `tile * rows`. */
  width: number;
  height: number;
}

/** The directory a space's sequence would live in, by convention. */
export function fanSeqDir(baseDir: string): string {
  return `${baseDir}_fanseq`;
}

/**
 * Is the file well-formed enough to drive the shader?
 *
 * Checked rather than trusted, because a half-written sequence should fall
 * back to the still rather than draw a torn fan. The grid has to be able to
 * hold the frames, the rect has to be a real rectangle inside the plate, and
 * every layer has to carry a scale — the shader divides by none of these but
 * it does index by all of them.
 */
export function fanSeqUsable(f: FanSeqFile): boolean {
  const okNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  if (!okNum(f.frames) || f.frames < 2) return false;
  if (!okNum(f.cols) || !okNum(f.rows) || f.cols < 1 || f.rows < 1) return false;
  if (f.cols * f.rows < f.frames) return false;
  if (!okNum(f.period_deg) || f.period_deg <= 0) return false;
  if (!okNum(f.gamma) || f.gamma <= 0) return false;
  for (const t of [f.tile, f.tile_sd]) {
    if (!Array.isArray(t) || t.length !== 2 || !t.every(okNum) || t.some((v) => v < 1)) return false;
  }
  const r = f.rect_uv;
  if (!Array.isArray(r) || r.length !== 4 || !r.every(okNum)) return false;
  if (!(r[2] > r[0]) || !(r[3] > r[1])) return false;
  if (r[0] < 0 || r[1] < 0 || r[2] > 1 || r[3] > 1) return false;
  const layers = f.layers;
  if (!layers || typeof layers !== "object") return false;
  const names = Object.keys(layers);
  if (names.length === 0) return false;
  return names.every((n) => okNum(layers[n]?.scale));
}

/**
 * Fetch a space's sequence, or null if it has none.
 *
 * Probed rather than declared, the way `PlateStage` probes the overlay set:
 * a 404 is the ordinary answer for a room whose fan has not been rendered
 * yet, not an error worth showing anybody.
 *
 * `want` is the layer list the renderer can actually substitute — the base
 * manifest's layers, in sampler order. A sequence naming a layer this plate
 * set does not have is skipped rather than refused, because the sequence and
 * the plates are re-rendered separately and the useful response to a stale
 * extra layer is the other four atlases.
 */
export async function loadFanSeq(
  dir: string,
  tier: "hd" | "sd",
  want: readonly string[],
  decode: (url: string) => Promise<ImageBitmap | HTMLImageElement>,
): Promise<FanSeq | null> {
  let file: FanSeqFile;
  try {
    const res = await fetch(`${dir}/fanseq.json`);
    if (!res.ok) return null;
    file = (await res.json()) as FanSeqFile;
  } catch {
    return null;
  }
  if (!fanSeqUsable(file)) {
    console.warn(`plates: ${dir}/fanseq.json is not usable — keeping the still fan`);
    return null;
  }
  const order = Object.keys(file.layers).filter((n) => want.includes(n));
  if (order.length === 0) return null;
  let images: (ImageBitmap | HTMLImageElement)[];
  try {
    const v = file.rev ? `?v=${file.rev}` : "";
    images = await Promise.all(order.map((n) => decode(`${dir}/${tier}/${n}.webp${v}`)));
  } catch (e) {
    console.warn(`plates: ${dir} atlases would not load — keeping the still fan`, e);
    return null;
  }
  const [tw, th] = tier === "hd" ? file.tile : file.tile_sd;
  const width = tw * file.cols;
  const height = th * file.rows;
  // Every atlas has to be the same size, because they go into one array
  // texture and GL will not take a ragged one.
  const bad = images.findIndex((im) => im.width !== width || im.height !== height);
  if (bad >= 0) {
    console.warn(
      `plates: ${dir}/${tier}/${order[bad]}.webp is ${images[bad].width}x${images[bad].height},` +
        ` expected ${width}x${height} — keeping the still fan`,
    );
    for (const im of images) if ("close" in im) im.close();
    return null;
  }
  return { file, order, images, width, height };
}

/* ------------------------------------------------------------------ */
/* Motion                                                              */
/* ------------------------------------------------------------------ */

/** Revolutions per second at off, low, medium and high. */
export const FAN_RPS = [0, 0.9, 1.6, 2.4] as const;

/** Motion-blur taps at off, low, medium and high. */
export const FAN_TAPS = [1, 1, 3, 5] as const;

/** Seconds to reach speed, and to come back down. */
export const SPIN_UP_S = 1.5;
export const SPIN_DOWN_S = 3;

/**
 * The fan's angle, in turns, and how fast it is going.
 *
 * Kept as a plain object the render loop mutates rather than React state:
 * it changes sixty times a second and nothing outside the canvas cares.
 *
 * `rps` eases toward the target rather than jumping, because a ceiling fan
 * has a rotor with mass in it and the client asked for the spin-up to read.
 * Easing the *rate* rather than the angle is what makes that look right —
 * ease the angle and the blades slow down and speed up within a turn.
 */
export interface FanMotion {
  /** Accumulated angle, in turns. Only its fraction is ever used. */
  turns: number;
  /** Current speed, revolutions per second. */
  rps: number;
  /** Which speed the room has asked for, 0-3. */
  want: number;
  /** True while the fan is still coming to rest on frame 0. */
  parking: boolean;
  /**
   * How many times a turn the sequence repeats, `360 / period_deg`.
   *
   * Three, for a three-blade fan: the blades are identical, so the atlas
   * only covers a third of a turn and frame 0 comes round three times per
   * revolution. Parking uses it to stop at the *nearest* of those rather
   * than the next whole turn, which is the difference between settling in
   * under half a second and taking four.
   */
  periods: number;
}

export function newFanMotion(periods = 1): FanMotion {
  return { turns: 0, rps: 0, want: 0, parking: false, periods };
}

/**
 * Advance the fan by `dt` seconds. Returns true while it still needs frames.
 *
 * Coming to rest is the fiddly part. The brief asks for the fan to stop on
 * frame 0, which is the frame the base plate holds, so that switching it off
 * leaves the room exactly as the still would have drawn it. Simply stopping
 * where it is would leave the blades at an arbitrary angle and make the fan
 * jump the moment anything else triggers a redraw.
 *
 * So the spin-down has two parts: the rate eases to zero over `SPIN_DOWN_S`,
 * and once it is slow enough to be within a frame of home the remaining
 * angle is walked to the next whole period. The fan always parks forwards,
 * never backwards, because a fan that reverses as it stops is a fan nobody
 * believes.
 */
export function stepFan(m: FanMotion, dt: number): boolean {
  const target = FAN_RPS[Math.min(Math.max(m.want, 0), 3)] ?? 0;
  if (target > m.rps) {
    // Reaching full speed from rest should take SPIN_UP_S whatever the
    // target is, so the ramp is a share of the target rather than a fixed
    // rate — low gets up to speed as quickly as high does.
    m.rps = Math.min(target, m.rps + (target / SPIN_UP_S) * dt);
  } else if (target < m.rps) {
    const from = FAN_RPS[3];
    m.rps = Math.max(target, m.rps - (from / SPIN_DOWN_S) * dt);
  }
  if (m.rps > 0) {
    m.turns += m.rps * dt;
    m.parking = target === 0;
    return true;
  }
  if (!m.parking) return false;
  // Rate has reached zero; creep the last fraction of a period home. The
  // step is a share of a period rather than of a turn, so a three-blade
  // fan settles in the same time a single-blade one would.
  const span = 1 / Math.max(m.periods, 1);
  const done = Math.floor(m.turns / span) * span;
  const frac = (m.turns - done) / span;
  if (frac < 1e-3 || frac > 1 - 1e-3) {
    m.turns = Math.round(m.turns / span) * span;
    m.parking = false;
    return false;
  }
  // Three quarters of a period a second: slow enough to read as settling,
  // quick enough that nobody waits for it.
  const step = Math.min((1 - frac) * span, 0.75 * span * dt);
  m.turns += step;
  return true;
}

/**
 * Which frame to show, as a float the shader interpolates between taps.
 *
 * The sequence covers one blade period, not one turn — three blades 120
 * degrees apart look identical every third of a turn, so a third of the
 * frames do all the work. `period_deg / 360` turns is therefore one trip
 * through the atlas.
 */
export function fanFrame(m: FanMotion, file: FanSeqFile): number {
  const perTurn = 360 / file.period_deg;
  const phase = (m.turns * perTurn) % 1;
  return (phase < 0 ? phase + 1 : phase) * file.frames;
}
