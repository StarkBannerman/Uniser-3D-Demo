"use client";

/**
 * Emissive materials for light fittings, built once and written in place.
 *
 * This exists because of a measured three-and-a-half second freeze.
 *
 * Pressing a scene fades every channel over one to four seconds, and the rigs
 * were calling `emissive(colour, intensity)` inside a `useMemo` keyed on the
 * colour and the level. Both change on every frame of a fade, so every frame
 * allocated a fresh `MeshStandardMaterial` — and three.js compiles a new
 * shader program for every new material it has not seen before. Measured on
 * the bedroom, one press of Reading compiled 26 programs and 52 shaders, and
 * the worst frame in that transition took 3900 ms. Evening took 3533.
 *
 * The scene was not slow to compute. It was recompiling the renderer.
 *
 * A fitting's colour and brightness are *uniforms*. Writing them onto a
 * material that already exists costs four number assignments and no
 * recompilation at all, which is what these hooks do. The rule for the whole
 * project: nothing inside a light rig may construct a material outside a
 * `useMemo` with an empty dependency array.
 */

import { useLayoutEffect, useMemo } from "react";
import type * as THREE from "three";
import { emissive, shade } from "./materials";

/** A glowing aperture — a cove strip, a lens, a lit panel. */
export function useEmissiveMaterial(colour: THREE.Color, intensity: number) {
  const mat = useMemo(() => emissive("#ffffff", 0), []);
  // No dependency array games: `colourOf` returns a new `THREE.Color` every
  // render, so any key derived from it changes anyway. Copying four floats
  // unconditionally is cheaper than the comparison that would avoid it, and it
  // cannot go stale.
  useLayoutEffect(() => {
    mat.emissive.copy(colour);
    mat.emissiveIntensity = intensity;
  });
  return mat;
}

/**
 * A lamp shade: lit *through*, so it keeps a diffuse response as well.
 *
 * Distinct from a pure emissive face because a shade goes flat and papery the
 * moment anything else in the room is brighter than it.
 */
export function useShadeMaterial(colour: THREE.Color, intensity: number) {
  const mat = useMemo(() => shade("#ffffff", 0), []);
  useLayoutEffect(() => {
    mat.emissive.copy(colour);
    mat.emissiveIntensity = intensity;
  });
  return mat;
}
