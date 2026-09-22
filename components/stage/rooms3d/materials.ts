/**
 * Shared material and dimension definitions for the bedroom.
 *
 * Everything is in metres, because the lighting model is physical: an
 * `estimateLux` figure and a fixture's lumen output only mean something against
 * real room dimensions, and the engine already works in m².
 *
 * Colours are authored as linear-ish sRGB hex and left to the renderer's colour
 * management. Do not "correct" them by eye against a screenshot taken before
 * tone mapping is in place — that way you end up baking the tone curve into the
 * albedo and every subsequent lighting change looks wrong.
 *
 * One rule learned the hard way in the kitchen: keep the albedos spread out. A
 * room where every surface sits within a few percent of the same value has no
 * tonal structure for the lighting to work against, and reads as flat and hazy
 * however good the fixtures are.
 */

import * as THREE from "three";

/* ------------------------------------------------------------------ */
/* Room dimensions                                                     */
/* ------------------------------------------------------------------ */

export const ROOM = {
  /** Interior width, along X. The glazing wall is at `w`. */
  w: 7.0,
  /**
   * Interior depth, along Z. The headboard wall is at z = 0; the camera sits
   * near z = d looking into the room.
   */
  d: 6.0,
  /** Floor to the underside of the raised ceiling. */
  h: 3.05,
  /** Perimeter soffit: the cove sits on top of this and washes the ceiling. */
  soffit: { depth: 0.42, drop: 0.26 },
} as const;

/** Where the cove strip actually sits — just inboard of the soffit edge. */
export const COVE_Y = ROOM.h - ROOM.soffit.drop + 0.05;

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

export const PALETTE = {
  plaster: "#e8e2d7",
  plasterCool: "#dcd6cb",
  woodSlat: "#c8ab85",
  woodSlatAlt: "#b2946e",
  woodGap: "#4a3a2a",
  /** Large-format polished tile. Light enough to bounce, warm enough not to
      turn the room clinical — and far lighter than the timber it replaced,
      which was swallowing every fixture aimed at it. */
  floorTile: "#b4a795",
  floorGrout: "#9a8d7c",
  headboard: "#7d6650",
  bedBase: "#3f3229",
  /** Warm off-white, not paper-white. Pure white linen is the brightest thing
      in the room by a wide margin and pulls the eye off whatever the scene is
      actually demonstrating. */
  duvet: "#d6cfc0",
  sheet: "#e3ddd0",
  throw: "#6d5f52",
  pillow: "#e9e3d7",
  pillowAccent: "#8e8375",
  /** Several stops below the tile it sits on. A rug that matches the floor is
      a rug nobody can see, and the floor then reads as one flat expanse. */
  rug: "#6e6455",
  bench: "#5e5347",
  armchair: "#6b6054",
  curtainBlackout: "#c9b89c",
  curtainSheer: "#e2e6ec",
  nightstand: "#3b2f26",
  nightstandTop: "#d8d2c6",
  wardrobeCarcass: "#3a3129",
  /** Light, so the interior strips have something to bounce off. */
  wardrobeBack: "#b6a488",
  brass: "#b08d55",
  metal: "#2b2e33",
  fanBlade: "#5a4a38",
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
  /**
   * Polished porcelain. Low roughness on purpose: the reflection of the cove
   * and the lamps in the floor is doing real work, and it is the single
   * cheapest way to make a large empty floor plane stop looking like paper.
   */
  floor: new THREE.MeshStandardMaterial({
    color: PALETTE.floorTile,
    roughness: 0.22,
    metalness: 0.04,
  }),
  headboard: new THREE.MeshStandardMaterial({
    color: PALETTE.headboard,
    roughness: 0.82,
    metalness: 0,
  }),
  bedBase: new THREE.MeshStandardMaterial({
    color: PALETTE.bedBase,
    roughness: 0.6,
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
  bench: new THREE.MeshStandardMaterial({
    color: PALETTE.bench,
    roughness: 0.86,
    metalness: 0,
  }),
  armchair: new THREE.MeshStandardMaterial({
    color: PALETTE.armchair,
    roughness: 0.88,
    metalness: 0,
  }),
  nightstand: new THREE.MeshStandardMaterial({
    color: PALETTE.nightstand,
    roughness: 0.5,
    metalness: 0,
  }),
  nightstandTop: new THREE.MeshStandardMaterial({
    color: PALETTE.nightstandTop,
    roughness: 0.18,
    metalness: 0.05,
  }),
  wardrobeCarcass: new THREE.MeshStandardMaterial({
    color: PALETTE.wardrobeCarcass,
    roughness: 0.45,
    metalness: 0.1,
  }),
  wardrobeBack: new THREE.MeshStandardMaterial({
    color: PALETTE.wardrobeBack,
    roughness: 0.75,
    metalness: 0,
  }),
  /**
   * Smoked glass wardrobe fronts.
   *
   * The point of the whole assembly: with the interior strips off it is a dark
   * reflective slab, and with them on the shelves read through the tint. That
   * before/after is the wardrobe-lighting demo in one press, so the glass has
   * to transmit rather than merely be semi-transparent.
   */
  wardrobeGlass: new THREE.MeshPhysicalMaterial({
    color: "#3b3630",
    roughness: 0.1,
    metalness: 0,
    transparent: true,
    opacity: 0.34,
    transmission: 0.8,
    thickness: 0.01,
    ior: 1.5,
    side: THREE.DoubleSide,
  }),
  brass: new THREE.MeshStandardMaterial({
    color: PALETTE.brass,
    roughness: 0.28,
    metalness: 0.85,
  }),
  metal: new THREE.MeshStandardMaterial({
    color: PALETTE.metal,
    roughness: 0.35,
    metalness: 0.8,
  }),
  fanBlade: new THREE.MeshStandardMaterial({
    color: PALETTE.fanBlade,
    roughness: 0.55,
    metalness: 0,
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
    // Enough to soften the skyline into a glow. At 0.42 the city read through
    // it almost pin-sharp, which made a closed sheer look like an open window.
    opacity: 0.66,
    transmission: 0.38,
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

/**
 * Translucent shade material for a table lamp.
 *
 * Distinct from `emissive`: a lamp shade is lit *through*, so it needs to keep a
 * diffuse response to the rest of the room as well as glowing. A pure emissive
 * shade goes flat and papery the moment anything else in the room is brighter.
 */
export function shade(color: THREE.ColorRepresentation, intensity: number) {
  return new THREE.MeshStandardMaterial({
    color: "#d8cfc0",
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
    roughness: 0.85,
    metalness: 0,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}
