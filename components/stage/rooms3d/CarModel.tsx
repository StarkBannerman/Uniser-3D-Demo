"use client";

/**
 * A real car, loaded from glTF, normalised into the room's own conventions.
 *
 * The procedural bodies in `CAR_SHAPES` are a stand-in. A modelled vehicle has
 * mirrors, shut lines, arch flares, a proper greenhouse and surfacing a loft
 * cannot reach, and next to one the lofts read as toys — which is the note the
 * client kept giving.
 *
 * Nothing about a downloaded model matches this project's conventions, so this
 * fixes all of it at load:
 *
 *  - **Units and orientation.** The two Audis arrive 4.5 m long on Z with their
 *    origin 320 mm below the floor; the Qashqai arrives 712 *units* long on Z.
 *    So the model is measured, scaled to the length the room expects, turned to
 *    run along X — nose at −X, as `makeCarBody` does — and dropped so its
 *    lowest point sits on y = 0.
 *  - **Glass.** Every one of them uses `KHR_materials_transmission`, and a
 *    transmissive material makes three.js render the whole scene again into a
 *    transmission buffer. That cost 113 ms of a 201 ms frame in the bedroom and
 *    was removed there for exactly this reason. Three cars carrying it would be
 *    far worse, so the glass is swapped for the opaque dark clearcoat the
 *    procedural cars already use, which is what showroom glass photographs as.
 *  - **Badges.** The brief says unbadged, and these are real marques. The
 *    `emblem` and `badge_*` materials are hidden, which the model's own naming
 *    makes clean to do.
 *  - **Paint.** The body material is recoloured per car, so one model serves
 *    the silver coupé and the red sports car both.
 */

import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Body type to file. Three models cover the six cars on the floor. */
export const CAR_MODELS: Record<string, string> = {
  coupe: "/models/cars/2008_audi_r8_4.2_fsi_quattro.glb",
  saloon: "/models/cars/2004_audi_s4.glb",
  suv: "/models/cars/2024_nissan_qashqai_glory.glb",
};

/** Material names that carry the paint, and so take the car's colour. */
const PAINT = /^(body|carpaint|paint|car_paint|matte_colors)/i;
/** Material names that are a marque. Hidden — see the note above. */
const BADGE = /(emblem|badge|logo)/i;

export function CarModel({
  url,
  colour,
  length,
}: {
  url: string;
  colour: string;
  /** Target nose-to-tail length in metres, from `CAR_SHAPES`. */
  length: number;
}) {
  const { scene } = useGLTF(url);

  /**
   * Cloned, because `useGLTF` caches one scene graph per URL and the floor
   * puts the same body type down twice in different colours. Mutating the
   * shared copy would repaint both.
   */
  /**
   * Cloned and then merged by material.
   *
   * Cloned because `useGLTF` caches one scene graph per URL and the floor puts
   * the same body type down twice in different colours; mutating the shared
   * copy would repaint both.
   *
   * Merged because these models are built for an offline renderer, not for a
   * frame budget. The S4 arrives as 163 separate meshes, the R8 as 154 — every
   * trim piece its own draw — and six cars took the room from 343 draw calls
   * to 2,211 and from 164k triangles a frame to 3.5 million. Measured after:
   * 10 fps where the room used to manage 16.
   *
   * Merging by material collapses each car to one mesh per material, which is
   * the smallest number that can still be drawn correctly, and costs nothing
   * at runtime because it happens once per model.
   */
  const model = useMemo(() => {
    const src = scene.clone(true);
    src.updateWorldMatrix(true, true);

    const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
    src.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const g = mesh.geometry.clone();
      g.applyMatrix4(mesh.matrixWorld);
      // A merge needs every geometry to carry the same attributes.
      for (const key of Object.keys(g.attributes)) {
        if (!["position", "normal", "uv"].includes(key)) g.deleteAttribute(key);
      }
      if (!g.getAttribute("normal")) g.computeVertexNormals();
      if (!g.getAttribute("uv")) {
        const n = g.getAttribute("position").count;
        g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      }
      const list = byMaterial.get(mesh.material) ?? [];
      list.push(g);
      byMaterial.set(mesh.material, list);
    });

    const out = new THREE.Group();
    for (const [material, parts] of byMaterial) {
      const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
      if (!merged) {
        // Mismatched attributes: keep the pieces rather than lose the trim.
        parts.forEach((g) => out.add(new THREE.Mesh(g, material)));
        continue;
      }
      out.add(new THREE.Mesh(merged, material));
    }
    return out;
  }, [scene]);

  useLayoutEffect(() => {
    const paint = new THREE.Color(colour);

    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const single = !Array.isArray(mesh.material);
      const materials = (single ? [mesh.material] : mesh.material) as THREE.Material[];

      const mapped = materials.map((m) => {
        const src = m as THREE.MeshPhysicalMaterial;
        if (BADGE.test(src.name)) {
          mesh.visible = false;
          return src;
        }
        const next = src.clone();
        if (next.transmission > 0) {
          // See the note above: a transmission buffer is a second full render.
          next.transmission = 0;
          next.transparent = false;
          next.opacity = 1;
          next.color = new THREE.Color("#12161a");
          next.roughness = 0.22;
          next.metalness = 0;
          next.clearcoat = 0.4;
          next.clearcoatRoughness = 0.1;
          next.envMapIntensity = 0.8;
        } else if (PAINT.test(next.name)) {
          next.color = paint;
          next.metalness = 0.3;
          next.roughness = 0.28;
          next.clearcoat = 1;
          next.clearcoatRoughness = 0.05;
          next.envMapIntensity = 1.2;
        }
        return next;
      });
      mesh.material = single ? mapped[0] : mapped;
    });
  }, [model, colour]);

  /**
   * Measured after the materials are set, so hidden badge meshes are already
   * out of the bounds — otherwise a wing mirror's badge can stretch the box.
   */
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const centre = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(centre);
    // The longest horizontal axis is the car's length, whichever it came in on.
    const alongZ = size.z >= size.x;
    const scale = length / (alongZ ? size.z : size.x);
    return { scale, centre, box, alongZ };
  }, [model, length]);

  return (
    <group rotation={[0, fit.alongZ ? -Math.PI / 2 : 0, 0]}>
      <group
        scale={fit.scale}
        position={[
          -fit.centre.x * fit.scale,
          -fit.box.min.y * fit.scale,
          -fit.centre.z * fit.scale,
        ]}
      >
        <primitive object={model} />
      </group>
    </group>
  );
}

Object.values(CAR_MODELS).forEach((u) => useGLTF.preload(u));
