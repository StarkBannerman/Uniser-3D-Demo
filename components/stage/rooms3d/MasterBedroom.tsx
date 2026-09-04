"use client";

/**
 * Master Bedroom — geometry only.
 *
 * Deliberately carries no lights and no device state. Geometry is stable; the
 * lighting rig is what reads the simulation and changes 60 times a second, so
 * keeping them apart means a dimmer move re-renders a handful of light objects
 * instead of rebuilding a room's worth of meshes.
 *
 * Modelled from the reference video: rectangular shell, slatted timber feature
 * wall behind the bed, perimeter cove soffit, full-height glazing with curtains
 * on the adjacent wall, low platform bed, dark timber floor.
 *
 * Coordinates in metres. The feature wall is z = 0, the glazing is x = ROOM.w,
 * and the camera looks into the far corner where those two meet.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { COVE_Y, PALETTE, ROOM, materials } from "./materials";
import { makeCurtainGeometry, makeCityTexture } from "./geometry";

/* ------------------------------------------------------------------ */
/* Timber slat wall                                                    */
/* ------------------------------------------------------------------ */

const SLAT = { w: 0.052, d: 0.018, gap: 0.022, bottom: 0.0, top: ROOM.h - 0.22 };

/**
 * The room's signature surface, as an instanced mesh.
 *
 * Roughly ninety real boxes rather than a normal-mapped plane, because the
 * slats need to self-shadow and catch the cove wash edge-on — that grazing
 * highlight down one side of every slat is most of why the reference room looks
 * expensive, and a normal map does not reproduce it under a light this oblique.
 * Instancing makes the cost of doing it properly negligible.
 */
function SlatWall() {
  const ref = useRef<THREE.InstancedMesh>(null);

  const { count, pitch } = useMemo(() => {
    const p = SLAT.w + SLAT.gap;
    return { count: Math.floor((ROOM.w - 0.04) / p), pitch: p };
  }, []);

  const height = SLAT.top - SLAT.bottom;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;

    const m = new THREE.Matrix4();
    const colour = new THREE.Color();
    const a = new THREE.Color(PALETTE.woodSlat);
    const b = new THREE.Color(PALETTE.woodSlatAlt);

    for (let i = 0; i < count; i++) {
      m.makeTranslation(
        0.02 + SLAT.w / 2 + i * pitch,
        SLAT.bottom + height / 2,
        SLAT.d / 2,
      );
      mesh.setMatrixAt(i, m);

      // Slight per-slat variation so the wall reads as timber rather than as a
      // repeated extrusion. Deterministic, so it never shimmers between frames.
      const t = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
      colour.copy(a).lerp(b, t).multiplyScalar(0.94 + t * 0.12);
      mesh.setColorAt(i, colour);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [count, pitch, height]);

  return (
    <group>
      {/* Dark recess behind the slats, so the gaps read as shadow. */}
      <mesh position={[ROOM.w / 2, ROOM.h / 2, 0.002]} receiveShadow>
        <planeGeometry args={[ROOM.w, ROOM.h]} />
        <primitive object={materials.woodBack} attach="material" />
      </mesh>
      <instancedMesh
        ref={ref}
        args={[undefined, undefined, count]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[SLAT.w, height, SLAT.d]} />
        <meshStandardMaterial color="#ffffff" roughness={0.52} metalness={0} />
      </instancedMesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

function Shell() {
  const { w, d, h, soffit } = ROOM;
  const soffitY = h - soffit.drop / 2;

  return (
    <group>
      {/* Floor */}
      <mesh
        position={[w / 2, 0, d / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[w, d]} />
        <primitive object={materials.floor} attach="material" />
      </mesh>

      {/* Raised ceiling */}
      <mesh position={[w / 2, h, d / 2]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <primitive object={materials.ceiling} attach="material" />
      </mesh>

      {/* Left wall (mostly out of frame) and the wall behind the camera. */}
      <mesh position={[0, h / 2, d / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <primitive object={materials.plaster} attach="material" />
      </mesh>
      <mesh position={[w / 2, h / 2, d]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <primitive object={materials.plaster} attach="material" />
      </mesh>

      {/* Perimeter soffit. The cove sits on top of this and washes the ceiling,
          which is what produces the reference room's soft warm ceiling. */}
      {[
        { pos: [w / 2, soffitY, soffit.depth / 2], size: [w, soffit.drop, soffit.depth] },
        {
          pos: [w - soffit.depth / 2, soffitY, d / 2],
          size: [soffit.depth, soffit.drop, d],
        },
        {
          pos: [w / 2, soffitY, d - soffit.depth / 2],
          size: [w, soffit.drop, soffit.depth],
        },
        { pos: [soffit.depth / 2, soffitY, d / 2], size: [soffit.depth, soffit.drop, d] },
      ].map((s, i) => (
        <mesh
          key={`soffit-${i}`}
          position={s.pos as [number, number, number]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={s.size as [number, number, number]} />
          <primitive object={materials.soffit} attach="material" />
        </mesh>
      ))}

      {/* Linear ceiling slot — the dark line across the ceiling in the
          reference, which reads as a linear diffuser and gives the ceiling
          plane something to scale against. */}
      <mesh position={[w / 2 + 0.3, h - 0.008, 1.6]}>
        <boxGeometry args={[3.9, 0.02, 0.09]} />
        <primitive object={materials.metal} attach="material" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Bed                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Offset along the slat wall, toward the corner the camera looks into.
 * Placed by eye against the reference frame rather than derived.
 */
const BED_X = 2.25;

function Bed() {
  return (
    <group position={[BED_X, 0, 0]}>
      {/* Wide surround, then an inset platform. Two stacked slabs of slightly
          different footprint is what gives a platform bed its shadow line —
          a single box reads as a crate. */}
      <mesh position={[2.0, 0.04, 1.28]} castShadow receiveShadow>
        <boxGeometry args={[2.14, 0.08, 2.32]} />
        <primitive object={materials.bedBase} attach="material" />
      </mesh>
      <mesh position={[2.0, 0.17, 1.25]} castShadow receiveShadow>
        <boxGeometry args={[1.96, 0.18, 2.16]} />
        <primitive object={materials.bedBase} attach="material" />
      </mesh>

      {/* Mattress, duvet, and a folded runner across the foot. */}
      <mesh position={[2.0, 0.4, 1.25]} castShadow receiveShadow>
        <boxGeometry args={[1.84, 0.28, 2.02]} />
        <primitive object={materials.sheet} attach="material" />
      </mesh>
      <mesh position={[2.0, 0.555, 1.36]} castShadow receiveShadow>
        <boxGeometry args={[1.88, 0.09, 1.84]} />
        <primitive object={materials.duvet} attach="material" />
      </mesh>
      <mesh position={[2.0, 0.612, 1.86]} castShadow receiveShadow>
        <boxGeometry args={[1.9, 0.055, 0.4]} />
        <primitive object={materials.throw} attach="material" />
      </mesh>

      {/* Pillows leaning back against the headboard, plus two smaller
          accent cushions in front of them. */}
      <mesh position={[1.56, 0.66, 0.42]} rotation={[-0.34, 0, 0]} castShadow>
        <boxGeometry args={[0.74, 0.19, 0.46]} />
        <primitive object={materials.pillow} attach="material" />
      </mesh>
      <mesh position={[2.44, 0.66, 0.42]} rotation={[-0.34, 0, 0]} castShadow>
        <boxGeometry args={[0.74, 0.19, 0.46]} />
        <primitive object={materials.pillow} attach="material" />
      </mesh>
      <mesh position={[1.74, 0.63, 0.62]} rotation={[-0.2, 0, 0]} castShadow>
        <boxGeometry args={[0.36, 0.16, 0.3]} />
        <primitive object={materials.pillowAccent} attach="material" />
      </mesh>
      <mesh position={[2.26, 0.63, 0.62]} rotation={[-0.2, 0, 0]} castShadow>
        <boxGeometry args={[0.36, 0.16, 0.3]} />
        <primitive object={materials.pillowAccent} attach="material" />
      </mesh>

      {/* Low wide headboard with a ledge, sitting in front of the slats
          rather than replacing them. */}
      <mesh position={[2.0, 0.46, 0.08]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 0.92, 0.09]} />
        <primitive object={materials.bedBase} attach="material" />
      </mesh>
      <mesh position={[2.0, 0.945, 0.15]} castShadow receiveShadow>
        <boxGeometry args={[2.54, 0.06, 0.28]} />
        <primitive object={materials.bedBase} attach="material" />
      </mesh>

      <mesh position={[0.36, 0.17, 0.44]} castShadow receiveShadow>
        <boxGeometry args={[0.48, 0.38, 0.44]} />
        <primitive object={materials.nightstand} attach="material" />
      </mesh>
    </group>
  );
}

function Rug() {
  return (
    <mesh position={[4.5, 0.006, 2.3]} receiveShadow>
      <boxGeometry args={[3.4, 0.012, 2.6]} />
      <primitive object={materials.rug} attach="material" />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Glazing, curtains and the view                                      */
/* ------------------------------------------------------------------ */

const WINDOW = { z0: 0.12, z1: ROOM.d - 0.12, y0: 0.06, y1: ROOM.h - 0.24 };

/** Curtain panels per layer, and the gap left between them. */
const PANELS = 4;
const PANEL_GAP = 0.07;

/**
 * Z positions of the gaps between curtain panels.
 *
 * Exported because the cool accent strips have to sit exactly behind these — in
 * the reference the blue slivers are visible even with blackout fully closed,
 * which is what identifies them as fixtures rather than daylight leaking in.
 */
export const ACCENT_Z: number[] = Array.from(
  { length: PANELS - 1 },
  (_, i) => WINDOW.z0 + ((WINDOW.z1 - WINDOW.z0) * (i + 1)) / PANELS,
);

export interface CurtainPositions {
  /** 0 = fully open (bunched), 100 = fully closed. */
  sheer: number;
  blackout: number;
}

function Curtains({ sheer, blackout }: CurtainPositions) {
  const span = WINDOW.z1 - WINDOW.z0;
  const height = WINDOW.y1 - WINDOW.y0;
  const seg = span / PANELS;

  const layers = [
    { key: "blackout", pos: blackout, mat: materials.curtainBlackout, x: ROOM.w - 0.17 },
    { key: "sheer", pos: sheer, mat: materials.curtainSheer, x: ROOM.w - 0.3 },
  ];

  return (
    <group>
      {layers.map((layer) => {
        const gather = 1 - Math.max(0, Math.min(1, layer.pos / 100));
        return Array.from({ length: PANELS }, (_, i) => {
          const geo = makeCurtainGeometry({
            length: seg - PANEL_GAP,
            height,
            folds: 5,
            foldDepth: 0.045,
            gather,
          });
          // Panels bunch outward in pairs, so an opening curtain clears the
          // middle of the glazing rather than sliding off one end.
          const toStart = i < PANELS / 2;
          const z = toStart
            ? WINDOW.z0 + i * seg + PANEL_GAP / 2
            : WINDOW.z0 + (i + 1) * seg - PANEL_GAP / 2;
          return (
            <mesh
              key={`${layer.key}-${i}`}
              geometry={geo}
              material={layer.mat}
              position={[layer.x, WINDOW.y0, z]}
              scale={[1, 1, toStart ? 1 : -1]}
              castShadow={layer.key === "blackout"}
            />
          );
        });
      })}
    </group>
  );
}

function Glazing({ night }: { night: boolean }) {
  const cityTex = useMemo(() => makeCityTexture(night), [night]);
  const cityMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: cityTex,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    [cityTex],
  );

  const mullionZ = [WINDOW.z0, ROOM.d / 2, WINDOW.z1];

  return (
    <group>
      {/* The view, set back beyond the glass so it has some parallax. */}
      <mesh position={[ROOM.w + 5.5, ROOM.h / 2 + 0.6, ROOM.d / 2]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[22, 11]} />
        <primitive object={cityMat} attach="material" />
      </mesh>

      {/* Glass */}
      <mesh position={[ROOM.w - 0.02, (WINDOW.y0 + WINDOW.y1) / 2, ROOM.d / 2]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[WINDOW.z1 - WINDOW.z0, WINDOW.y1 - WINDOW.y0]} />
        <primitive object={materials.glass} attach="material" />
      </mesh>

      {/* Frame: head, sill and mullions. */}
      <mesh position={[ROOM.w - 0.03, WINDOW.y0, ROOM.d / 2]}>
        <boxGeometry args={[0.1, 0.12, ROOM.d]} />
        <primitive object={materials.metal} attach="material" />
      </mesh>
      {mullionZ.map((z, i) => (
        <mesh key={`mullion-${i}`} position={[ROOM.w - 0.03, (WINDOW.y0 + WINDOW.y1) / 2, z]}>
          <boxGeometry args={[0.08, WINDOW.y1 - WINDOW.y0, 0.06]} />
          <primitive object={materials.metal} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Fixture bodies                                                      */
/* ------------------------------------------------------------------ */

/**
 * The visible hardware: cove channel, downlight apertures, pendant.
 *
 * Bodies only — the emissive faces and the actual lights live in the rig, so
 * that a fixture switched off still has a physical presence in the room. A
 * downlight that vanishes when it is off is a giveaway.
 */
export const FIXTURES = {
  cove: { y: COVE_Y },
  downlights: [
    { x: 2.1, z: 1.1 },
    { x: 4.25, z: 1.25 },
    { x: 5.8, z: 1.6 },
  ],
  // Hangs just clear of the headboard's far end, as in the reference.
  pendant: { x: 5.78, z: 0.6, y: 1.44 },
} as const;

function FixtureBodies() {
  return (
    <group>
      {FIXTURES.downlights.map((d, i) => (
        <mesh key={`dl-body-${i}`} position={[d.x, ROOM.h - 0.012, d.z]}>
          <cylinderGeometry args={[0.055, 0.055, 0.024, 20]} />
          <primitive object={materials.metal} attach="material" />
        </mesh>
      ))}

      {/* Pendant: cord plus a slim cylinder body. */}
      <mesh
        position={[
          FIXTURES.pendant.x,
          (ROOM.h + FIXTURES.pendant.y + 0.18) / 2,
          FIXTURES.pendant.z,
        ]}
      >
        <cylinderGeometry args={[0.004, 0.004, ROOM.h - FIXTURES.pendant.y - 0.18, 6]} />
        <primitive object={materials.metal} attach="material" />
      </mesh>
      <mesh
        position={[FIXTURES.pendant.x, FIXTURES.pendant.y + 0.09, FIXTURES.pendant.z]}
      >
        <cylinderGeometry args={[0.028, 0.028, 0.18, 16]} />
        <primitive object={materials.metal} attach="material" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function MasterBedroom({
  curtains,
  night,
}: {
  curtains: CurtainPositions;
  night: boolean;
}) {
  return (
    <group>
      <Shell />
      <SlatWall />
      <Bed />
      <Rug />
      <Glazing night={night} />
      <Curtains {...curtains} />
      <FixtureBodies />
    </group>
  );
}
