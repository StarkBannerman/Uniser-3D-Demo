"use client";

/**
 * Living Room — geometry only.
 *
 * Modelled from the client's reference photograph. The layout point that
 * matters, and that a first attempt got wrong: the glazing wall and the media
 * wall **face each other** down the length of the room, and the camera stands at
 * one end looking along it. Treating them as adjacent walls meeting in a corner
 * puts the sofa's back to the television, which is both wrong and immediately
 * obvious.
 *
 *        z = 0  ┌──────────────────┐  far wall + hallway
 *               │                  │
 *   glazing     │      sofa  ▸ TV  │      media wall
 *   x = 0       │                  │      x = LR.w
 *               └───────▲──────────┘
 *                    camera, high z
 *
 * Self-contained rather than sharing the bedroom's materials, because rooms
 * differ in every surface and a shared palette means one room's tweak silently
 * changes the other.
 *
 * Coordinates in metres.
 */

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { MAX_BLADE_STEP_RAD } from "@/lib/sim/fan";
import { makeCurtainGeometry } from "./geometry";

export const LR = {
  /** Across the room: glazing at x = 0, media wall at x = w. */
  w: 6.0,
  /** Down the room, away from the camera. */
  d: 7.2,
  h: 2.9,
  /** Perimeter step in the ceiling; the cove sits at its inner edge. */
  soffit: { depth: 0.5, drop: 0.16 },
  /** Hallway opening in the far wall, at the media-wall end. */
  hall: { x0: 3.9, x1: 6.0, depth: 1.9 },
} as const;

export const LR_COVE_Y = LR.h - LR.soffit.drop + 0.025;
export const LR_WINDOW = { z0: 1.3, z1: 5.6, y0: 0.18, y1: LR.h - 0.4 };
export const LR_TV = { z: 3.1, y: 1.45, w: 1.75, h: 1.0 };

/**
 * Where the rest of the client's sheet lands in the room.
 *
 * The callouts on that drawing are not decoration — each one is a device in the
 * space config, and each needs somewhere real to live. Sharing the coordinates
 * with the light rig keeps a strip and the thing it is supposed to be lighting
 * from drifting apart.
 */
export const LR_PLAN = {
  /** Pendant cluster: seven globes on staggered drops, left of the seating. */
  pendants: { x: 1.35, z: 2.05 },
  /** Shelving niches in the media wall, lit from inside. */
  niche: { z0: 0.95, z1: 2.25, y0: 0.35, y1: 2.25, bays: 3 },
  /** Floorstanders either side of the television. */
  speakers: [
    { z: LR_TV.z - 1.22 },
    { z: LR_TV.z + 1.22 },
  ],
  /** Ceiling fan hub. */
  fan: { x: 2.95, z: 3.5, y: 2.42 },
} as const;

/** Globe positions within the pendant cluster, relative to `LR_PLAN.pendants`. */
export const LR_PENDANT_GLOBES: { dx: number; dz: number; y: number; r: number }[] = [
  { dx: -0.34, dz: -0.12, y: 1.72, r: 0.115 },
  { dx: -0.12, dz: 0.22, y: 2.02, r: 0.095 },
  { dx: 0.14, dz: -0.24, y: 1.88, r: 0.105 },
  { dx: 0.36, dz: 0.1, y: 2.16, r: 0.09 },
  { dx: -0.02, dz: -0.02, y: 1.52, r: 0.125 },
  { dx: 0.3, dz: 0.34, y: 1.66, r: 0.1 },
  { dx: -0.36, dz: 0.34, y: 2.08, r: 0.085 },
];

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

/**
 * Neutral and light, not warm.
 *
 * The reference room's walls are near-white; its warmth comes entirely from the
 * cove. Baking warmth into the albedo as well made an earlier pass read as
 * uniformly orange, because the tint was applied twice.
 */
const M = {
  ceiling: new THREE.MeshStandardMaterial({ color: "#f6f5f2", roughness: 0.96 }),
  soffit: new THREE.MeshStandardMaterial({ color: "#f2f0eb", roughness: 0.93 }),
  wall: new THREE.MeshStandardMaterial({ color: "#efebe3", roughness: 0.94 }),
  /** Muted, not orange. The first pass used a saturated red-brown that the
      warm cove multiplied into a room lit by a bonfire. */
  floor: new THREE.MeshStandardMaterial({
    color: "#6b5647",
    roughness: 0.34,
    metalness: 0.02,
  }),
  plank: new THREE.MeshStandardMaterial({ color: "#584639", roughness: 0.42 }),
  rug: new THREE.MeshStandardMaterial({ color: "#ddd3c1", roughness: 1 }),
  sofa: new THREE.MeshStandardMaterial({ color: "#6f6e6b", roughness: 0.93 }),
  sofaSeat: new THREE.MeshStandardMaterial({ color: "#7b7a76", roughness: 0.93 }),
  cushion: new THREE.MeshStandardMaterial({ color: "#cbb894", roughness: 0.9 }),
  tableTop: new THREE.MeshStandardMaterial({ color: "#43301f", roughness: 0.45 }),
  metal: new THREE.MeshStandardMaterial({
    color: "#2f3237",
    roughness: 0.42,
    metalness: 0.7,
  }),
  consoleBody: new THREE.MeshStandardMaterial({ color: "#f0eee9", roughness: 0.6 }),
  consoleWood: new THREE.MeshStandardMaterial({ color: "#6a482c", roughness: 0.48 }),
  tv: new THREE.MeshStandardMaterial({ color: "#0e0f12", roughness: 0.26 }),
  doorWood: new THREE.MeshStandardMaterial({ color: "#6b4526", roughness: 0.44 }),
  drape: new THREE.MeshPhysicalMaterial({
    color: "#a8917a",
    roughness: 0.9,
    sheen: 0.5,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color("#fff0dc"),
    side: THREE.DoubleSide,
  }),
  sheer: new THREE.MeshPhysicalMaterial({
    color: "#f2f5f8",
    roughness: 0.6,
    transparent: true,
    opacity: 0.46,
    transmission: 0.62,
    thickness: 0.02,
    side: THREE.DoubleSide,
  }),
  foliage: new THREE.MeshStandardMaterial({ color: "#4c6b46", roughness: 0.8 }),
  pot: new THREE.MeshStandardMaterial({ color: "#eae6de", roughness: 0.7 }),
  art: new THREE.MeshStandardMaterial({ color: "#54708c", roughness: 0.75 }),
  /** Book-matched stone behind the television. */
  stone: new THREE.MeshStandardMaterial({
    color: "#8d8377",
    roughness: 0.28,
    metalness: 0.05,
  }),
  nicheBack: new THREE.MeshStandardMaterial({ color: "#3a2d22", roughness: 0.8 }),
  speaker: new THREE.MeshStandardMaterial({ color: "#1a1b1e", roughness: 0.55 }),
  cone: new THREE.MeshStandardMaterial({ color: "#2e3034", roughness: 0.7 }),
  brass: new THREE.MeshStandardMaterial({
    color: "#b08d55",
    roughness: 0.3,
    metalness: 0.85,
  }),
  fanBlade: new THREE.MeshStandardMaterial({ color: "#3b3129", roughness: 0.55 }),
};

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

function Shell() {
  const { w, d, h, soffit, hall } = LR;
  const soffitY = h - soffit.drop / 2;

  // Plank joints run down the length of the room, as in the reference. Cheap,
  // and the strongest cue that the floor is timber rather than a brown plane.
  const planks = useMemo(() => Array.from({ length: 15 }, (_, i) => 0.2 + i * 0.4), []);

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

      {/* Glazing wall (behind the curtains), media wall, and the wall behind
          the camera. */}
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

      {/* Far wall, stopping at the hallway opening rather than sealing it. */}
      <mesh position={[hall.x0 / 2, h / 2, 0]} receiveShadow>
        <planeGeometry args={[hall.x0, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>

      {/* Perimeter soffit. */}
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

      {/* Skirting. */}
      {[
        { pos: [w - 0.01, 0.05, d / 2], size: [0.02, 0.1, d] },
        { pos: [hall.x0 / 2, 0.05, 0.01], size: [hall.x0, 0.1, 0.02] },
      ].map((s, i) => (
        <mesh key={`sk-${i}`} position={s.pos as [number, number, number]}>
          <boxGeometry args={s.size as [number, number, number]} />
          <primitive object={M.consoleBody} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Glazing                                                             */
/* ------------------------------------------------------------------ */

export interface LivingCurtains {
  sheer: number;
  blackout: number;
}

function Glazing({ sheer, blackout, daylight }: LivingCurtains & { daylight: number }) {
  const span = LR_WINDOW.z1 - LR_WINDOW.z0;
  const height = LR_WINDOW.y1 - LR_WINDOW.y0;

  // A flat luminous card, not a modelled exterior. The reference window is
  // completely blown out, which is what a camera exposing for an interior does —
  // so a detailed view outside would be both invisible and wrong.
  const outside = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#eaf1f8").multiplyScalar(0.2 + daylight * 0.78),
        toneMapped: false,
      }),
    [daylight],
  );

  return (
    <group>
      <mesh
        position={[-0.05, (LR_WINDOW.y0 + LR_WINDOW.y1) / 2, (LR_WINDOW.z0 + LR_WINDOW.z1) / 2]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[span, height]} />
        <primitive object={outside} attach="material" />
      </mesh>

      {[LR_WINDOW.z0, LR_WINDOW.z0 + span / 3, LR_WINDOW.z0 + (2 * span) / 3, LR_WINDOW.z1].map(
        (z, i) => (
          <mesh key={`mul-${i}`} position={[0.03, (LR_WINDOW.y0 + LR_WINDOW.y1) / 2, z]}>
            <boxGeometry args={[0.05, height, 0.05]} />
            <primitive object={M.metal} attach="material" />
          </mesh>
        ),
      )}

      {[
        { key: "sheer", pos: sheer, mat: M.sheer, x: 0.2, folds: 14, depth: 0.03 },
        { key: "drape", pos: blackout, mat: M.drape, x: 0.33, folds: 7, depth: 0.075 },
      ].map((layer) =>
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

      <mesh position={[0.28, LR_WINDOW.y1 + 0.07, (LR_WINDOW.z0 + LR_WINDOW.z1) / 2]}>
        <boxGeometry args={[0.48, 0.1, span + 0.4]} />
        <primitive object={M.soffit} attach="material" />
      </mesh>

      {/* Framed artwork on the glazing wall, beyond the window. */}
      <group position={[0.04, 1.6, 0.7]}>
        <mesh rotation={[0, Math.PI / 2, 0]} castShadow>
          <boxGeometry args={[0.66, 0.88, 0.04]} />
          <primitive object={M.doorWood} attach="material" />
        </mesh>
        <mesh position={[0.03, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.56, 0.78]} />
          <primitive object={M.art} attach="material" />
        </mesh>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Media wall — on x = w, facing the sofa                              */
/* ------------------------------------------------------------------ */

function MediaWall({ tvOn }: { tvOn: boolean }) {
  const x = LR.w;

  return (
    <group>
      {/* Long low console running along the wall. */}
      <mesh position={[x - 0.23, 0.28, 3.2]} castShadow receiveShadow>
        <boxGeometry args={[0.44, 0.42, 3.4]} />
        <primitive object={M.consoleWood} attach="material" />
      </mesh>
      {[-1.25, -0.42, 0.42, 1.25].map((dz) => (
        <mesh key={`door-${dz}`} position={[x - 0.46, 0.28, 3.2 + dz]}>
          <boxGeometry args={[0.02, 0.34, 0.78]} />
          <primitive object={M.consoleBody} attach="material" />
        </mesh>
      ))}
      {[-1.6, 1.6].map((dz) => (
        <mesh key={`leg-${dz}`} position={[x - 0.27, 0.04, 3.2 + dz]}>
          <boxGeometry args={[0.04, 0.08, 0.04]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}

      {/* Television, face pointing into the room. */}
      <mesh position={[x - 0.05, LR_TV.y, LR_TV.z]} castShadow>
        <boxGeometry args={[0.06, LR_TV.h, LR_TV.w]} />
        <primitive object={M.tv} attach="material" />
      </mesh>
      {tvOn && (
        <mesh position={[x - 0.09, LR_TV.y, LR_TV.z]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[LR_TV.w - 0.06, LR_TV.h - 0.06]} />
          {/* A television is bright, not a lightbox. At 1.7 it clipped to flat
              white in a darkened room, which is the one place the screen most
              needs to still look like a picture. */}
          <meshStandardMaterial
            color="#000000"
            emissive="#8fa8cc"
            emissiveIntensity={0.85}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* Open shelving at the far end of the media wall. */}
      <group position={[x - 0.3, 0, 1.35]}>
        {[0.02, 0.44, 0.86, 1.28, 1.7].map((y) => (
          <mesh key={`sh-${y}`} position={[0, y, 0]}>
            <boxGeometry args={[0.34, 0.025, 0.5]} />
            <primitive object={M.consoleWood} attach="material" />
          </mesh>
        ))}
        {[-0.16, 0.16].map((dx) =>
          [-0.24, 0.24].map((dz) => (
            <mesh key={`p-${dx}-${dz}`} position={[dx, 0.86, dz]}>
              <boxGeometry args={[0.02, 1.72, 0.02]} />
              <primitive object={M.metal} attach="material" />
            </mesh>
          )),
        )}
        {[0.44, 0.86, 1.28].map((y, i) => (
          <group key={`pl-${y}`} position={[0, y + 0.11, i % 2 === 0 ? -0.12 : 0.12]}>
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

      {/* Floor plant at the near end of the console. */}
      <group position={[x - 0.35, 0, 5.15]}>
        <mesh position={[0, 0.13, 0]}>
          <cylinderGeometry args={[0.13, 0.1, 0.26, 16]} />
          <primitive object={M.pot} attach="material" />
        </mesh>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh
            key={`lf-${i}`}
            position={[Math.sin(i * 1.3) * 0.09, 0.42 + (i % 3) * 0.07, Math.cos(i * 1.3) * 0.09]}
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
  const cx = (hall.x0 + hall.x1) / 2;

  return (
    <group>
      <mesh position={[cx, h / 2, -hall.depth]} receiveShadow>
        <planeGeometry args={[width, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      <mesh position={[hall.x0, h / 2, -hall.depth / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[hall.depth, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      <mesh position={[cx, 0, -hall.depth / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, hall.depth]} />
        <primitive object={M.floor} attach="material" />
      </mesh>
      <mesh position={[cx, h, -hall.depth / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, hall.depth]} />
        <primitive object={M.ceiling} attach="material" />
      </mesh>

      <mesh position={[cx, h - 0.2, 0]}>
        <boxGeometry args={[width, 0.4, 0.16]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      <mesh position={[hall.x0 - 0.06, h / 2, 0]}>
        <boxGeometry args={[0.12, h, 0.16]} />
        <primitive object={M.doorWood} attach="material" />
      </mesh>

      {/* Two timber doors, as in the reference. */}
      <mesh position={[hall.x0 + 0.07, 1.03, -1.0]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <boxGeometry args={[0.9, 2.06, 0.05]} />
        <primitive object={M.doorWood} attach="material" />
      </mesh>
      <mesh position={[cx + 0.4, 1.03, -hall.depth + 0.04]} castShadow>
        <boxGeometry args={[0.9, 2.06, 0.05]} />
        <primitive object={M.doorWood} attach="material" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Seating — back to the glazing, facing the media wall                */
/* ------------------------------------------------------------------ */

function Seating() {
  return (
    <group>
      <mesh position={[2.6, 0.006, 3.7]} receiveShadow>
        <boxGeometry args={[2.7, 0.012, 3.0]} />
        <primitive object={M.rug} attach="material" />
      </mesh>

      {/* Sectional. Long run parallel to the glazing with its back to the
          window, seats facing +x toward the television; chaise returns across
          the near end toward the camera. */}
      <group position={[1.5, 0, 3.6]}>
        {/* Long run */}
        <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.95, 0.36, 2.6]} />
          <primitive object={M.sofa} attach="material" />
        </mesh>
        <mesh position={[-0.42, 0.54, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.2, 0.68, 2.6]} />
          <primitive object={M.sofa} attach="material" />
        </mesh>
        {[-0.85, 0, 0.85].map((z) => (
          <group key={`run-${z}`}>
            <mesh position={[0.03, 0.42, z]} castShadow receiveShadow>
              <boxGeometry args={[0.82, 0.16, 0.82]} />
              <primitive object={M.sofaSeat} attach="material" />
            </mesh>
            <mesh position={[-0.3, 0.66, z]} rotation={[0, 0, 0.14]} castShadow>
              <boxGeometry args={[0.16, 0.52, 0.82]} />
              <primitive object={M.sofaSeat} attach="material" />
            </mesh>
          </group>
        ))}
        {/* Far arm */}
        <mesh position={[0, 0.4, -1.42]} castShadow receiveShadow>
          <boxGeometry args={[0.95, 0.52, 0.24]} />
          <primitive object={M.sofa} attach="material" />
        </mesh>

        {/* Chaise across the near end. */}
        <mesh position={[0.85, 0.18, 1.75]} castShadow receiveShadow>
          <boxGeometry args={[2.65, 0.36, 0.95]} />
          <primitive object={M.sofa} attach="material" />
        </mesh>
        {[0.15, 1.05].map((x) => (
          <mesh key={`ch-${x}`} position={[x, 0.42, 1.75]} castShadow receiveShadow>
            <boxGeometry args={[0.82, 0.16, 0.82]} />
            <primitive object={M.sofaSeat} attach="material" />
          </mesh>
        ))}
        <mesh position={[0.85, 0.54, 2.17]} castShadow receiveShadow>
          <boxGeometry args={[2.65, 0.68, 0.2]} />
          <primitive object={M.sofa} attach="material" />
        </mesh>

        {/* Cushions */}
        {[
          { p: [-0.2, 0.64, -0.75], r: 0.3 },
          { p: [-0.22, 0.62, 0.15], r: 0.24 },
          { p: [0.7, 0.62, 1.95], r: -0.26 },
        ].map((c, i) => (
          <mesh
            key={`cu-${i}`}
            position={c.p as [number, number, number]}
            rotation={[0, 0.25, c.r]}
            castShadow
          >
            <boxGeometry args={[0.14, 0.4, 0.4]} />
            <primitive object={M.cushion} attach="material" />
          </mesh>
        ))}
      </group>

      {/* Coffee table, between the sofa and the media wall. */}
      <group position={[3.35, 0, 3.5]}>
        <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.66, 0.06, 1.1]} />
          <primitive object={M.tableTop} attach="material" />
        </mesh>
        {[[-0.28, -0.48], [0.28, -0.48], [-0.28, 0.48], [0.28, 0.48]].map(([dx, dz], i) => (
          <mesh key={`tl-${i}`} position={[dx, 0.17, dz]}>
            <boxGeometry args={[0.03, 0.34, 0.03]} />
            <primitive object={M.metal} attach="material" />
          </mesh>
        ))}
        <mesh position={[0, 0.45, 0.1]}>
          <sphereGeometry args={[0.08, 10, 8]} />
          <primitive object={M.foliage} attach="material" />
        </mesh>
      </group>
    </group>
  );
}


/* ------------------------------------------------------------------ */
/* Feature wall, speakers and the pendant cluster                      */
/* ------------------------------------------------------------------ */

/**
 * Stone panel behind the television, with lit shelving niches beside it.
 *
 * The niches are the point. Accent lighting is the hardest layer to sell on a
 * drawing because it does nothing measurable — you argue for it by switching it
 * off and watching the wall go flat. That only works if there is something in
 * the recess to be revealed, so the shelves carry objects rather than being
 * empty boxes.
 */
function FeatureWall() {
  const x = LR.w;
  const n = LR_PLAN.niche;
  const bayH = (n.y1 - n.y0) / n.bays;

  return (
    <group>
      {/* Book-matched stone, floor to soffit, behind the television. */}
      <mesh position={[x - 0.02, (LR.h - LR.soffit.drop) / 2, LR_TV.z]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[2.9, LR.h - LR.soffit.drop]} />
        <primitive object={M.stone} attach="material" />
      </mesh>

      {/* Recessed niches, set into the wall beside it. */}
      <mesh
        position={[x - 0.16, (n.y0 + n.y1) / 2, (n.z0 + n.z1) / 2]}
        rotation={[0, -Math.PI / 2, 0]}
        receiveShadow
      >
        <planeGeometry args={[n.z1 - n.z0, n.y1 - n.y0]} />
        <primitive object={M.nicheBack} attach="material" />
      </mesh>
      {Array.from({ length: n.bays + 1 }, (_, i) => (
        <mesh
          key={`shelf-${i}`}
          position={[x - 0.1, n.y0 + i * bayH, (n.z0 + n.z1) / 2]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.2, 0.03, n.z1 - n.z0]} />
          <primitive object={M.consoleWood} attach="material" />
        </mesh>
      ))}
      {/* Objects on the shelves, so the accent layer has something to reveal. */}
      {Array.from({ length: n.bays }, (_, i) => {
        const y = n.y0 + i * bayH + bayH / 2;
        return (
          <group key={`obj-${i}`}>
            <mesh position={[x - 0.12, y - bayH / 2 + 0.14, n.z0 + 0.3]} castShadow>
              <cylinderGeometry args={[0.055, 0.075, 0.24, 14]} />
              <primitive object={M.pot} attach="material" />
            </mesh>
            <mesh position={[x - 0.12, y - bayH / 2 + 0.1, n.z0 + 0.62]} castShadow>
              <boxGeometry args={[0.14, 0.18, 0.1]} />
              <primitive object={M.brass} attach="material" />
            </mesh>
            {i !== 1 && (
              <mesh position={[x - 0.12, y - bayH / 2 + 0.16, n.z1 - 0.28]} castShadow>
                <sphereGeometry args={[0.1, 12, 10]} />
                <primitive object={M.foliage} attach="material" />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

/**
 * Floorstanding speakers, with cones that move on the volume.
 *
 * A still speaker is a prop. The requirement document asks for speaker
 * animation by name, and it is the cheapest way to make "Music & Audio" read as
 * a system doing something rather than a box in the corner.
 */
function Speakers({ level }: { level: number }) {
  const x = LR.w - 0.3;

  return (
    <group>
      {LR_PLAN.speakers.map((sp, i) => (
        <group key={`spk-${i}`} position={[x, 0, sp.z]}>
          <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.26, 1.1, 0.3]} />
            <primitive object={M.speaker} attach="material" />
          </mesh>
          <mesh position={[0, 0.025, 0]}>
            <boxGeometry args={[0.32, 0.05, 0.36]} />
            <primitive object={M.metal} attach="material" />
          </mesh>
          {/* Three drivers. The excursion is exaggerated — a real cone moves
              under a millimetre — because the point is that it is alive. */}
          {[0.36, 0.66, 0.92].map((y, j) => (
            <mesh
              key={`drv-${j}`}
              position={[-0.13 - level * (0.012 - j * 0.003), y, 0]}
              rotation={[0, 0, Math.PI / 2]}
            >
              <cylinderGeometry args={[0.085 - j * 0.02, 0.085 - j * 0.02, 0.02, 18]} />
              <primitive object={M.cone} attach="material" />
            </mesh>
          ))}
        </group>
      ))}

      {/* Soundbar under the television. */}
      <mesh position={[LR.w - 0.2, 0.62, LR_TV.z]} castShadow>
        <boxGeometry args={[0.1, 0.09, 1.3]} />
        <primitive object={M.speaker} attach="material" />
      </mesh>
    </group>
  );
}

/**
 * Pendant cluster — cords and canopy only.
 *
 * The globes themselves live in the light rig, because their brightness is
 * device state. A decorative fitting that vanishes when it is switched off is
 * the giveaway this whole approach exists to avoid.
 */
function PendantRig() {
  const { x, z } = LR_PLAN.pendants;
  const ceiling = LR.h;

  return (
    <group>
      <mesh position={[x, ceiling - 0.015, z]}>
        <cylinderGeometry args={[0.16, 0.16, 0.03, 24]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      {LR_PENDANT_GLOBES.map((g, i) => (
        <mesh
          key={`cord-${i}`}
          position={[x + g.dx, (ceiling + g.y + g.r) / 2, z + g.dz]}
        >
          <cylinderGeometry args={[0.004, 0.004, ceiling - g.y - g.r, 6]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Ceiling fan.
 *
 * Speed comes from the device rather than a constant, and the per-frame step is
 * capped for the reason set out in `lib/sim/fan.ts`: three blades 120 degrees
 * apart alias into running backwards if a frame turns them too far.
 */
function CeilingFan({ radiansPerSecond }: { radiansPerSecond: number }) {
  const blades = useRef<THREE.Group>(null);
  const { x, z, y } = LR_PLAN.fan;

  useFrame((_, dt) => {
    if (!blades.current) return;
    blades.current.rotation.y += Math.min(radiansPerSecond * dt, MAX_BLADE_STEP_RAD);
  });

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, (LR.h + y) / 2 + 0.04, 0]}>
        <cylinderGeometry args={[0.02, 0.02, LR.h - y - 0.08, 10]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      <mesh position={[0, LR.h - 0.025, 0]}>
        <cylinderGeometry args={[0.085, 0.065, 0.05, 20]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      <group ref={blades} name="lr-fan-blades" position={[0, y, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.08, 0.095, 0.09, 24]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
        {[0, 1, 2].map((i) => (
          <group key={`bl-${i}`} rotation={[0, (i * Math.PI * 2) / 3, 0]}>
            <mesh position={[0.36, 0.01, 0]} rotation={[0.12, 0, 0]} castShadow>
              <boxGeometry args={[0.56, 0.013, 0.15]} />
              <primitive object={M.fanBlade} attach="material" />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function LivingRoom3D({
  curtains,
  tvOn,
  daylight,
  audioLevel = 0,
  fanRadiansPerSecond = 0,
}: {
  curtains: LivingCurtains;
  tvOn: boolean;
  /** 0..1 exterior brightness, so the window tracks the simulated clock. */
  daylight: number;
  /** 0..1 music volume, which drives the speaker cones. */
  audioLevel?: number;
  fanRadiansPerSecond?: number;
}) {
  return (
    <group>
      <Shell />
      <Glazing {...curtains} daylight={daylight} />
      <FeatureWall />
      <MediaWall tvOn={tvOn} />
      <Speakers level={audioLevel} />
      <PendantRig />
      <CeilingFan radiansPerSecond={fanRadiansPerSecond} />
      <Hallway />
      <Seating />
    </group>
  );
}
