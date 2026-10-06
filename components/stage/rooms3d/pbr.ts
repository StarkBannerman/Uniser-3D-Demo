"use client";

/**
 * CC0 PBR texture sets, loaded from `public/textures`.
 *
 * Every room in this project draws its surfaces procedurally, which keeps the
 * demo offline and deterministic and is the right call for a screen UI or a
 * city skyline. It is the wrong call for architectural surfaces: a flat colour
 * with a roughness number cannot do grain, weave or veining, and that absence
 * is most of what made this room read as a blockout rather than a render.
 *
 * So the architectural materials — floor, joinery, stone, carpet, leather —
 * come from real scanned maps. They are 1.7 MB in total for five sets at
 * 512-1024px, downscaled and recompressed from ambientCG's 1K JPEG releases,
 * which is a fair trade for the single biggest visual change available.
 *
 * Sources (all CC0):
 *   floor    WoodFloor043     walnut   Wood062
 *   stone    Marble012        carpet   Fabric064
 *   leather  Leather011
 */

import { useLayoutEffect } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";

export interface TextureSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

/**
 * Load one set and set it up correctly.
 *
 * Two details that are easy to get wrong and very visible when you do: only the
 * colour map is sRGB — a normal or roughness map decoded as sRGB is silently
 * wrong everywhere — and `repeat` has to be applied to all three or the grain
 * and the gloss drift apart from the colour.
 */
export function useTextureSet(name: string, repeat: [number, number]): TextureSet {
  const [map, normalMap, roughnessMap] = useTexture([
    `/textures/${name}_color.jpg`,
    `/textures/${name}_normal.jpg`,
    `/textures/${name}_rough.jpg`,
  ]);

  useLayoutEffect(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    for (const t of [map, normalMap, roughnessMap]) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
      /**
       * 16, not 8. A floor seen at a grazing angle is the whole reason
       * anisotropic filtering exists: the texel footprint of the near carpet
       * is long and thin, and under-sampling it turns a weave into static.
       * Three.js clamps this to whatever the GPU reports, so asking for more
       * than the hardware has costs nothing.
       */
      t.anisotropy = 16;
      t.needsUpdate = true;
    }
  }, [map, normalMap, roughnessMap, repeat]);

  return { map, normalMap, roughnessMap };
}

/**
 * Write a set onto an existing material.
 *
 * The room's materials are module-level singletons built once at import, which
 * is deliberate — rebuilding them on a state change recompiles shaders sixty
 * times a second during a fade. Textures arrive later, from a hook, so they are
 * assigned in place rather than by constructing new materials.
 */
export function applySet(
  material: THREE.MeshStandardMaterial,
  set: TextureSet,
  opts: { normalScale?: number; envMapIntensity?: number } = {},
) {
  material.map = set.map;
  material.normalMap = set.normalMap;
  material.roughnessMap = set.roughnessMap;
  material.normalScale = new THREE.Vector2(
    opts.normalScale ?? 1,
    opts.normalScale ?? 1,
  );
  if (opts.envMapIntensity !== undefined) {
    material.envMapIntensity = opts.envMapIntensity;
  }
  material.needsUpdate = true;
}
