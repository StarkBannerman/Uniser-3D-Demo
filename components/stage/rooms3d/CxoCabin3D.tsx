"use client";

/**
 * Commercial Office — CXO Cabin, geometry only.
 *
 * Rebuilt to the client's own scene sheet, which settled a layout question two
 * earlier passes got wrong by guessing at it.
 *
 *                       z = 0   +-----------------+
 *   glazing and drapes           |                 |  feature wall:
 *   x = 0                        |      desk       |  backlit shelving,
 *                                |                 |  marble panel, credenza
 *                                |     lounge      |  x = CX.w
 *                                +--------^--------+
 *                                    camera, high z
 *
 * Both long walls recede from the lens: the glass down the left, the joinery
 * down the right, the desk across the middle with the chairs in front of it.
 * The feature wall used to be straight ahead at z = 0, which is why no camera
 * could ever hold the window and the shelving at once.
 *
 * Coordinates in metres.
 */

import { useMemo } from "react";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
import {
  makeCityTexture,
  makeCurtainGeometry,
  makeMarbleTexture,
  makeParquetTexture,
  makeRugTexture,
  makeWordsTexture,
} from "./geometry";

export const CX = {
  /** Across the room. Glazing at x = 0, the joinery wall at x = w. */
  w: 8.0,
  /** Away from the camera. */
  d: 11.0,
  h: 3.3,
  soffit: { depth: 0.66, drop: 0.22 },
} as const;

export const CX_COVE_Y = CX.h - CX.soffit.drop + 0.03;

/** Glazed opening in the x = 0 wall. */
/**
  * Glazed opening in the x = 0 wall, running almost to the far corner.
  *
  * It stopped 0.7 m short, which left a strip of blank plaster exactly where
  * the reference turns the glass round the corner behind the desk.
  */
export const CX_WINDOW = { z0: 0.35, z1: 8.6, y0: 0.12, y1: CX.h - 0.42 };

export const CX_PLAN = {
  /**
   * The feature wall, on z = 0: lit marble flanked by backlit joinery.
   *
   * It spent a pass on the x = CX.w wall, which is what kept the window pinned
   * to the frame edge. The reference is a view *into a corner* — its window
   * mullions and its shelving lines converge on the same vanishing point at
   * mid-frame — so the two walls have to be adjacent, not opposite, and the
   * camera has to look down the diagonal between them.
   */
  marble: { x0: 2.55, x1: 5.15, y0: 0.82, y1: 2.92 },
  shelves: [
    { x0: 0.5, x1: 2.4, bays: 4 },
    { x0: 5.3, x1: 7.2, bays: 4 },
  ],
  credenza: { x: 6.25, len: 2.4, d: 0.5, h: 0.58 },
  art: { x: 7.62, cy: 1.8, w: 1.2, h: 1.55 },

  /** The desk, parallel to the glazing with the chair backing onto it. */
  desk: { x: 2.65, z: 4.3, w: 1.3, d: 3.2, h: 0.75 },
  execChair: { x: 1.58, z: 4.3 },
  visitors: [
    { x: 3.92, z: 3.5 },
    { x: 3.92, z: 5.1 },
  ],

  /** Suspended linear over the desk, on its long axis. */
  pendant: { x: 2.65, z: 4.3, len: 2.6, y: 2.36 },

  /** Lounge, further down the glazing. */
  sofa: { x: 1.35, z: 8.6, len: 3.0 },
  coffee: { x: 3.1, z: 8.6 },
  sideTable: { x: 1.3, z: 6.6 },
  rug: { x: 3.1, z: 6.5, w: 5.2, d: 6.4 },

  diffuser: { x: 5.6, z: 7.6, len: 2.2 },

  generalHeads: [
    { x: 1.3, z: 1.4 }, { x: 3.9, z: 1.3 }, { x: 6.5, z: 1.4 },
    { x: 1.4, z: 4.3 }, { x: 6.6, z: 4.4 },
    { x: 1.5, z: 7.2 }, { x: 4.4, z: 7.1 }, { x: 6.7, z: 7.3 },
    { x: 2.6, z: 9.9 }, { x: 6.2, z: 9.9 },
  ],
  taskHeads: [
    { x: 2.1, z: 3.6 }, { x: 3.2, z: 3.6 },
    { x: 2.1, z: 5.0 }, { x: 3.2, z: 5.0 },
  ],
  artHead: { x: 7.62, z: 0.95 },
  motto: { z: 10.7, cy: 1.85, h: 1.8 },

  plants: [
    { x: 1.25, z: 1.5, s: 1.05 },
    { x: 6.95, z: 2.7, s: 0.95 },
    { x: 1.0, z: 10.2, s: 0.75 },
  ],
} as const;

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

/**
 * Warm walnut, pale marble, taupe cloth and tan leather.
 *
 * A previous pass took the whole room to near-black off a photograph. The
 * client's own scene sheet is warmer than that throughout — dark joinery, yes,
 * but *warm* dark, against light stone and pale upholstery. The contrast in
 * that reference comes from the lit recesses, not from the palette.
 */
const M = {
  ceiling: new THREE.MeshStandardMaterial({ color: "#d4cec3", roughness: 0.96 }),
  soffit: new THREE.MeshStandardMaterial({ color: "#c6bfb3", roughness: 0.92 }),
  wall: new THREE.MeshStandardMaterial({ color: "#a2968a", roughness: 0.93 }),
  wallDeep: new THREE.MeshStandardMaterial({ color: "#6e6459", roughness: 0.94 }),
  /** Fluted timber panelling, for the wall the art hangs on. */
  walnut: new THREE.MeshPhysicalMaterial({
    color: "#5a4230",
    roughness: 0.42,
    metalness: 0.03,
    clearcoat: 0.35,
    clearcoatRoughness: 0.32,
  }),
  /** The inside of a niche: darker, so a lit bay reads as lit. */
  walnutDark: new THREE.MeshStandardMaterial({ color: "#2e2117", roughness: 0.7 }),
  bronze: new THREE.MeshStandardMaterial({
    color: "#a98350",
    roughness: 0.28,
    metalness: 0.9,
  }),
  metal: new THREE.MeshStandardMaterial({
    color: "#23252a",
    roughness: 0.36,
    metalness: 0.75,
  }),
  /** Black leather, on the executive chair only. */
  execLeather: new THREE.MeshPhysicalMaterial({
    color: "#1d1c1b",
    roughness: 0.42,
    sheen: 0.8,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color("#8a7a63"),
  }),
  /** Tan leather on the visitors' chairs, as on the sheet. */
  leather: new THREE.MeshPhysicalMaterial({
    color: "#6d5436",
    roughness: 0.52,
    sheen: 0.7,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color("#c2a87a"),
  }),
  sofa: new THREE.MeshPhysicalMaterial({
    color: "#8e867a",
    roughness: 0.82,
    sheen: 1,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color("#d4cab6"),
  }),
  cushion: new THREE.MeshPhysicalMaterial({
    color: "#5d5b50",
    roughness: 0.84,
    sheen: 0.9,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color("#b5ae9a"),
  }),
  shade: new THREE.MeshStandardMaterial({
    color: "#d8ccb6",
    roughness: 0.9,
    side: THREE.DoubleSide,
  }),
  sheer: new THREE.MeshPhysicalMaterial({
    color: "#ddd5c6",
    roughness: 0.6,
    transparent: true,
    opacity: 0.56,
    side: THREE.DoubleSide,
  }),
  drape: new THREE.MeshPhysicalMaterial({
    color: "#7c6c57",
    roughness: 0.9,
    sheen: 0.7,
    sheenRoughness: 0.65,
    sheenColor: new THREE.Color("#c7b396"),
    side: THREE.DoubleSide,
  }),
  glass: new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: 0.05,
    transparent: true,
    opacity: 0.07,
    side: THREE.DoubleSide,
  }),
  foliage: new THREE.MeshStandardMaterial({ color: "#35512c", roughness: 0.9 }),
  planter: new THREE.MeshStandardMaterial({ color: "#1d1e20", roughness: 0.55 }),
  paper: new THREE.MeshStandardMaterial({ color: "#cfc8b8", roughness: 0.9 }),
  housing: new THREE.MeshStandardMaterial({ color: "#1a1b1d", roughness: 0.5 }),
};

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

function Shell() {
  const { w, d, h, soffit } = CX;
  const win = CX_WINDOW;
  const floor = useMemo(() => {
    const t = makeParquetTexture();
    t.repeat.set(3.2, 4.2);
    t.rotation = Math.PI / 2;
    t.center.set(0.5, 0.5);
    return t;
  }, []);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[w / 2, 0, d / 2]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshPhysicalMaterial
          map={floor}
          roughness={0.44}
          metalness={0.02}
          clearcoat={0.3}
          clearcoatRoughness={0.32}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[w / 2, h, d / 2]}>
        <planeGeometry args={[w, d]} />
        <primitive object={M.ceiling} attach="material" />
      </mesh>

      {/* Perimeter coffer. */}
      {([
        [w / 2, soffit.depth / 2, w, soffit.depth],
        [w / 2, d - soffit.depth / 2, w, soffit.depth],
        [soffit.depth / 2, d / 2, soffit.depth, d - soffit.depth * 2],
        [w - soffit.depth / 2, d / 2, soffit.depth, d - soffit.depth * 2],
      ] as const).map(([cx, cz, sx, sz], i) => (
        <mesh key={i} rotation={[Math.PI / 2, 0, 0]} position={[cx, h - soffit.drop, cz]}>
          <planeGeometry args={[sx, sz]} />
          <primitive object={M.soffit} attach="material" />
        </mesh>
      ))}
      {([
        [w / 2, soffit.depth, 0, w],
        [w / 2, d - soffit.depth, Math.PI, w],
        [soffit.depth, d / 2, Math.PI / 2, d - soffit.depth * 2],
        [w - soffit.depth, d / 2, -Math.PI / 2, d - soffit.depth * 2],
      ] as const).map(([cx, cz, ry, len], i) => (
        <mesh key={i} position={[cx, h - soffit.drop / 2, cz]} rotation={[0, ry, 0]}>
          <planeGeometry args={[len, soffit.drop]} />
          <primitive object={M.soffit} attach="material" />
        </mesh>
      ))}

      {/* Far wall: plain, because the feature joinery is mounted on it. */}
      <mesh position={[w / 2, h / 2, 0]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <primitive object={M.wallDeep} attach="material" />
      </mesh>
      <mesh position={[w / 2, h / 2, d]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[w, h]} />
        <primitive object={M.wallDeep} attach="material" />
      </mesh>

      {/* Right-hand wall: plaster, and mostly out of shot. */}
      <mesh position={[w, h / 2, d / 2]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>

      {/* Glazing wall exists where the glass does not. */}
      <mesh position={[0, win.y0 / 2, d / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[d, win.y0]} />
        <primitive object={M.wallDeep} attach="material" />
      </mesh>
      <mesh position={[0, (win.y1 + h) / 2, d / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[d, h - win.y1]} />
        <primitive object={M.wallDeep} attach="material" />
      </mesh>
      {([
        [win.z0 / 2, win.z0],
        [(win.z1 + d) / 2, d - win.z1],
      ] as const).map(([cz, len], i) => (
        <mesh key={i} position={[0, h / 2, cz]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[len, h]} />
          <primitive object={M.wallDeep} attach="material" />
        </mesh>
      ))}

      {([
        [w / 2, 0.05, w, 0.04],
        [w / 2, d - 0.05, w, 0.04],
      ] as const).map(([cx, cz, sx, sz], i) => (
        <mesh key={i} position={[cx, 0.06, cz]}>
          <boxGeometry args={[sx, 0.12, sz]} />
          <primitive object={M.walnutDark} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Feature wall                                                        */
/* ------------------------------------------------------------------ */

function FeatureWall() {
  const p = CX_PLAN;
  const slab = useMemo(() => makeMarbleTexture("#8c857a", "#d2c9b6", 5171), []);
  const art = useMemo(() => makeMarbleTexture("#b6b0a4", "#6e6a62", 77), []);
  const words = useMemo(
    () =>
      makeWordsTexture(
        ["VISION", "STRATEGY", "PEOPLE", "POSSIBILITIES"],
        "#000000",
        "#d8c7a4",
        { size: 26, spacing: 5, transparent: true },
      ),
    [],
  );

  return (
    <group>
      {/* Fluted timber lining the whole wall. */}
      <mesh position={[CX.w / 2, CX.h / 2, 0.03]} receiveShadow>
        <planeGeometry args={[CX.w, CX.h]} />
        <primitive object={M.walnut} attach="material" />
      </mesh>
      {Array.from({ length: 40 }, (_, i) => (
        <mesh key={`f${i}`} position={[0.15 + i * 0.2, CX.h / 2, 0.055]} castShadow>
          <boxGeometry args={[0.055, CX.h - 0.14, 0.05]} />
          <primitive object={M.walnut} attach="material" />
        </mesh>
      ))}

      {/* The lit marble slab, with a dark reveal round it for the strip. */}
      <mesh position={[(p.marble.x0 + p.marble.x1) / 2, (p.marble.y0 + p.marble.y1) / 2, 0.09]}>
        <planeGeometry args={[p.marble.x1 - p.marble.x0 + 0.14, p.marble.y1 - p.marble.y0 + 0.14]} />
        <primitive object={M.walnutDark} attach="material" />
      </mesh>
      <mesh position={[(p.marble.x0 + p.marble.x1) / 2, (p.marble.y0 + p.marble.y1) / 2, 0.1]}>
        <planeGeometry args={[p.marble.x1 - p.marble.x0, p.marble.y1 - p.marble.y0]} />
        <meshStandardMaterial map={slab} roughness={0.3} metalness={0.05} />
      </mesh>
      <mesh position={[(p.marble.x0 + p.marble.x1) / 2, (p.marble.y0 + p.marble.y1) / 2, 0.11]}>
        <planeGeometry args={[1.2, 1.5]} />
        <meshStandardMaterial map={words} transparent roughness={0.6} metalness={0.3} />
      </mesh>

      {/* Backlit joinery either side. */}
      {p.shelves.map((unit, u) => {
        const span = unit.x1 - unit.x0;
        const cx = (unit.x0 + unit.x1) / 2;
        const top = 2.86;
        const bottom = 0.62;
        const pitch = (top - bottom) / unit.bays;
        return (
          <group key={u}>
            <mesh position={[cx, (bottom + top) / 2, 0.08]}>
              <planeGeometry args={[span, top - bottom]} />
              <primitive object={M.walnutDark} attach="material" />
            </mesh>
            {([unit.x0 - 0.05, unit.x1 + 0.05] as const).map((x, i) => (
              <mesh key={`u${i}`} position={[x, (bottom + top) / 2, 0.2]}>
                <boxGeometry args={[0.1, top - bottom + 0.1, 0.36]} />
                <primitive object={M.walnut} attach="material" />
              </mesh>
            ))}
            {Array.from({ length: unit.bays + 1 }, (_, i) => (
              <mesh key={`s${i}`} position={[cx, bottom + pitch * i, 0.2]}>
                <boxGeometry args={[span + 0.1, 0.045, 0.36]} />
                <primitive object={M.walnut} attach="material" />
              </mesh>
            ))}
            {Array.from({ length: unit.bays }, (_, bi) => {
              const y = bottom + pitch * bi + 0.022;
              const k = u * 5 + bi * 3;
              return (
                <group key={`o${bi}`}>
                  {Array.from({ length: 6 + (k % 3) }, (_, i) => {
                    const bh = 0.2 + ((k + i) % 5) * 0.032;
                    return (
                      <mesh
                        key={i}
                        position={[unit.x0 + 0.16 + i * 0.062, y + bh / 2, 0.26]}
                        rotation={[0, 0, i === 5 ? 0.22 : 0]}
                      >
                        <boxGeometry args={[0.045, bh, 0.2]} />
                        <meshStandardMaterial
                          color={["#4a3728", "#30271f", "#5c452f", "#262120"][(k + i) % 4]}
                          roughness={0.85}
                        />
                      </mesh>
                    );
                  })}
                  {bi % 2 === 0 && (
                    <mesh position={[unit.x1 - 0.26, y + 0.12, 0.26]}>
                      <sphereGeometry args={[0.105, 16, 12]} />
                      <primitive object={M.bronze} attach="material" />
                    </mesh>
                  )}
                  {bi % 3 === 1 && (
                    <mesh position={[unit.x1 - 0.56, y + 0.17, 0.26]}>
                      <cylinderGeometry args={[0.055, 0.085, 0.32, 14]} />
                      <primitive object={M.bronze} attach="material" />
                    </mesh>
                  )}
                </group>
              );
            })}
          </group>
        );
      })}

      {/* Credenza under the right-hand bay. */}
      <group position={[p.credenza.x, 0, 0.3]}>
        <mesh position={[0, p.credenza.h / 2 + 0.1, 0]} castShadow receiveShadow>
          <boxGeometry args={[p.credenza.len, p.credenza.h, p.credenza.d]} />
          <primitive object={M.walnut} attach="material" />
        </mesh>
        {[-0.65, 0.65].map((x) => (
          <mesh key={x} position={[x, p.credenza.h / 2 + 0.1, p.credenza.d / 2 + 0.004]}>
            <planeGeometry args={[0.012, p.credenza.h - 0.12]} />
            <primitive object={M.bronze} attach="material" />
          </mesh>
        ))}
      </group>

      {/* Framed artwork on the fluted section. */}
      <group position={[p.art.x, p.art.cy, 0.1]}>
        <mesh>
          <planeGeometry args={[p.art.w + 0.1, p.art.h + 0.1]} />
          <primitive object={M.bronze} attach="material" />
        </mesh>
        <mesh position={[0, 0, 0.012]}>
          <planeGeometry args={[p.art.w, p.art.h]} />
          <meshStandardMaterial map={art} roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Glazing and curtains                                                */
/* ------------------------------------------------------------------ */

export interface CxoCurtains {
  sheer: number;
  blackout: number;
}

const PANELS = 6;
const PANEL_OVERLAP = 0.06;

function Glazing({ sheer, blackout, view }: CxoCurtains & { view: THREE.Texture }) {
  const win = CX_WINDOW;
  const span = win.z1 - win.z0;
  const height = win.y1 - win.y0;
  const seg = span / PANELS;

  /**
   * Panels draw from both ends, as a pair of tracks does.
   *
   * `gather` is the fabric's own bunching and the geometry helper owns it; the
   * anchor slides from parked, hard against its own end, to drawn at its slot.
   * Both are needed — gather alone leaves six bunches spread evenly across the
   * glass they were supposed to have uncovered.
   */
  const curtain = (position: number, mat: THREE.Material, xOff: number, key: string) =>
    Array.from({ length: PANELS }, (_, i) => {
      const closed = Math.min(Math.max(position / 100, 0), 1);
      const toStart = i < PANELS / 2;
      const drawn = toStart
        ? win.z0 + i * seg - PANEL_OVERLAP / 2
        : win.z0 + (i + 1) * seg + PANEL_OVERLAP / 2;
      const parked = toStart
        ? win.z0 + i * seg * 0.1
        : win.z1 - (PANELS - 1 - i) * seg * 0.1;
      const z = parked + (drawn - parked) * closed;
      return (
        <mesh
          key={`${key}-${i}`}
          geometry={makeCurtainGeometry({
            length: seg + PANEL_OVERLAP,
            height,
            folds: 9,
            foldDepth: 0.1,
            gather: 1 - closed,
          })}
          material={mat}
          position={[xOff, win.y0, z]}
          scale={[1, 1, toStart ? 1 : -1]}
          castShadow={key === "drape"}
        />
      );
    });

  return (
    <group>
      <mesh position={[-0.7, (win.y0 + win.y1) / 2, (win.z0 + win.z1) / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[span * 1.7, height * 1.9]} />
        <meshBasicMaterial map={view} toneMapped={false} />
      </mesh>
      <mesh position={[0.02, (win.y0 + win.y1) / 2, (win.z0 + win.z1) / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[span, height]} />
        <primitive object={M.glass} attach="material" />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={`m${i}`} position={[0.03, (win.y0 + win.y1) / 2, win.z0 + (span / 4) * i]}>
          <boxGeometry args={[0.07, height, 0.06]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
      {([win.y0, win.y1] as const).map((y, i) => (
        <mesh key={`t${i}`} position={[0.03, y, (win.z0 + win.z1) / 2]}>
          <boxGeometry args={[0.07, 0.07, span]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
      <mesh position={[0.25, win.y1 + 0.07, (win.z0 + win.z1) / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.026, 0.026, span + 0.3, 8]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      {curtain(sheer, M.sheer, 0.15, "sheer")}
      {curtain(blackout, M.drape, 0.3, "drape")}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Desk and seating                                                    */
/* ------------------------------------------------------------------ */

function Desk() {
  const d = CX_PLAN.desk;
  const top = useMemo(() => makeMarbleTexture("#847d73", "#cdc4b2", 991), []);
  return (
    <group position={[d.x, 0, d.z]}>
      <RoundedBox args={[d.w, 0.085, d.d]} radius={0.015} smoothness={3} position={[0, d.h, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={top} roughness={0.24} metalness={0.05} />
      </RoundedBox>
      {/* Marble waterfall end, nearest the camera. */}
      <mesh position={[0, (d.h - 0.1) / 2 + 0.1, d.d / 2 - 0.1]} castShadow>
        <boxGeometry args={[d.w - 0.08, d.h - 0.1, 0.2]} />
        <meshStandardMaterial map={top} roughness={0.26} metalness={0.05} />
      </mesh>
      {/* Timber body on a recessed plinth that the strip lights. */}
      <mesh position={[0.06, (d.h - 0.06) / 2 + 0.06, -0.35]} castShadow>
        <boxGeometry args={[d.w - 0.3, d.h - 0.12, d.d - 1.0]} />
        <primitive object={M.walnut} attach="material" />
      </mesh>
      <mesh position={[0.06, 0.05, -0.35]}>
        <boxGeometry args={[d.w - 0.45, 0.1, d.d - 1.3]} />
        <primitive object={M.walnutDark} attach="material" />
      </mesh>

      <group position={[0.02, d.h + 0.045, -0.35]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <boxGeometry args={[0.37, 0.012, 0.25]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
        <mesh position={[0, 0.115, -0.125]} rotation={[-0.32, 0, 0]}>
          <boxGeometry args={[0.37, 0.24, 0.01]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
        <mesh position={[0, 0.113, -0.119]} rotation={[-0.32, 0, 0]}>
          <planeGeometry args={[0.345, 0.215]} />
          <meshStandardMaterial
            color="#000000"
            emissive={new THREE.Color("#5b7ba8")}
            emissiveIntensity={1.2}
            toneMapped={false}
          />
        </mesh>
      </group>
      <mesh position={[0.1, d.h + 0.14, 0.45]}>
        <cylinderGeometry args={[0.05, 0.062, 0.21, 16]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      <mesh position={[-0.1, d.h + 0.046, -1.15]} rotation={[-Math.PI / 2, 0, 0.12]}>
        <planeGeometry args={[0.3, 0.42]} />
        <primitive object={M.paper} attach="material" />
      </mesh>
      <group position={[0.08, d.h + 0.1, 1.05]}>
        <mesh>
          <cylinderGeometry args={[0.11, 0.09, 0.12, 16]} />
          <primitive object={M.bronze} attach="material" />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[(i - 1) * 0.07, 0.12, (i % 2) * 0.05 - 0.02]}>
            <icosahedronGeometry args={[0.09, 1]} />
            <primitive object={M.foliage} attach="material" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Chair({
  x,
  z,
  rotation,
  exec,
}: {
  x: number;
  z: number;
  rotation: number;
  exec?: boolean;
}) {
  const hide = exec ? M.execLeather : M.leather;
  const backH = exec ? 0.95 : 0.66;
  return (
    <group position={[x, 0, z]} rotation={[0, rotation, 0]}>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          position={[Math.sin((i / 5) * Math.PI * 2) * 0.19, 0.04, Math.cos((i / 5) * Math.PI * 2) * 0.19]}
          rotation={[0, (i / 5) * Math.PI * 2, 0]}
        >
          <boxGeometry args={[0.05, 0.05, 0.38]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
      <mesh position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.038, 0.05, 0.44, 10]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      <RoundedBox args={[0.6, 0.15, 0.58]} radius={0.06} smoothness={3} position={[0, 0.5, 0]} castShadow>
        <primitive object={hide} attach="material" />
      </RoundedBox>
      <RoundedBox
        args={[0.57, backH, 0.15]}
        radius={0.06}
        smoothness={3}
        position={[0, 0.52 + backH / 2, -0.24]}
        rotation={[-0.14, 0, 0]}
        castShadow
      >
        <primitive object={hide} attach="material" />
      </RoundedBox>
      {([-0.33, 0.33] as const).map((ax) => (
        <mesh key={ax} position={[ax, 0.69, -0.03]}>
          <boxGeometry args={[0.07, 0.06, 0.38]} />
          <primitive object={hide} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Lounge                                                              */
/* ------------------------------------------------------------------ */

function Lounge() {
  const p = CX_PLAN;
  const rug = useMemo(() => makeRugTexture(), []);
  const stone = useMemo(() => makeMarbleTexture("#5d564e", "#b0a695", 404), []);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[p.rug.x, 0.004, p.rug.z]} receiveShadow>
        <planeGeometry args={[p.rug.w, p.rug.d]} />
        <meshStandardMaterial map={rug} roughness={1} />
      </mesh>

      {/* Sectional along the glazing, facing into the room. */}
      <group position={[p.sofa.x, 0, p.sofa.z]} rotation={[0, Math.PI / 2, 0]}>
        <RoundedBox args={[p.sofa.len, 0.36, 1.0]} radius={0.08} smoothness={3} position={[0, 0.33, 0]} castShadow receiveShadow>
          <primitive object={M.sofa} attach="material" />
        </RoundedBox>
        <RoundedBox args={[p.sofa.len, 0.64, 0.28]} radius={0.08} smoothness={3} position={[0, 0.66, -0.38]} castShadow>
          <primitive object={M.sofa} attach="material" />
        </RoundedBox>
        {([-1, 1] as const).map((s) => (
          <RoundedBox
            key={s}
            args={[0.28, 0.52, 1.0]}
            radius={0.08}
            smoothness={3}
            position={[(s * (p.sofa.len - 0.28)) / 2, 0.52, 0]}
            castShadow
          >
            <primitive object={M.sofa} attach="material" />
          </RoundedBox>
        ))}
        {[-1.05, -0.4, 0.4, 1.05].map((cx, i) => (
          <RoundedBox
            key={cx}
            args={[0.44, 0.44, 0.16]}
            radius={0.07}
            smoothness={3}
            position={[cx, 0.72, -0.22]}
            rotation={[0.26, 0, i % 2 ? 0.12 : -0.1]}
            castShadow
          >
            <primitive object={i % 2 ? M.cushion : M.sofa} attach="material" />
          </RoundedBox>
        ))}
      </group>

      {/* Round marble coffee table. */}
      <group position={[p.coffee.x, 0, p.coffee.z]}>
        <mesh position={[0, 0.17, 0]} castShadow>
          <cylinderGeometry args={[0.34, 0.38, 0.34, 24]} />
          <meshStandardMaterial map={stone} roughness={0.3} metalness={0.04} />
        </mesh>
        <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.48, 0.48, 0.05, 28]} />
          <meshStandardMaterial map={stone} roughness={0.26} metalness={0.05} />
        </mesh>
        {[0, 1].map((i) => (
          <mesh key={i} position={[-0.06 + i * 0.02, 0.4 + i * 0.025, 0.02]} rotation={[-Math.PI / 2, 0, 0.3 + i * 0.4]}>
            <planeGeometry args={[0.28, 0.2]} />
            <primitive object={M.paper} attach="material" />
          </mesh>
        ))}
      </group>

      {/* Side table carrying the lamp. */}
      <group position={[p.sideTable.x, 0, p.sideTable.z]}>
        <mesh position={[0, 0.27, 0]} castShadow>
          <cylinderGeometry args={[0.26, 0.3, 0.54, 20]} />
          <primitive object={M.walnut} attach="material" />
        </mesh>
        <mesh position={[0, 0.56, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 0.035, 22]} />
          <primitive object={M.walnutDark} attach="material" />
        </mesh>
      </group>
    </group>
  );
}

function Plants() {
  return (
    <group>
      {CX_PLAN.plants.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} scale={p.s}>
          <mesh position={[0, 0.33, 0]} castShadow>
            <cylinderGeometry args={[0.3, 0.23, 0.66, 16]} />
            <primitive object={M.planter} attach="material" />
          </mesh>
          {[
            [0, 1.16, 0, 0.46],
            [0.24, 1.6, 0.14, 0.32],
            [-0.2, 1.5, -0.16, 0.28],
            [0.08, 1.92, -0.07, 0.22],
          ].map(([x, y, z, r], j) => (
            <mesh key={j} position={[x, y, z]} castShadow>
              <icosahedronGeometry args={[r, 1]} />
              <primitive object={M.foliage} attach="material" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Services and housings                                               */
/* ------------------------------------------------------------------ */

function AirDiffuser() {
  const d = CX_PLAN.diffuser;
  return (
    <group position={[d.x, CX.h - 0.012, d.z]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[d.len, 0.16]} />
        <primitive object={M.bronze} attach="material" />
      </mesh>
      <mesh position={[0, -0.014, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[d.len - 0.05, 0.1]} />
        <meshStandardMaterial color="#0a0b0c" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Housings() {
  const p = CX_PLAN;
  return (
    <group>
      <mesh position={[p.pendant.x, p.pendant.y, p.pendant.z]} castShadow>
        <boxGeometry args={[0.13, 0.1, p.pendant.len]} />
        <primitive object={M.walnutDark} attach="material" />
      </mesh>
      {([-1, 1] as const).map((s) => (
        <mesh key={s} position={[p.pendant.x, (p.pendant.y + CX.h) / 2 + 0.05, p.pendant.z + s * (p.pendant.len / 2 - 0.3)]}>
          <cylinderGeometry args={[0.006, 0.006, CX.h - p.pendant.y - 0.1, 6]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
      {p.generalHeads.map((h) => (
        <mesh key={`g${h.x}-${h.z}`} position={[h.x, CX.h - 0.012, h.z]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.05, 0.07, 18]} />
          <primitive object={M.housing} attach="material" />
        </mesh>
      ))}
      {p.taskHeads.map((h) => (
        <mesh key={`t${h.x}-${h.z}`} position={[h.x, CX.h - 0.012, h.z]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.034, 0.048, 16]} />
          <primitive object={M.housing} attach="material" />
        </mesh>
      ))}
      <mesh position={[p.artHead.x, CX.h - 0.012, p.artHead.z]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.034, 0.048, 16]} />
        <primitive object={M.housing} attach="material" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* The room                                                            */
/* ------------------------------------------------------------------ */

export function CxoCabin3D({
  curtains,
  view,
}: {
  curtains: CxoCurtains;
  view: THREE.Texture;
}) {
  return (
    <group>
      <Shell />
      <FeatureWall />
      <Glazing sheer={curtains.sheer} blackout={curtains.blackout} view={view} />
      <Desk />
      {/* The executive backs onto the glazing and faces the room; the
          visitors face back at the desk. A chair's back sits at its own local
          -z, so facing +x is a quarter turn one way and -x the other. */}
      <Chair x={CX_PLAN.execChair.x} z={CX_PLAN.execChair.z} rotation={Math.PI / 2} exec />
      {CX_PLAN.visitors.map((v, i) => (
        <Chair key={i} x={v.x} z={v.z} rotation={-Math.PI / 2} />
      ))}
      <Lounge />
      <Plants />
      <AirDiffuser />
      <Housings />
    </group>
  );
}
