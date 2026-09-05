"use client";

/**
 * A spotlight that actually points where you tell it to.
 *
 * `THREE.SpotLight` takes its direction from `target.matrixWorld`, and the
 * default target object is not part of the scene graph — so nothing ever calls
 * `updateMatrixWorld` on it and its world position stays at the origin no
 * matter what you set `target.position` to.
 *
 * The failure is quiet and very confusing: writing `target-position={[x, 0, z]}`
 * in JSX looks correct, typechecks, and aims every light in the room at (0,0,0).
 * In this project that put a bright patch in one corner of the living room while
 * the downlights lit nothing beneath them and the "wall wash" missed its wall
 * entirely.
 *
 * Mounting the target with `<primitive>` puts it in the scene, so R3F keeps its
 * world matrix current and the light aims correctly.
 */

import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";

export function Spot({
  position,
  target,
  angle,
  penumbra = 0.7,
  distance,
  decay = 1.4,
  intensity,
  color,
  castShadow = false,
}: {
  position: [number, number, number];
  target: [number, number, number];
  angle: number;
  penumbra?: number;
  distance?: number;
  decay?: number;
  intensity: number;
  color: THREE.Color | string;
  castShadow?: boolean;
}) {
  const targetObject = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    targetObject.position.set(target[0], target[1], target[2]);
    targetObject.updateMatrixWorld();
  }, [targetObject, target]);

  return (
    <>
      <primitive object={targetObject} />
      <spotLight
        position={position}
        target={targetObject}
        angle={angle}
        penumbra={penumbra}
        distance={distance}
        decay={decay}
        intensity={intensity}
        color={color}
        castShadow={castShadow}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0012}
      />
    </>
  );
}
