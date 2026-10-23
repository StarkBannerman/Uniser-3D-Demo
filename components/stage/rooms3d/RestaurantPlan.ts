import * as THREE from "three";

/**
 * The restaurant's plan, in the brief's own coordinate frame.
 *
 * Origin is the floor point directly under the camera, +X right, +Y up and
 * -Z forward toward the back wall. That is the brief's frame rather than a
 * corner frame like the lobby's, and it is worth keeping: every landmark in
 * the acceptance table is quoted against a camera standing at the origin, so
 * a frame whose origin IS the camera makes those numbers checkable without a
 * translation step in between.
 *
 * Split out of the geometry file because the light rig aims at these same
 * coordinates. When a table moves, the fixture over it has to move with it,
 * and that only works if there is one definition of where the table is.
 */

/** 21 m wide x 20 m deep, 4.7 m to the flat plaster ceiling. */
export const RS = {
  xMin: -10.5,
  xMax: 11,
  /** The back wall, which the camera faces. */
  zBack: -17,
  /** Behind the camera. The room stays open 3 m back so no corner is in shot. */
  zFront: 3,
  h: 4.7,
  /** How far the curved soffit hangs below the flat ceiling. */
  soffitDrop: 0.45,
} as const;

export const RS_PLAN = {
  /** Right half of the back wall: floor-to-ceiling glazing. */
  glass: {
    x0: 3.8,
    x1: 10.6,
    z: RS.zBack,
    /** Thin black mullions, 60 mm. */
    mullions: [5.5, 9.0, 10.4],
    railY: 1.1,
  },
  /** Left half: dark walnut panelling. */
  panelling: { x0: -10, x1: 3.8, z: RS.zBack },
  /** The bar niche inside the panelling. */
  bar: { x0: -8.5, x1: -3.0, z: RS.zBack, counterY: 1.08 },
  /** Champagne-gold sheer drape between bar and wine cabinet. */
  drape: { x0: -2.5, x1: -1.5, z: RS.zBack },
  /** Free-standing wine cabinet. */
  wine: { x: 0.9, z: -15.5, w: 3.2, d: 0.6, h: 3.7 },
  /** Travertine column with a warm LED slot down its left-facing edge. */
  column: { x: 5.6, z: -8, w: 1.0, d: 1.0 },
  /** Narrower pilaster just behind the column. */
  pilaster: { x: 6.9, z: -10.4, w: 0.55, d: 0.55 },
  /** Backlit stone panel on a short return wall, left side. */
  niche: { x0: -9.3, x1: -7.4, z: -12, y0: 0.4, y1: 4.2, sconceY: 1.6 },
  /** Timber-slat ceiling over the column and the right corner. */
  slats: { x0: 3.4, x1: 10.8, z0: -14.5, z1: -6.5, fin: 0.04, gap: 0.06 },
  /** Centre of the pendant cluster. */
  pendants: { x: 1.0, z: -5.5 },
  /** Two black track rails. Rail 2 hangs 0.3 m below the ceiling. */
  rails: [
    { x0: -8.6, z0: -4.2, x1: -1.6, z1: -11.4, drop: 0.02, heads: 8 },
    { x0: -8.0, z0: -7.0, x1: -2.2, z1: -12.6, drop: 0.3, heads: 7 },
  ],
} as const;

/**
 * Fourteen covers on a loose three-metre grid.
 *
 * Loose on purpose: a dining room laid out on an exact grid reads as a
 * canteen, and no two tables in the reference are squarely aligned. The gap
 * down the middle is also deliberate - it is the aisle that keeps the glass
 * wall visible from the camera, which is the whole reason the room is shot
 * from this position.
 */
export const TABLES: {
  x: number;
  z: number;
  /** Top radius. 0.45 is a two-top, 0.55 a four, 0.75 a six. */
  r: number;
  seats: number;
  rot: number;
}[] = [
  /*
   * The near tables are solved from the acceptance table, the rest fill in.
   *
   * The first layout put the foreground covers at x = +-4.6 and z = -3, and
   * they were not in the frame at all: at three metres the camera only sees
   * |x| < 2.4, so both of them sat outside it while the picture showed bare
   * floor across its bottom half. Inverting the brief's landmarks instead -
   * foreground-right top at y 0.64-0.72, mid table at y 0.565-0.625 - puts
   * them at 2.6 m and 5.2 m out and much closer to the centre line.
   */
  { x: 1.3, z: -2.6, r: 0.42, seats: 2, rot: 0.3 },
  { x: -2.4, z: -3.1, r: 0.52, seats: 3, rot: -0.5 },
  { x: -0.8, z: -5.2, r: 0.55, seats: 4, rot: 0.6 },
  { x: 3.6, z: -5.0, r: 0.5, seats: 3, rot: 1.1 },
  { x: -4.6, z: -6.4, r: 0.55, seats: 4, rot: 0.15 },
  { x: 1.4, z: -8.2, r: 0.55, seats: 4, rot: -0.8 },
  { x: 5.6, z: -8.6, r: 0.5, seats: 3, rot: 0.4 },
  { x: -2.8, z: -9.4, r: 0.5, seats: 4, rot: -0.3 },
  { x: -6.8, z: -9.0, r: 0.5, seats: 3, rot: 0.9 },
  { x: 3.4, z: -11.6, r: 0.5, seats: 4, rot: 0.7 },
  { x: -0.6, z: -12.4, r: 0.45, seats: 2, rot: -1.1 },
  { x: 7.4, z: -11.8, r: 0.45, seats: 2, rot: 0.2 },
  { x: -5.0, z: -13.0, r: 0.45, seats: 2, rot: 0.8 },
  { x: 6.0, z: -14.4, r: 0.45, seats: 2, rot: -0.4 },
];

/** Dining height. Tops, covers and chair seats are all built from this. */
export const TOP_Y = 0.75;

/**
 * The soffit's inner edge, as one curve both the geometry and the cove use.
 *
 * `Soffit` extrudes a Shape from it and `Cove` runs its strips along it. They
 * have to be the same curve or the brightest line in the room drifts off the
 * edge it is supposed to be tucked behind, and that is not a thing anyone
 * would spot in code review - only in a render, weeks later.
 *
 * Sampled rather than exported as control points because the cove needs
 * evenly spaced segments along the arc, which is not what evenly spaced
 * bezier parameters give you.
 */
/*
 * Every anchor solved from the acceptance table, not drawn by eye.
 *
 * The brief gives the cove's screen path and the camera, which is enough to
 * invert. A point on the soffit underside at 4.25 m, seen from 1.5 m through
 * a 57-degree vertical field with the frame shifted so the horizon sits at
 * 0.41, lands at a screen height that depends only on its distance:
 *
 *   distance = 2.75 / tan( ((0.41 - y) / 0.5) * atan(0.543) )
 *   x        = (sx - 0.5) * 2 * 0.8098 * distance
 *
 * Running all six quoted points back through that gives the anchors below.
 *
 * Two passes were needed and the second is the interesting one. Fitting only
 * the three obvious points - the ends and the bottom of the dip - put those
 * three inside tolerance and left the three BETWEEN them 5-6% high, because
 * a bezier through three anchors cuts the corner between them. Solving all
 * six and threading a spline through every one is the difference between a
 * curve that matches at the points you checked and a curve that matches.
 *
 * A spline rather than beziers for the same reason: it passes THROUGH its
 * points, where a bezier is only pulled toward its controls.
 */
const EDGE = new THREE.SplineCurve([
  new THREE.Vector2(RS.xMin, -5.4),
  new THREE.Vector2(-6.5, -5.7),
  new THREE.Vector2(-2.9, -6.2),
  new THREE.Vector2(-2.4, -8.73),
  new THREE.Vector2(-0.93, -11.51),
  new THREE.Vector2(1.1, -13.3),
  new THREE.Vector2(3.42, -10.55),
  new THREE.Vector2(4.4, -8.4),
  new THREE.Vector2(7.6, -6.4),
  new THREE.Vector2(RS.xMax, -5.0),
]);

/** (x, z) points along the soffit edge, front face of the room to the right. */
export const SOFFIT_EDGE: THREE.Vector2[] = EDGE.getSpacedPoints(72);

/** Underside of the drop soffit. */
export const SOFFIT_Y = RS.h - RS.soffitDrop;
