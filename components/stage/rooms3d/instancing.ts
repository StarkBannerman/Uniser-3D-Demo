"use client";

/**
 * Geometry built once, so repeated objects can be drawn in one call.
 *
 * Every `<mesh>` in a scene is a draw call, and a draw call is the unit these
 * rooms are actually limited by. Measured on the workspace: 777 draws against
 * 58k triangles, which is to say the GPU was idle and the driver was the
 * bottleneck. Six plants at 34 leaves each is 204 draws for decoration; the
 * same leaves as one `InstancedMesh` is one.
 *
 * `<Instances>` needs a geometry *object*, and drei's `RoundedBox` builds its
 * geometry inside a component, so there is nothing to hand it. `roundedBox`
 * below is the same construction — an extruded rounded rectangle with a bevel,
 * creased so the flats stay flat — exposed as a value.
 */

import * as THREE from "three";

/**
 * A rounded box, centred on the origin.
 *
 * Call it at module scope and share the result. Building one of these per
 * frame would be far worse than the draw call it saves.
 */
export function roundedBox(
  width: number,
  height: number,
  depth: number,
  radius: number,
  segments = 2,
): THREE.BufferGeometry {
  const eps = 0.00001;
  const r = Math.min(radius, Math.min(width, height, depth) / 2 - eps);
  const w = width - r * 2;
  const h = height - r * 2;

  const shape = new THREE.Shape();
  shape.absarc(eps, eps, eps, -Math.PI / 2, -Math.PI, true);
  shape.absarc(eps, h, eps, Math.PI, Math.PI / 2, true);
  shape.absarc(w, h, eps, Math.PI / 2, 0, true);
  shape.absarc(w, eps, eps, 0, -Math.PI / 2, true);

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: depth - r * 2,
    bevelEnabled: true,
    bevelSegments: segments,
    steps: 1,
    bevelSize: r,
    bevelThickness: r,
    curveSegments: segments,
  });
  geom.center();
  /**
   * Flat normals, deliberately.
   *
   * drei creases these with `toCreasedNormals` from three-stdlib, which is not
   * a dependency here — it only reaches drei transitively, and adding a
   * package to smooth a bevel is the wrong trade. `ExtrudeGeometry` already
   * emits a non-indexed buffer, so recomputing normals gives per-face normals:
   * flats stay flat and the bevel reads as a chamfer rather than a round. At
   * the radii these are used at, across a room, that is not a difference
   * anyone sees — and it is what the boxes it replaces looked like anyway.
   */
  geom.computeVertexNormals();
  return geom;
}
