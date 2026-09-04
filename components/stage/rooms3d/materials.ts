/**
 * Shared material and dimension definitions for the 3D rooms.
 *
 * Everything is in metres, because the lighting model is physical: an
 * `estimateLux` figure and a fixture's lumen output only mean something against
 * real room dimensions, and the engine already works in m².
 *
 * Colours are authored as linear-ish sRGB hex and left to the renderer's colour
 * management. Do not "correct" them by eye against a screenshot taken before
 * tone mapping is in place — that way you end up baking the tone curve into the
 * albedo and every subsequent lighting change looks wrong.
 */

import * as THREE from "three";

/* ------------------------------------------------------------------ */
/* Room dimensions                                                     */
/* ------------------------------------------------------------------ */

export const ROOM = {
  /**
   * Interior width, along X. The glazing wall is at `w`.
   *
   * Narrowed from 6m after look-dev: at 6m the bed sat ~31 degrees off the
   * camera axis and fell outside the frame, where the reference has it ~14
   * degrees off. Room proportion is a framing decision as much as an
   * architectural one.
   */
  w: 6.5,
  /** Interior depth, along Z. The slatted feature wall is at z = 0. */
  d: 6.5,
  /** Floor to the underside of the raised ceiling. */
  h: 3.0,
  /** Perimeter soffit: the cove sits on top of this and washes the ceiling. */
  soffit: { depth: 0.38, drop: 0.28 },
} as const;

/** Where the cove strip actually sits — just inboard of the soffit edge. */
export const COVE_Y = ROOM.h - ROOM.soffit.drop + 0.05;

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

export const PALETTE = {
  plaster: "#efe9df",
  plasterCool: "#e4ded4",
  woodSlat: "#d2bda1",
  woodSlatAlt: "#c4ad8f",
  woodGap: "#7f6a54",
  woodFloor: "#4a3220",
  bedBase: "#ab8659",
  duvet: "#e9e5dd",
  sheet: "#f2efe8",
  throw: "#4a5058",
  pillow: "#f4f1ea",
  pillowAccent: "#9aa0a6",
  rug: "#d5cbba",
  curtainBlackout: "#d8c9ae",
  curtainSheer: "#dfe4ec",
  nightstand: "#5c3f27",
  metal: "#2f3238",
} as const;

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

/**
 * Materials are created once and shared. Creating them inside a component body
 * would rebuild and recompile shaders on every state change — and device state
 * changes here up to 60 times a second.
 */
export const materials = {
  plaster: new THREE.MeshStandardMaterial({
    color: PALETTE.plaster,
    roughness: 0.94,
    metalness: 0,
  }),
  ceiling: new THREE.MeshStandardMaterial({
    color: PALETTE.plaster,
    roughness: 0.96,
    metalness: 0,
  }),
  soffit: new THREE.MeshStandardMaterial({
    color: PALETTE.plasterCool,
    roughness: 0.9,
    metalness: 0,
  }),
  woodSlat: new THREE.MeshStandardMaterial({
    color: PALETTE.woodSlat,
    roughness: 0.52,
    metalness: 0,
  }),
  woodBack: new THREE.MeshStandardMaterial({
    color: PALETTE.woodGap,
    roughness: 0.85,
    metalness: 0,
  }),
  floor: new THREE.MeshStandardMaterial({
    color: PALETTE.woodFloor,
    roughness: 0.34,
    metalness: 0.02,
  }),
  bedBase: new THREE.MeshStandardMaterial({
    color: PALETTE.bedBase,
    roughness: 0.48,
    metalness: 0,
  }),
  duvet: new THREE.MeshStandardMaterial({
    color: PALETTE.duvet,
    roughness: 0.92,
    metalness: 0,
  }),
  sheet: new THREE.MeshStandardMaterial({
    color: PALETTE.sheet,
    roughness: 0.9,
    metalness: 0,
  }),
  throw: new THREE.MeshStandardMaterial({
    color: PALETTE.throw,
    roughness: 0.82,
    metalness: 0,
  }),
  pillow: new THREE.MeshStandardMaterial({
    color: PALETTE.pillow,
    roughness: 0.9,
    metalness: 0,
  }),
  pillowAccent: new THREE.MeshStandardMaterial({
    color: PALETTE.pillowAccent,
    roughness: 0.88,
    metalness: 0,
  }),
  rug: new THREE.MeshStandardMaterial({
    color: PALETTE.rug,
    roughness: 1,
    metalness: 0,
  }),
  nightstand: new THREE.MeshStandardMaterial({
    color: PALETTE.nightstand,
    roughness: 0.5,
    metalness: 0,
  }),
  metal: new THREE.MeshStandardMaterial({
    color: PALETTE.metal,
    roughness: 0.35,
    metalness: 0.8,
  }),
  /** Heavy blackout fabric. Sheen keeps it from reading as painted cardboard. */
  curtainBlackout: new THREE.MeshPhysicalMaterial({
    color: PALETTE.curtainBlackout,
    roughness: 0.88,
    metalness: 0,
    sheen: 0.6,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color("#fff4e2"),
    side: THREE.DoubleSide,
  }),
  /**
   * Sheer voile. Transmission rather than plain opacity, so city light behind it
   * actually diffuses through the fabric instead of the fabric just being
   * see-through.
   */
  curtainSheer: new THREE.MeshPhysicalMaterial({
    color: PALETTE.curtainSheer,
    roughness: 0.55,
    metalness: 0,
    transparent: true,
    opacity: 0.42,
    transmission: 0.55,
    thickness: 0.02,
    side: THREE.DoubleSide,
  }),
  glass: new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
  }),
};

/**
 * Emissive material for a light fixture's visible face.
 *
 * Intensity is pushed above 1 deliberately: the bloom pass keys off values over
 * the threshold, and a cove strip that only reaches 1.0 reads as a painted white
 * line rather than a light source. This is the single biggest contributor to the
 * "render" look versus the "WebGL" look, alongside tone mapping.
 */
export function emissive(color: THREE.ColorRepresentation, intensity: number) {
  return new THREE.MeshStandardMaterial({
    color: "#000000",
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
    roughness: 1,
    metalness: 0,
    toneMapped: false,
  });
}
