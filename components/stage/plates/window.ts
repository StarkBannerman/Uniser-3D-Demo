/**
 * Where the window is, so the curtain can travel across it.
 *
 * Crossfading two plate sets makes a curtain *appear*; it does not make one
 * *move*. The whole frame dissolves and the panels are a ghost over the
 * glass rather than an edge sliding along a track, which is the one thing a
 * client who owns motorised curtains is watching for.
 *
 * Moving them needs to know which pixels are window. The offline renderer
 * projects the opening as a quad in `hotspots.json`, and this turns that
 * quad into a coordinate system: `t` along the track from the near end to
 * the far one, `s` up the glass. The shader then wipes in `t` and leaves
 * everything outside the quad to crossfade globally, which is correct —
 * light spilling onto the far wall really does just fade as the fabric
 * crosses the window.
 *
 * Pure, and deliberately: a homography is easy to get subtly wrong and this
 * is the part that can be checked without a GPU. `pnpm verify` §20 does.
 */

/**
 * How a covering crosses its opening.
 *
 * `split` is a pair of curtain panels leaving the two jambs and meeting in
 * the middle — a wipe along the track. `drop` is a blind coming down from
 * the head on a rigid bottom rail — a wipe down the glass. They are
 * different axes and different edges, and getting the wrong one is
 * immediately obvious: a venetian that parts in the middle is not a
 * venetian.
 */
export type CurtainTravel = "split" | "drop";

/** The window opening, as `hotspots.json` or a space records it. */
export interface CurtainQuad {
  /** Four `[u, v]` corners: near-bottom, far-bottom, far-top, near-top. */
  quad: [number, number][];
  /** How far past the opening the mask reaches, in quad-relative units. */
  pad?: number;
  /** Panel reach for a `split`, as shares of the opening. Default half each. */
  split?: [number, number];
  /** Feathered edge in pixels. Default four. */
  softPx?: number;
  /**
   * Which way the covering crosses. Defaults to `split`.
   *
   * Loosely typed because the generated `hotspots.json` writes prose here
   * — "both ends to centre" — and narrowing it is this module's job, not
   * the caller's.
   */
  travel?: string;
}

export interface CurtainWindow {
  /**
   * Screen uv to window `(t, s, w)`, row-major, as the shader multiplies it.
   *
   * Projective, so the shader divides by the third component. A rectangular
   * window seen from the side of the room is a trapezoid on screen, and a
   * curtain crossing it at constant speed does *not* cross the screen at
   * constant speed — an affine fit would make the near panel sprint and the
   * far one crawl.
   */
  matrix: number[];
  /** Mask expansion past the opening, in `(t, s)` units. */
  pad: number;
  /** Edge softness in `(t, s)` units, one per axis — about four pixels. */
  soft: [number, number];
  /** Which way the covering crosses its opening. */
  travel: CurtainTravel;
  /**
   * How far each panel of a `split` reaches at full travel, as a share
   * of the opening.
   *
   * Half and half for a pair of curtains meeting in the middle, which is
   * the default and what the hotel room does. A bedroom drape that stacks
   * unevenly — more fabric on one side than the other — meets off
   * centre, and the two numbers say where. They should sum to one, or
   * the panels overlap or leave a gap at full travel.
   */
  split: [number, number];
}

/** Multiply out a 3x3, row-major. */
function invert3(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const k = 1 / det;
  return [
    A * k, (c * h - b * i) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, (c * d - a * f) * k,
    C * k, (b * g - a * h) * k, (a * e - b * d) * k,
  ];
}

/**
 * The homography taking the unit square to the quad.
 *
 * Heckbert's closed form for a square-to-quad map, which is exact and needs
 * no solver: corner 0 goes to `(0, 0)`, 1 to `(1, 0)`, 2 to `(1, 1)` and 3
 * to `(0, 1)`. That ordering is the one `hotspots.json` documents —
 * near-bottom, far-bottom, far-top, near-top — so `t` runs along the track
 * and `s` up the glass.
 */
function squareToQuad(q: [number, number][]): number[] | null {
  if (q.length !== 4 || q.some((p) => p.length !== 2 || !p.every(Number.isFinite))) {
    return null;
  }
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;

  // An exactly parallelogram opening has no perspective term, and the
  // general form divides by zero on it.
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    return [x1 - x0, x3 - x0, x0, y1 - y0, y3 - y0, y0, 0, 0, 1];
  }

  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-12) return null;

  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return [
    x1 - x0 + g * x1, x3 - x0 + h * x3, x0,
    y1 - y0 + g * y1, y3 - y0 + h * y3, y0,
    g, h, 1,
  ];
}

/** Apply a row-major 3x3 to `(x, y, 1)` and divide through. */
export function project(m: number[], x: number, y: number): [number, number] {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

/**
 * Build the window transform, or null if the quad is unusable.
 *
 * Null is a working outcome, not a failure: the stage falls back to the
 * global crossfade it did before, which is the same picture at either end
 * of the travel and only loses the movement in between.
 *
 * `plate` is the plate's pixel size, used to turn "about four pixels" of
 * edge softness into the `(t, s)` units the shader works in. The two axes
 * get different numbers because the opening is wider than it is tall on
 * screen, and one shared figure would make the top and bottom edges four
 * times softer than the sides.
 */
export function curtainWindow(
  spec: CurtainQuad | undefined,
  plate: { width: number; height: number },
): CurtainWindow | null {
  if (!spec?.quad) return null;
  const forward = squareToQuad(spec.quad);
  if (!forward) return null;
  const inverse = invert3(forward);
  if (!inverse) return null;

  // One (t, s) unit measured in pixels, from the quad's own screen extent.
  const us = spec.quad.map((p) => p[0]);
  const vs = spec.quad.map((p) => p[1]);
  const spanT = Math.max(1, (Math.max(...us) - Math.min(...us)) * plate.width);
  const spanS = Math.max(1, (Math.max(...vs) - Math.min(...vs)) * plate.height);
  const SOFT_PX = spec.softPx ?? 4;

  return {
    matrix: inverse,
    pad: spec.pad ?? 0.02,
    soft: [SOFT_PX / spanT, SOFT_PX / spanS],
    // The generated files say "both ends to centre" in prose; anything
    // that is not explicitly a drop is the curtain behaviour the room
    // already had.
    travel: spec.travel === "drop" ? "drop" : "split",
    split: spec.split && spec.split.length === 2 ? spec.split : [0.5, 0.5],
  };
}
