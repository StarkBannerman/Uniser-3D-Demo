"use client";

/**
 * Living Room — geometry only.
 *
 * Modelled from the client's reference photograph: glazing with sheers and
 * drapes on the left wall, a media wall facing the camera, a hallway with timber
 * doors beyond it, stepped cove ceiling with recessed downlights in both the
 * raised field and the perimeter soffit.
 *
 * Self-contained rather than sharing the bedroom's `materials.ts`, because that
 * module's palette and `ROOM` dimensions are the bedroom's. Rooms differ in
 * every surface; sharing a palette between them would mean every tweak to one
 * silently changed the other.
 *
 * Coordinates in metres. Media wall is z = 0, glazing is x = 0, hallway is at
 * high x, and the camera sits near the front of the room looking at the media
 * wall slightly from the left — matching the reference viewpoint.
 */

import { useMemo } from "react";
import * as THREE from "three";
import { makeCurtainGeometry } from "./geometry";

export const LR = {
  w: 7.2,
  d: 6.2,
  h: 2.9,
  /** Perimeter step in the ceiling; the cove sits at its inner edge. */
  soffit: { depth: 0.55, drop: 0.18 },
  /** Hallway opening in the media wall, at the high-x end. */
  hall: { x0: 5.75, x1: 7.2, depth: 1.9 },
} as const;

export const LR_COVE_Y = LR.h - LR.soffit.drop + 0.03;

/** Glazing opening on the x = 0 wall. */
export const LR_WINDOW = { z0: 0.7, z1: 4.3, y0: 0.18, y1: LR.h - 0.42 };

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

const M = {
  ceiling: new THREE.MeshStandardMaterial({ color: "#f4f2ee", roughness: 0.96 }),
  soffit: new THREE.MeshStandardMaterial({ color: "#eeebe5", roughness: 0.93 }),
  wall: new THREE.MeshStandardMaterial({ color: "#e9e2d6", roughness: 0.94 }),
  // Warm plank floor with enough gloss to pick up the cove, as in the reference.
  floor: new THREE.MeshStandardMaterial({
    color: "#8a5a34",
    roughness: 0.32,
    metalness: 0.02,
  }),
  plank: new THREE.MeshStandardMaterial({ color: "#6f4526", roughness: 0.4 }),
  rug: new THREE.MeshStandardMaterial({ color: "#d9cfbc", roughness: 1 }),
  sofa: new THREE.MeshStandardMaterial({ color: "#78766f", roughness: 0.92 }),
  sofaSeat: new THREE.MeshStandardMaterial({ color: "#82807a", roughness: 0.92 }),
  cushion: new THREE.MeshStandardMaterial({ color: "#d6c4a0", roughness: 0.9 }),
  tableTop: new THREE.MeshStandardMaterial({ color: "#4a3524", roughness: 0.45 }),
  metal: new THREE.MeshStandardMaterial({
    color: "#33363b",
    roughness: 0.42,
    metalness: 0.7,
  }),
  consoleBody: new THREE.MeshStandardMaterial({ color: "#eceae6", roughness: 0.62 }),
  consoleWood: new THREE.MeshStandardMaterial({ color: "#6b4a2f", roughness: 0.48 }),
  tv: new THREE.MeshStandardMaterial({ color: "#101115", roughness: 0.28 }),
  doorWood: new THREE.MeshStandardMaterial({ color: "#6b4526", roughness: 0.44 }),
  drape: new THREE.MeshPhysicalMaterial({
    color: "#9b8873",
    roughness: 0.9,
    sheen: 0.5,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color("#fff0dc"),
    side: THREE.DoubleSide,
  }),
  sheer: new THREE.MeshPhysicalMaterial({
    color: "#eef1f4",
    roughness: 0.6,
    transparent: true,
    opacity: 0.5,
    transmission: 0.6,
    thickness: 0.02,
    side: THREE.DoubleSide,
  }),
  foliage: new THREE.MeshStandardMaterial({ color: "#4f6f4a", roughness: 0.8 }),
  pot: new THREE.MeshStandardMaterial({ color: "#e6e2da", roughness: 0.7 }),
  art: new THREE.MeshStandardMaterial({ color: "#5d7794", roughness: 0.75 }),
};

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

function Shell() {
  const { w, d, h, soffit } = LR;
  const soffitY = h - soffit.drop / 2;

  // Plank joints. Cheap, and the single strongest cue that the floor is timber
  // rather than a brown plane — the reference floor is mostly read by its lines.
  const planks = useMemo(
    () => Array.from({ length: 18 }, (_, i) => 0.2 + i * 0.4),
    [],
  );

  return (
    <group>
      <mesh position={[w / 2, 0, d / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <primitive object={M.floor} attach="material" />
      </mesh>
      {planks.map((x) => (
        <mesh key={`plank-${x}`} position={[x, 0.002, d / 2]}>
          <boxGeometry args={[0.012, 0.002, d]} />
          <primitive object={M.plank} attach="material" />
        </mesh>
      ))}

      <mesh position={[w / 2, h, d / 2]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <primitive object={M.ceiling} attach="material" />
      </mesh>

      {/* Media wall, glazing wall, far wall and the wall behind the camera. */}
      <mesh position={[LR.hall.x0 / 2, h / 2, 0]} receiveShadow>
        <planeGeometry args={[LR.hall.x0, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      <mesh position={[0, h / 2, d / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      <mesh position={[w, h / 2, d / 2]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      <mesh position={[w / 2, h / 2, d]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>

      {/* Perimeter soffit — the stepped false ceiling the cove sits in. */}
      {[
        { pos: [w / 2, soffitY, soffit.depth / 2], size: [w, soffit.drop, soffit.depth] },
        { pos: [w / 2, soffitY, d - soffit.depth / 2], size: [w, soffit.drop, soffit.depth] },
        { pos: [soffit.depth / 2, soffitY, d / 2], size: [soffit.depth, soffit.drop, d] },
        { pos: [w - soffit.depth / 2, soffitY, d / 2], size: [soffit.depth, soffit.drop, d] },
      ].map((s, i) => (
        <mesh key={`sof-${i}`} position={s.pos as [number, number, number]} receiveShadow castShadow>
          <boxGeometry args={s.size as [number, number, number]} />
          <primitive object={M.soffit} attach="material" />
        </mesh>
      ))}

      {/* Skirting, which grounds the walls against the floor. */}
      {[
        { pos: [w / 2, 0.05, 0.01], size: [w, 0.1, 0.02] },
        { pos: [0.01, 0.05, d / 2], size: [0.02, 0.1, d] },
      ].map((s, i) => (
        <mesh key={`skirt-${i}`} position={s.pos as [number, number, number]}>
          <boxGeometry args={s.size as [number, number, number]} />
          <primitive object={M.consoleBody} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Glazing, sheers and drapes                                          */
/* ------------------------------------------------------------------ */

export interface LivingCurtains {
  sheer: number;
  blackout: number;
}

function Glazing({ sheer, blackout, daylight }: LivingCurtains & { daylight: number }) {
  const span = LR_WINDOW.z1 - LR_WINDOW.z0;
  const height = LR_WINDOW.y1 - LR_WINDOW.y0;

  // The view outside is a bright card rather than a modelled exterior. The
  // reference window is fully blown out, which is exactly what a camera does
  // exposing for an interior — so matching it means a flat luminous panel, not
  // a detailed skyline nobody can see anyway.
  const outsideMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#e8f0f7").multiplyScalar(0.45 + daylight * 2.6),
        toneMapped: false,
      }),
    [daylight],
  );

  const layers = [
    { key: "sheer", pos: sheer, mat: M.sheer, x: 0.22, folds: 12, depth: 0.035 },
    { key: "drape", pos: blackout, mat: M.drape, x: 0.34, folds: 6, depth: 0.07 },
  ];

  return (
    <group>
      <mesh position={[-0.06, (LR_WINDOW.y0 + LR_WINDOW.y1) / 2, (LR_WINDOW.z0 + LR_WINDOW.z1) / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[span, height]} />
        <primitive object={outsideMat} attach="material" />
      </mesh>

      {/* Frame and mullions. */}
      {[LR_WINDOW.z0, (LR_WINDOW.z0 + LR_WINDOW.z1) / 2, LR_WINDOW.z1].map((z, i) => (
        <mesh key={`mul-${i}`} position={[0.02, (LR_WINDOW.y0 + LR_WINDOW.y1) / 2, z]}>
          <boxGeometry args={[0.05, height, 0.05]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
      <mesh position={[0.02, LR_WINDOW.y0, (LR_WINDOW.z0 + LR_WINDOW.z1) / 2]}>
        <boxGeometry args={[0.06, 0.05, span]} />
        <primitive object={M.metal} attach="material" />
      </mesh>

      {layers.map((layer) =>
        [0, 1].map((side) => {
          const gather = 1 - Math.max(0, Math.min(1, layer.pos / 100));
          const geo = makeCurtainGeometry({
            length: span / 2,
            height,
            folds: layer.folds,
            foldDepth: layer.depth,
            gather,
          });
          const z = side === 0 ? LR_WINDOW.z0 : LR_WINDOW.z1;
          return (
            <mesh
              key={`${layer.key}-${side}`}
              geometry={geo}
              material={layer.mat}
              position={[layer.x, LR_WINDOW.y0, z]}
              scale={[1, 1, side === 0 ? 1 : -1]}
              castShadow={layer.key === "drape"}
            />
          );
        }),
      )}

      {/* Pelmet */}
      <mesh position={[0.3, LR_WINDOW.y1 + 0.06, (LR_WINDOW.z0 + LR_WINDOW.z1) / 2]}>
        <boxGeometry args={[0.5, 0.08, span + 0.5]} />
        <primitive object={M.soffit} attach="material" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Media wall                                                          */
/* ------------------------------------------------------------------ */

export const LR_TV = { x: 4.35, y: 1.48, w: 1.55, h: 0.9 };

function MediaWall({ tvOn }: { tvOn: boolean }) {
  return (
    <group>
      {/* Long low console: timber carcass with pale doors, as in the reference. */}
      <mesh position={[4.3, 0.28, 0.26]} castShadow receiveShadow>
        <boxGeometry args={[3.5, 0.42, 0.44]} />
        <primitive object={M.consoleWood} attach="material" />
      </mesh>
      {[-1.3, -0.44, 0.42, 1.28].map((dx) => (
        <mesh key={`door-${dx}`} position={[4.3 + dx, 0.28, 0.49]}>
          <boxGeometry args={[0.82, 0.34, 0.02]} />
          <primitive object={M.consoleBody} attach="material" />
        </mesh>
      ))}
      {[-1.66, 1.66].map((dx) => (
        <mesh key={`leg-${dx}`} position={[4.3 + dx, 0.04, 0.3]}>
          <boxGeometry args={[0.04, 0.08, 0.04]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}

      {/* Television */}
      <mesh position={[LR_TV.x, LR_TV.y, 0.06]} castShadow>
        <boxGeometry args={[LR_TV.w, LR_TV.h, 0.06]} />
        <primitive object={M.tv} attach="material" />
      </mesh>
      {tvOn && (
        <mesh position={[LR_TV.x, LR_TV.y, 0.095]}>
          <planeGeometry args={[LR_TV.w - 0.05, LR_TV.h - 0.05]} />
          <meshStandardMaterial
            color="#000000"
            emissive="#9fb6d8"
            emissiveIntensity={1.7}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* Open shelving at the near end of the media wall. */}
      <group position={[2.45, 0, 0.3]}>
        {[0.02, 0.44, 0.86, 1.28, 1.7].map((y) => (
          <mesh key={`shelf-${y}`} position={[0, y, 0]}>
            <boxGeometry args={[0.5, 0.025, 0.34]} />
            <primitive object={M.consoleWood} attach="material" />
          </mesh>
        ))}
        {[-0.24, 0.24].map((dx) =>
          [-0.16, 0.16].map((dz) => (
            <mesh key={`post-${dx}-${dz}`} position={[dx, 0.86, dz]}>
              <boxGeometry args={[0.02, 1.72, 0.02]} />
              <primitive object={M.metal} attach="material" />
            </mesh>
          )),
        )}
        {[0.44, 0.86, 1.28].map((y, i) => (
          <group key={`plant-${y}`} position={[i % 2 === 0 ? -0.12 : 0.12, y + 0.11, 0]}>
            <mesh>
              <cylinderGeometry args={[0.05, 0.04, 0.1, 12]} />
              <primitive object={M.pot} attach="material" />
            </mesh>
            <mesh position={[0, 0.1, 0]}>
              <sphereGeometry args={[0.09, 10, 8]} />
              <primitive object={M.foliage} attach="material" />
            </mesh>
          </group>
        ))}
      </group>

      {/* Floor plant beside the console. */}
      <group position={[5.5, 0, 0.42]}>
        <mesh position={[0, 0.13, 0]}>
          <cylinderGeometry args={[0.13, 0.1, 0.26, 16]} />
          <primitive object={M.pot} attach="material" />
        </mesh>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh
            key={`leaf-${i}`}
            position={[Math.sin(i * 1.3) * 0.1, 0.42 + (i % 3) * 0.07, Math.cos(i * 1.3) * 0.08]}
            rotation={[0, i * 1.3, Math.sin(i) * 0.4]}
          >
            <sphereGeometry args={[0.13, 10, 6]} />
            <primitive object={M.foliage} attach="material" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Hallway                                                             */
/* ------------------------------------------------------------------ */

function Hallway() {
  const { hall, h } = LR;
  const width = hall.x1 - hall.x0;

  return (
    <group>
      {/* Recess beyond the opening, so the doorway has somewhere to lead. */}
      <mesh position={[(hall.x0 + hall.x1) / 2, h / 2, -hall.depth]} receiveShadow>
        <planeGeometry args={[width, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      <mesh position={[hall.x0, h / 2, -hall.depth / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[hall.depth, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      <mesh position={[(hall.x0 + hall.x1) / 2, 0, -hall.depth / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, hall.depth]} />
        <primitive object={M.floor} attach="material" />
      </mesh>
      <mesh position={[(hall.x0 + hall.x1) / 2, h, -hall.depth / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, hall.depth]} />
        <primitive object={M.ceiling} attach="material" />
      </mesh>

      {/* Head of the opening. */}
      <mesh position={[(hall.x0 + hall.x1) / 2, h - 0.2, 0]}>
        <boxGeometry args={[width, 0.4, 0.16]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      {/* Reveal on the room side. */}
      <mesh position={[hall.x0 - 0.06, h / 2, 0]}>
        <boxGeometry args={[0.12, h, 0.16]} />
        <primitive object={M.doorWood} attach="material" />
      </mesh>

      {/* Two timber doors in the passage. */}
      {[
        { pos: [hall.x0 + 0.07, 1.03, -0.85] as [number, number, number], rot: [0, Math.PI / 2, 0] as [number, number, number], size: [0.85, 2.06, 0.05] as [number, number, number] },
        { pos: [(hall.x0 + hall.x1) / 2 + 0.35, 1.03, -hall.depth + 0.04] as [number, number, number], rot: [0, 0, 0] as [number, number, number], size: [0.85, 2.06, 0.05] as [number, number, number] },
      ].map((door, i) => (
        <mesh key={`door-${i}`} position={door.pos} rotation={door.rot} castShadow>
          <boxGeometry args={door.size} />
          <primitive object={M.doorWood} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Seating                                                             */
/* ------------------------------------------------------------------ */

function Seating() {
  return (
    <group>
      {/* Rug, under the table and the front of the sofa. */}
      <mesh position={[2.6, 0.006, 2.75]} receiveShadow>
        <boxGeometry args={[2.9, 0.012, 2.5]} />
        <primitive object={M.rug} attach="material" />
      </mesh>

      {/* L-shaped sectional. Built as separate seat and back cushions rather
          than one upholstered block: a sofa reads by its seams, and a single
          long box at this focal length looks like a bench. */}
      <group position={[1.5, 0, 2.85]}>
        {/* Long run: frame, then three cushions. */}
        <mesh position={[0.55, 0.18, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.7, 0.36, 0.95]} />
          <primitive object={M.sofa} attach="material" />
        </mesh>
        <mesh position={[0.55, 0.54, -0.42]} castShadow receiveShadow>
          <boxGeometry args={[2.7, 0.68, 0.2]} />
          <primitive object={M.sofa} attach="material" />
        </mesh>
        {[-0.35, 0.55, 1.45].map((x) => (
          <group key={`run-${x}`}>
            <mesh position={[x, 0.42, 0.02]} castShadow receiveShadow>
              <boxGeometry args={[0.85, 0.16, 0.82]} />
              <primitive object={M.sofaSeat} attach="material" />
            </mesh>
            <mesh position={[x, 0.66, -0.3]} rotation={[-0.14, 0, 0]} castShadow>
              <boxGeometry args={[0.85, 0.52, 0.16]} />
              <primitive object={M.sofaSeat} attach="material" />
            </mesh>
          </group>
        ))}
        <mesh position={[1.98, 0.4, -0.02]} castShadow receiveShadow>
          <boxGeometry args={[0.24, 0.52, 0.95]} />
          <primitive object={M.sofa} attach="material" />
        </mesh>

        {/* Chaise return. Deliberately short — a full-length return reached to
            within a metre of the camera and filled the lower third of frame. */}
        <mesh position={[-1.05, 0.18, 0.45]} castShadow receiveShadow>
          <boxGeometry args={[0.95, 0.36, 1.8]} />
          <primitive object={M.sofa} attach="material" />
        </mesh>
        {[-0.05, 0.85].map((z) => (
          <mesh key={`ch-${z}`} position={[-1.05, 0.42, z]} castShadow receiveShadow>
            <boxGeometry args={[0.82, 0.16, 0.82]} />
            <primitive object={M.sofaSeat} attach="material" />
          </mesh>
        ))}
        <mesh position={[-1.41, 0.54, 0.45]} castShadow receiveShadow>
          <boxGeometry args={[0.22, 0.68, 1.8]} />
          <primitive object={M.sofa} attach="material" />
        </mesh>

        {/* Cushions */}
        {[
          { p: [-1.02, 0.62, -0.28], r: -0.3 },
          { p: [-1.04, 0.6, 0.45], r: -0.22 },
          { p: [0.1, 0.62, -0.16], r: -0.28 },
        ].map((c, i) => (
          <mesh
            key={`cu-${i}`}
            position={c.p as [number, number, number]}
            rotation={[c.r, 0.2, 0]}
            castShadow
          >
            <boxGeometry args={[0.4, 0.4, 0.13]} />
            <primitive object={M.cushion} attach="material" />
          </mesh>
        ))}
      </group>

      {/* Coffee table: dark top on a black metal frame. */}
      <group position={[2.75, 0, 2.7]}>
        <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.05, 0.06, 0.62]} />
          <primitive object={M.tableTop} attach="material" />
        </mesh>
        {[[-0.46, -0.26], [0.46, -0.26], [-0.46, 0.26], [0.46, 0.26]].map(([dx, dz], i) => (
          <mesh key={`tl-${i}`} position={[dx, 0.17, dz]}>
            <boxGeometry args={[0.03, 0.34, 0.03]} />
            <primitive object={M.metal} attach="material" />
          </mesh>
        ))}
        <mesh position={[0.1, 0.44, 0]}>
          <sphereGeometry args={[0.08, 10, 8]} />
          <primitive object={M.foliage} attach="material" />
        </mesh>
      </group>

      {/* Framed artwork on the glazing wall, near the camera. */}
      <group position={[0.04, 1.55, 5.4]}>
        <mesh rotation={[0, Math.PI / 2, 0]} castShadow>
          <boxGeometry args={[0.72, 0.95, 0.04]} />
          <primitive object={M.doorWood} attach="material" />
        </mesh>
        <mesh position={[0.03, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.62, 0.85]} />
          <primitive object={M.art} attach="material" />
        </mesh>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function LivingRoom3D({
  curtains,
  tvOn,
  daylight,
}: {
  curtains: LivingCurtains;
  tvOn: boolean;
  /** 0..1 exterior brightness, so the window tracks the simulated clock. */
  daylight: number;
}) {
  return (
    <group>
      <Shell />
      <Glazing {...curtains} daylight={daylight} />
      <MediaWall tvOn={tvOn} />
      <Hallway />
      <Seating />
    </group>
  );
}
