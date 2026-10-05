"use client";

/**
 * Commercial Office — CXO Cabin, geometry only.
 *
 * Built to the client's CXO sheet, and laid out as the two rooms it actually
 * is: a desk against a stone feature wall, and a lounge in front of the
 * glazing. The brief asks for "premium and hospitality-like", and that is a
 * plan decision before it is a lighting one — an executive cabin that is only a
 * desk in a box cannot be lit into feeling like a suite.
 *
 *              z = 0   +----------------------------+
 *   glazing            |  stone wall, shelves, art  |
 *   and drapes         |            desk            |  joinery
 *   x = 0              |                            |  x = CX.w
 *                      |          lounge            |
 *                      +--------------^-------------+
 *                                camera, high z
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
  /** Across the room. The glazing is at x = 0, the joinery wall at x = w. */
  w: 9.0,
  /** Away from the camera. The feature wall is at z = 0. */
  d: 10.2,
  h: 3.35,
  /** Perimeter coffer: the cove sits on top of this and washes the ceiling. */
  soffit: { depth: 0.7, drop: 0.24 },
} as const;

export const CX_COVE_Y = CX.h - CX.soffit.drop + 0.03;

/**
 * The cabin is glazed on a corner, which is the thing the first build got
 * structurally wrong.
 *
 * On the sheet the window sits on the *back* wall, to the left of the stone,
 * with the desk in front of the junction between them — and it wraps round the
 * left-hand wall as well. Putting all the glass on the side wall alone meant no
 * camera that framed the desk could also see a window, which is why the view
 * kept having to be traded against the subject.
 */
export const CX_WINDOW = { z0: 0.9, z1: 6.4, y0: 0.1, y1: CX.h - 0.46 };
/** And the return, on the z = 0 wall, left of the stone. */
export const CX_BACK_WINDOW = { x0: 0.35, x1: 3.25, y0: 0.1, y1: CX.h - 0.46 };

export const CX_PLAN = {
  /** Stone feature wall behind the desk, carrying the wordmark. */
  stone: { x0: 3.45, x1: 6.85, words: { x: 5.15, cy: 2.0, h: 1.5 } },
  /**
   * Backlit joinery, right of the stone only.
   *
   * There were two units, one either side. The sheet has one: to the left of
   * the stone is the window, and a second unit there was both wrong and in the
   * way of the thing the room is meant to be looking at.
   */
  shelves: [{ x0: 6.95, x1: 8.75, bays: 4 }],
  /** Credenza running under the stone wall. */
  credenza: { x: 5.15, w: 3.3, d: 0.52, h: 0.52 },
  /** Framed artwork on the joinery wall. */
  art: { z: 3.4, cy: 1.78, w: 1.15, h: 1.5 },

  /**
   * The desk: 3.4 m of stone on a timber plinth, facing the room.
   *
   * Sized off the sheet rather than guessed. There the desk's front edge runs
   * from 0.28 to 0.72 of the frame — it is 44 per cent of the picture and the
   * unmistakable subject. At 2.9 m seen from six metres it was taking 22 per
   * cent and reading as a table in a large room.
   */
  desk: { x: 5.4, z: 3.2, w: 3.4, d: 1.25, h: 0.75 },
  /** Executive chair behind it, two visitors in front with their backs to us. */
  execChair: { x: 5.4, z: 2.05 },
  visitors: [
    { x: 4.55, z: 4.62 },
    { x: 6.35, z: 4.62 },
  ],

  /** Suspended linear over the desk, on the desk's own axis. */
  pendant: { x: 5.4, z: 3.2, w: 2.7, y: 2.3 },

  /**
   * Lounge, in front of the glazing.
   *
   * Pulled a good half metre forward of where it started. At z = 6.9 the sofa
   * sat two metres from the lens and filled the bottom third of the frame, and
   * the glazing it is supposed to sit in front of was pushed out of shot
   * entirely — the room read as an office with a sofa in the way.
   */
  sofa: { x: 1.7, z: 5.5, len: 3.1 },
  coffee: { x: 3.2, z: 5.5 },
  sideTable: { x: 1.7, z: 3.7 },
  floorLamp: { x: 1.4, z: 7.4 },
  rug: { x: 2.7, z: 5.5, w: 4.2, d: 3.8 },
  /**
   * A second rug, under the desk and the visitor chairs.
   *
   * The sheet has one and the room needs it: without it the whole lower right
   * of the frame is four square metres of bare floor, which is the emptiest
   * thing in an otherwise furnished picture.
   */
  deskRug: { x: 5.4, z: 4.0, w: 5.2, d: 3.4 },

  /**
   * Linear AC diffuser, where the ceiling fan used to be.
   *
   * A cabin finished to this standard is on ducted air, not on a fan — a fan
   * over a CXO's desk is the detail that tells a client the room was drawn by
   * somebody who had not been in one. The slot runs parallel to the glazing,
   * which is where a diffuser goes when the solar load is all on one wall.
   */
  diffuser: { x: 3.0, z: 4.6, len: 2.4 },

  /** General downlights: a loose grid, not a ceiling of them. */
  generalHeads: [
    { x: 2.0, z: 1.7 }, { x: 5.0, z: 1.5 }, { x: 8.0, z: 1.7 },
    { x: 1.9, z: 4.4 }, { x: 7.9, z: 4.3 },
    { x: 2.1, z: 7.2 }, { x: 5.4, z: 7.0 }, { x: 8.0, z: 7.1 },
    { x: 3.4, z: 9.3 }, { x: 7.2, z: 9.3 },
  ],
  /** Narrow heads on the desk surface. */
  taskHeads: [
    { x: 4.35, z: 2.75 }, { x: 6.25, z: 2.75 },
    { x: 4.35, z: 3.55 }, { x: 6.25, z: 3.55 },
  ],
  /** Head grazing the artwork. */
  artHead: { x: CX.w - 0.95, z: 3.4 },

  /** The near wall, carrying the leadership line. */
  motto: { z: 9.9, cy: 1.85, h: 1.8 },

  plants: [
    { x: 0.85, z: 1.5, s: 1.0 },
    { x: 8.35, z: 8.6, s: 0.86 },
    { x: 1.0, z: 4.3, s: 0.72 },
  ],
} as const;

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

/**
 * Warm, dark and expensive.
 *
 * The boardroom next door is a pale room working to 420 lux and its palette is
 * chosen to bounce. This one is the opposite instruction: walnut, dark stone
 * and bronze, lit to 320 and meant to look like somewhere you are received
 * rather than somewhere you are seated.
 *
 * Darker surfaces mean every layer has to be worth its place, which is the
 * honest version of "premium" — there is nowhere for a lazy fixture to hide.
 */
const M = {
  /** The ceiling stays pale. It is the one surface carrying the cove. */
  ceiling: new THREE.MeshStandardMaterial({ color: "#cdc7bc", roughness: 0.96 }),
  soffit: new THREE.MeshStandardMaterial({ color: "#bdb6aa", roughness: 0.92 }),
  wall: new THREE.MeshStandardMaterial({ color: "#2e2f31", roughness: 0.92 }),
  wallDeep: new THREE.MeshStandardMaterial({ color: "#232426", roughness: 0.94 }),
  /** Near-black lacquered joinery: the shelving, the desk body, the credenza. */
  walnut: new THREE.MeshPhysicalMaterial({
    color: "#1b1c1e",
    roughness: 0.34,
    metalness: 0.05,
    clearcoat: 0.5,
    clearcoatRoughness: 0.28,
  }),
  /** The inside of a niche. Darker still, so a lit bay reads as a lit bay. */
  walnutDark: new THREE.MeshStandardMaterial({ color: "#121314", roughness: 0.68 }),
  bronze: new THREE.MeshStandardMaterial({
    color: "#b08b52",
    roughness: 0.26,
    metalness: 0.9,
  }),
  metal: new THREE.MeshStandardMaterial({
    color: "#16181a",
    roughness: 0.35,
    metalness: 0.7,
  }),
  /**
   * Black leather, on everything that is sat on.
   *
   * Sheen still, and still worth it: it is the pale retroreflective rim at a
   * grazing angle that separates leather from a black box, and in a room this
   * dark that rim is most of what you can see of the furniture at all.
   */
  leather: new THREE.MeshPhysicalMaterial({
    color: "#1c1b1a",
    roughness: 0.42,
    sheen: 0.8,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color("#8a7a63"),
  }),
  sofa: new THREE.MeshPhysicalMaterial({
    color: "#201f1e",
    roughness: 0.46,
    sheen: 0.85,
    sheenRoughness: 0.42,
    sheenColor: new THREE.Color("#94836b"),
  }),
  cushion: new THREE.MeshPhysicalMaterial({
    color: "#3a352c",
    roughness: 0.72,
    sheen: 0.9,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color("#b8a888"),
  }),
  shade: new THREE.MeshStandardMaterial({
    color: "#cfc3ad",
    roughness: 0.9,
    side: THREE.DoubleSide,
  }),
  sheer: new THREE.MeshPhysicalMaterial({
    color: "#ded6c7",
    roughness: 0.6,
    transparent: true,
    opacity: 0.58,
    side: THREE.DoubleSide,
  }),
  drape: new THREE.MeshPhysicalMaterial({
    color: "#6a5c4a",
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
  foliage: new THREE.MeshStandardMaterial({ color: "#2f4427", roughness: 0.9 }),
  planter: new THREE.MeshStandardMaterial({ color: "#17181a", roughness: 0.5 }),
  paper: new THREE.MeshStandardMaterial({ color: "#c9c2b2", roughness: 0.9 }),
  housing: new THREE.MeshStandardMaterial({ color: "#141517", roughness: 0.5 }),
};

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

function Shell({ stone }: { stone: THREE.Texture }) {
  const { w, d, h, soffit } = CX;
  const win = CX_WINDOW;
  /**
   * Herringbone parquet, and the only warm surface left in the room.
   *
   * Everything else went to near-black. Without a warm floor under it the
   * reference's palette is a cave; with one it is a room with the lights down.
   */
  const parquet = useMemo(() => {
    const t = makeParquetTexture();
    // One repeat spans about 2.6 m, which puts a board at roughly 190 mm wide
    // and 700 mm long — a plausible engineered plank rather than a pattern.
    t.repeat.set(3.5, 4);
    t.rotation = Math.PI / 2;
    t.center.set(0.5, 0.5);
    return t;
  }, []);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[w / 2, 0, d / 2]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshPhysicalMaterial
          map={parquet}
          roughness={0.42}
          metalness={0.02}
          clearcoat={0.35}
          clearcoatRoughness={0.3}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[w / 2, h, d / 2]}>
        <planeGeometry args={[w, d]} />
        <primitive object={M.ceiling} attach="material" />
      </mesh>

      {/* Perimeter coffer. Four runs, because the strip inside is addressed as
          four runs too. */}
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

      {/* Feature wall, z = 0 — but only where there is no glass in it. */}
      {([
        [(CX_BACK_WINDOW.x1 + w) / 2, w - CX_BACK_WINDOW.x1],
        [CX_BACK_WINDOW.x0 / 2, CX_BACK_WINDOW.x0],
      ] as const).map(([cx, width], i) => (
        <mesh key={i} position={[cx, h / 2, 0]} receiveShadow>
          <planeGeometry args={[width, h]} />
          <primitive object={M.wall} attach="material" />
        </mesh>
      ))}
      {([
        [CX_BACK_WINDOW.y0 / 2, CX_BACK_WINDOW.y0],
        [(CX_BACK_WINDOW.y1 + h) / 2, h - CX_BACK_WINDOW.y1],
      ] as const).map(([cy, height], i) => (
        <mesh
          key={`b${i}`}
          position={[(CX_BACK_WINDOW.x0 + CX_BACK_WINDOW.x1) / 2, cy, 0]}
          receiveShadow
        >
          <planeGeometry args={[CX_BACK_WINDOW.x1 - CX_BACK_WINDOW.x0, height]} />
          <primitive object={M.wall} attach="material" />
        </mesh>
      ))}
      <mesh position={[(CX_PLAN.stone.x0 + CX_PLAN.stone.x1) / 2, h / 2, 0.015]} receiveShadow>
        <planeGeometry args={[CX_PLAN.stone.x1 - CX_PLAN.stone.x0, h]} />
        <meshStandardMaterial map={stone} roughness={0.34} metalness={0.04} />
      </mesh>

      {/* Joinery wall, x = w. */}
      <mesh position={[w, h / 2, d / 2]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      {/* Near wall, behind the camera. */}
      <mesh position={[w / 2, h / 2, d]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[w, h]} />
        <primitive object={M.wallDeep} attach="material" />
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

      {/* Skirting. */}
      {([
        [(CX_BACK_WINDOW.x1 + w) / 2, 0.05, w - CX_BACK_WINDOW.x1, 0.04],
        [w - 0.05, d / 2, 0.04, d],
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
/* Joinery: shelving, credenza, artwork, wordmarks                     */
/* ------------------------------------------------------------------ */

function Joinery({ stone }: { stone: THREE.Texture }) {
  const plan = CX_PLAN;
  const words = useMemo(
    () =>
      makeWordsTexture(
        ["VISION", "STRATEGY", "PEOPLE", "POSSIBILITIES"],
        "#000000",
        "#cdbb9b",
        { size: 30, spacing: 5, transparent: true },
      ),
    [],
  );
  const motto = useMemo(
    () =>
      makeWordsTexture(
        ["GREAT", "LEADERS", "CREATE", "BRIGHTER", "TOMORROWS"],
        "#2b261f",
        "#d6c9b2",
        { size: 27, spacing: 4 },
      ),
    [],
  );
  /** The reference's artwork is a slab of figured marble in a lit frame, which
      is both more in character and a better use of a texture we already make. */
  const art = useMemo(() => makeMarbleTexture("#b9b2a6", "#8a6a33", 5171), []);

  return (
    <group>
      {/* Wordmark, cut into the stone. */}
      <mesh position={[plan.stone.words.x, plan.stone.words.cy, 0.03]}>
        <planeGeometry args={[1.35, plan.stone.words.h]} />
        <meshStandardMaterial map={words} transparent roughness={0.6} metalness={0.3} />
      </mesh>

      {/* Backlit shelving, either side of the stone. */}
      {plan.shelves.map((unit, u) => {
        const width = unit.x1 - unit.x0;
        const cx = (unit.x0 + unit.x1) / 2;
        const top = 2.62;
        const bottom = 0.62;
        const pitch = (top - bottom) / unit.bays;
        return (
          <group key={u}>
            {/* Carcass back, so the bays read as recesses. */}
            <mesh position={[cx, (bottom + top) / 2, 0.06]}>
              <planeGeometry args={[width, top - bottom]} />
              <primitive object={M.walnutDark} attach="material" />
            </mesh>
            {/**
              * Surround, as four pieces rather than a box.
              *
              * It was a solid box the width and height of the unit, sat in
              * front of everything — so the shelves, the books and the bronze
              * objects were all inside a sealed walnut block and the bays
              * rendered as flat black holes. A frame has a hole in it.
              */}
            {([
              [cx - width / 2 - 0.045, (bottom + top) / 2, 0.09, top - bottom + 0.1],
              [cx + width / 2 + 0.045, (bottom + top) / 2, 0.09, top - bottom + 0.1],
            ] as const).map(([px, py, pw, ph], i) => (
              <mesh key={`v${i}`} position={[px, py, 0.17]}>
                <boxGeometry args={[pw, ph, 0.3]} />
                <primitive object={M.walnut} attach="material" />
              </mesh>
            ))}
            {([bottom - 0.05, top + 0.05] as const).map((py, i) => (
              <mesh key={`h${i}`} position={[cx, py, 0.17]}>
                <boxGeometry args={[width + 0.18, 0.09, 0.3]} />
                <primitive object={M.walnut} attach="material" />
              </mesh>
            ))}
            {Array.from({ length: unit.bays + 1 }, (_, i) => (
              <mesh key={i} position={[cx, bottom + pitch * i, 0.21]}>
                <boxGeometry args={[width, 0.035, 0.3]} />
                <primitive object={M.walnut} attach="material" />
              </mesh>
            ))}
            {/* Books and objects, so the bays are not empty boxes. */}
            {Array.from({ length: unit.bays }, (_, b) => {
              const y = bottom + pitch * b + 0.035;
              return (
                <group key={`o${b}`}>
                  {Array.from({ length: 7 }, (_, k) => {
                    const bw = 0.035 + ((b * 7 + k) % 3) * 0.012;
                    const bh = 0.2 + ((b * 5 + k) % 4) * 0.035;
                    return (
                      <mesh
                        key={k}
                        position={[unit.x0 + 0.12 + k * 0.058, y + bh / 2, 0.22]}
                        rotation={[0, 0, k === 5 ? 0.16 : 0]}
                      >
                        <boxGeometry args={[bw, bh, 0.19]} />
                        <meshStandardMaterial
                          color={["#5c4532", "#43362c", "#6d5742", "#35302b"][(b + k) % 4]}
                          roughness={0.8}
                        />
                      </mesh>
                    );
                  })}
                  {b % 2 === 1 && (
                    <mesh position={[unit.x1 - 0.3, y + 0.13, 0.22]}>
                      <sphereGeometry args={[0.1, 14, 12]} />
                      <primitive object={M.bronze} attach="material" />
                    </mesh>
                  )}
                </group>
              );
            })}
          </group>
        );
      })}

      {/* Credenza under the stone. */}
      <group position={[plan.credenza.x, 0, plan.credenza.d / 2 + 0.03]}>
        <mesh position={[0, plan.credenza.h / 2 + 0.07, 0]} castShadow receiveShadow>
          <boxGeometry args={[plan.credenza.w, plan.credenza.h, plan.credenza.d]} />
          <primitive object={M.walnut} attach="material" />
        </mesh>
        {/* Floating, with the colour wash underneath — the oldest trick in
            joinery lighting and still the most effective. */}
        {[-1.0, 0, 1.0].map((x) => (
          <mesh key={x} position={[x, plan.credenza.h / 2 + 0.07, plan.credenza.d / 2 + 0.004]}>
            <planeGeometry args={[0.014, plan.credenza.h - 0.1]} />
            <primitive object={M.bronze} attach="material" />
          </mesh>
        ))}
      </group>

      {/* Framed artwork on the joinery wall. */}
      <group position={[CX.w - 0.04, plan.art.cy, plan.art.z] as [number, number, number]}>
        <mesh rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[plan.art.w + 0.12, plan.art.h + 0.12]} />
          <primitive object={M.bronze} attach="material" />
        </mesh>
        <mesh position={[-0.012, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[plan.art.w, plan.art.h]} />
          <meshStandardMaterial map={art} roughness={0.78} />
        </mesh>
      </group>
      {/* Stone panel behind it. */}
      <mesh position={[CX.w - 0.02, 1.7, plan.art.z]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[2.1, 2.9]} />
        <meshStandardMaterial map={stone} roughness={0.38} metalness={0.04} />
      </mesh>

      {/* The leadership line on the near wall. */}
      <mesh position={[1.9, CX_PLAN.motto.cy, CX_PLAN.motto.z]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[1.35, CX_PLAN.motto.h]} />
        <meshStandardMaterial map={motto} roughness={0.9} />
      </mesh>
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

const PANELS = 5;
const PANEL_OVERLAP = 0.06;

function Glazing({ sheer, blackout, view }: CxoCurtains & { view: THREE.Texture }) {
  const side = CX_WINDOW;
  const back = CX_BACK_WINDOW;
  const height = back.y1 - back.y0;
  const backSpan = back.x1 - back.x0;
  const sideSpan = side.z1 - side.z0;
  const seg = backSpan / PANELS;

  /**
   * Curtain panels on the back-wall glazing, drawing from both ends.
   *
   * `gather` is the fabric's own bunching — 0 a flat drawn panel, 1 one pushed
   * against its stop with deep tight folds — and the geometry helper owns that.
   * All this does is slide the anchor from parked, hard against its own end, to
   * drawn at its slot. Both are needed: gather without travel leaves five
   * bunches spread across the glass they just uncovered.
   *
   * The helper lays its length along Z, so the panels are turned a quarter turn
   * to run along X on this wall.
   */
  const curtain = (position: number, mat: THREE.Material, zOff: number, key: string) =>
    Array.from({ length: PANELS }, (_, i) => {
      const closed = Math.min(Math.max(position / 100, 0), 1);
      const toStart = i < PANELS / 2;
      const drawn = toStart
        ? back.x0 + i * seg - PANEL_OVERLAP / 2
        : back.x0 + (i + 1) * seg + PANEL_OVERLAP / 2;
      const parked = toStart
        ? back.x0 + i * seg * 0.1
        : back.x1 - (PANELS - 1 - i) * seg * 0.1;
      const x = parked + (drawn - parked) * closed;
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
          position={[x, back.y0, zOff]}
          rotation={[0, Math.PI / 2, 0]}
          scale={[1, 1, toStart ? 1 : -1]}
          castShadow={key === "drape"}
        />
      );
    });

  return (
    <group>
      {/* The city, well outside both runs of glass. */}
      <mesh position={[(back.x0 + back.x1) / 2, (back.y0 + back.y1) / 2, -0.6]}>
        <planeGeometry args={[backSpan * 2.4, height * 1.8]} />
        <meshBasicMaterial map={view} toneMapped={false} />
      </mesh>
      <mesh position={[-0.6, (side.y0 + side.y1) / 2, (side.z0 + side.z1) / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[sideSpan * 1.6, height * 1.8]} />
        <meshBasicMaterial map={view} toneMapped={false} />
      </mesh>

      {/* Glass. */}
      <mesh position={[(back.x0 + back.x1) / 2, (back.y0 + back.y1) / 2, 0.02]}>
        <planeGeometry args={[backSpan, height]} />
        <primitive object={M.glass} attach="material" />
      </mesh>
      <mesh position={[0.02, (side.y0 + side.y1) / 2, (side.z0 + side.z1) / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[sideSpan, height]} />
        <primitive object={M.glass} attach="material" />
      </mesh>

      {/* Mullions, and the corner post where the two runs meet. */}
      {Array.from({ length: 3 }, (_, i) => (
        <mesh key={`bm${i}`} position={[back.x0 + (backSpan / 2) * i, (back.y0 + back.y1) / 2, 0.03]}>
          <boxGeometry args={[0.06, height, 0.07]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
      {Array.from({ length: 3 }, (_, i) => (
        <mesh key={`sm${i}`} position={[0.03, (side.y0 + side.y1) / 2, side.z0 + (sideSpan / 2) * i]}>
          <boxGeometry args={[0.07, height, 0.06]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
      {/* Head and sill on the back run. */}
      {([back.y0, back.y1] as const).map((y, i) => (
        <mesh key={`bt${i}`} position={[(back.x0 + back.x1) / 2, y, 0.03]}>
          <boxGeometry args={[backSpan, 0.07, 0.07]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}

      {/* Track above the back glazing. */}
      <mesh position={[(back.x0 + back.x1) / 2, back.y1 + 0.06, 0.26]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.026, 0.026, backSpan + 0.3, 8]} />
        <primitive object={M.metal} attach="material" />
      </mesh>

      {/* Drawn and open alike. An open curtain is not an absent one — it stacks
          at the ends of its track, which is where most of a drape's bulk lives
          and most of what makes a glazed wall look dressed. */}
      {curtain(sheer, M.sheer, 0.17, "sheer")}
      {curtain(blackout, M.drape, 0.32, "drape")}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Desk and seating                                                    */
/* ------------------------------------------------------------------ */

function Desk({ stone }: { stone: THREE.Texture }) {
  const d = CX_PLAN.desk;
  return (
    <group position={[d.x, 0, d.z]}>
      {/* Stone top, with a generous overhang. */}
      <RoundedBox args={[d.w, 0.075, d.d]} radius={0.02} smoothness={3} position={[0, d.h, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={stone} roughness={0.26} metalness={0.05} />
      </RoundedBox>
      {/* Timber plinth, inset so the top appears to float. */}
      <mesh position={[0, (d.h - 0.08) / 2, -0.06]} castShadow>
        <boxGeometry args={[d.w - 0.55, d.h - 0.09, d.d - 0.42]} />
        <primitive object={M.walnut} attach="material" />
      </mesh>
      {/* Recessed plinth, so the mass of the desk floats on a shadow gap. The
          strip that lights it lives in the rig, driven by the feature-colour
          device — it is the detail that makes the reference's desk read as a
          specified piece of furniture rather than a box on the floor. */}
      <mesh position={[0, 0.065, -0.06]}>
        <boxGeometry args={[d.w - 0.95, 0.13, d.d - 0.4]} />
        <primitive object={M.walnutDark} attach="material" />
      </mesh>

      {/* A laptop, open, facing the chair. */}
      <group position={[0.12, d.h + 0.04, 0.04]}>
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
            emissive={new THREE.Color("#4d6a94")}
            emissiveIntensity={1.1}
            toneMapped={false}
          />
        </mesh>
      </group>
      {/* Papers, a pen tray and a small bronze object. */}
      <mesh position={[-0.82, d.h + 0.042, 0.1]} rotation={[-Math.PI / 2, 0, 0.1]}>
        <planeGeometry args={[0.3, 0.42]} />
        <primitive object={M.paper} attach="material" />
      </mesh>
      <mesh position={[-1.16, d.h + 0.055, -0.14]}>
        <boxGeometry args={[0.2, 0.03, 0.09]} />
        <primitive object={M.walnutDark} attach="material" />
      </mesh>
      <mesh position={[1.08, d.h + 0.12, -0.08]}>
        <cylinderGeometry args={[0.055, 0.075, 0.16, 16]} />
        <primitive object={M.bronze} attach="material" />
      </mesh>
    </group>
  );
}

function ExecChair({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, Math.PI, 0]}>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          position={[Math.sin((i / 5) * Math.PI * 2) * 0.2, 0.04, Math.cos((i / 5) * Math.PI * 2) * 0.2]}
          rotation={[0, (i / 5) * Math.PI * 2, 0]}
        >
          <boxGeometry args={[0.05, 0.05, 0.4]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
      <mesh position={[0, 0.27, 0]}>
        <cylinderGeometry args={[0.04, 0.05, 0.44, 10]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      <RoundedBox args={[0.6, 0.13, 0.58]} radius={0.05} smoothness={3} position={[0, 0.52, 0]} castShadow>
        <primitive object={M.leather} attach="material" />
      </RoundedBox>
      {/* High back, the one thing that makes a chair read as an executive one. */}
      <RoundedBox
        args={[0.56, 0.95, 0.12]}
        radius={0.05}
        smoothness={3}
        position={[0, 1.05, -0.26]}
        rotation={[-0.12, 0, 0]}
        castShadow
      >
        <primitive object={M.leather} attach="material" />
      </RoundedBox>
      <RoundedBox args={[0.5, 0.14, 0.1]} radius={0.04} smoothness={2} position={[0, 1.56, -0.3]} rotation={[-0.12, 0, 0]}>
        <primitive object={M.leather} attach="material" />
      </RoundedBox>
      {([-0.33, 0.33] as const).map((ax) => (
        <group key={ax}>
          <mesh position={[ax, 0.72, -0.04]}>
            <boxGeometry args={[0.06, 0.05, 0.38]} />
            <primitive object={M.leather} attach="material" />
          </mesh>
          <mesh position={[ax, 0.62, 0.06]}>
            <boxGeometry args={[0.04, 0.2, 0.04]} />
            <primitive object={M.metal} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function VisitorChair({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          position={[Math.sin((i / 5) * Math.PI * 2) * 0.17, 0.035, Math.cos((i / 5) * Math.PI * 2) * 0.17]}
          rotation={[0, (i / 5) * Math.PI * 2, 0]}
        >
          <boxGeometry args={[0.045, 0.045, 0.34]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.035, 0.045, 0.4, 10]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      <RoundedBox args={[0.55, 0.14, 0.54]} radius={0.05} smoothness={3} position={[0, 0.48, 0]} castShadow>
        <primitive object={M.leather} attach="material" />
      </RoundedBox>
      <RoundedBox
        args={[0.52, 0.6, 0.13]}
        radius={0.05}
        smoothness={3}
        position={[0, 0.82, -0.23]}
        rotation={[-0.16, 0, 0]}
        castShadow
      >
        <primitive object={M.leather} attach="material" />
      </RoundedBox>
      {([-0.31, 0.31] as const).map((ax) => (
        <mesh key={ax} position={[ax, 0.66, -0.02]}>
          <boxGeometry args={[0.055, 0.05, 0.36]} />
          <primitive object={M.leather} attach="material" />
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
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[p.rug.x, 0.004, p.rug.z]} receiveShadow>
        <planeGeometry args={[p.rug.w, p.rug.d]} />
        <meshStandardMaterial map={rug} roughness={1} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[p.deskRug.x, 0.003, p.deskRug.z]}
        receiveShadow
      >
        <planeGeometry args={[p.deskRug.w, p.deskRug.d]} />
        <meshStandardMaterial map={rug} roughness={1} />
      </mesh>

      {/* Sofa, facing into the room. */}
      <group position={[p.sofa.x, 0, p.sofa.z]} rotation={[0, Math.PI / 2, 0]}>
        <RoundedBox args={[p.sofa.len, 0.34, 0.95]} radius={0.07} smoothness={3} position={[0, 0.34, 0]} castShadow receiveShadow>
          <primitive object={M.sofa} attach="material" />
        </RoundedBox>
        <RoundedBox args={[p.sofa.len, 0.62, 0.26]} radius={0.07} smoothness={3} position={[0, 0.66, -0.36]} castShadow>
          <primitive object={M.sofa} attach="material" />
        </RoundedBox>
        {([-1, 1] as const).map((s) => (
          <RoundedBox
            key={s}
            args={[0.26, 0.5, 0.95]}
            radius={0.07}
            smoothness={3}
            position={[(s * (p.sofa.len - 0.26)) / 2, 0.52, 0]}
            castShadow
          >
            <primitive object={M.sofa} attach="material" />
          </RoundedBox>
        ))}
        {[-0.85, -0.28, 0.42, 1.0].map((cx, i) => (
          <RoundedBox
            key={cx}
            args={[0.42, 0.42, 0.14]}
            radius={0.06}
            smoothness={3}
            position={[cx, 0.72, -0.2]}
            rotation={[0.26, 0, i % 2 ? 0.1 : -0.08]}
            castShadow
          >
            <primitive object={i % 2 ? M.cushion : M.sofa} attach="material" />
          </RoundedBox>
        ))}
      </group>

      {/* Coffee table: a bronze drum with a stone top. */}
      <group position={[p.coffee.x, 0, p.coffee.z]}>
        <mesh position={[0, 0.18, 0]} castShadow>
          <cylinderGeometry args={[0.37, 0.41, 0.36, 24]} />
          <primitive object={M.bronze} attach="material" />
        </mesh>
        <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.46, 0.46, 0.05, 28]} />
          <primitive object={M.walnutDark} attach="material" />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[-0.1 + i * 0.015, 0.44 + i * 0.022, 0.05 - i * 0.02]} rotation={[-Math.PI / 2, 0, 0.2 + i * 0.3]}>
            <planeGeometry args={[0.3, 0.22]} />
            <primitive object={M.paper} attach="material" />
          </mesh>
        ))}
      </group>

      {/* Side table with the shaded lamp — the second decorative fitting. */}
      <group position={[p.sideTable.x, 0, p.sideTable.z]}>
        <mesh position={[0, 0.26, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.32, 0.52, 20]} />
          <primitive object={M.walnut} attach="material" />
        </mesh>
        <mesh position={[0, 0.54, 0]}>
          <cylinderGeometry args={[0.33, 0.33, 0.035, 22]} />
          <primitive object={M.walnutDark} attach="material" />
        </mesh>
      </group>

      {/* Floor-standing planter stand by the glazing. */}
      <mesh position={[p.floorLamp.x, 0.5, p.floorLamp.z]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 1.0, 10]} />
        <primitive object={M.bronze} attach="material" />
      </mesh>
    </group>
  );
}

function Plants() {
  return (
    <group>
      {CX_PLAN.plants.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} scale={p.s}>
          <mesh position={[0, 0.3, 0]} castShadow>
            <cylinderGeometry args={[0.28, 0.22, 0.6, 16]} />
            <primitive object={M.planter} attach="material" />
          </mesh>
          {[
            [0, 1.08, 0, 0.42],
            [0.2, 1.44, 0.12, 0.3],
            [-0.17, 1.36, -0.14, 0.26],
            [0.07, 1.72, -0.06, 0.2],
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
/* Air conditioning                                                    */
/* ------------------------------------------------------------------ */

/**
 * A linear slot diffuser, recessed in the ceiling.
 *
 * Deliberately quiet geometry: a bronze-lipped slot with dark blades in it. It
 * is the only piece of services anybody should be able to find in this room,
 * and finding it should take two seconds.
 */
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
      {Array.from({ length: 14 }, (_, i) => (
        <mesh
          key={i}
          position={[-d.len / 2 + 0.08 + i * ((d.len - 0.16) / 13), -0.022, 0]}
          rotation={[0.5, 0, 0]}
        >
          <boxGeometry args={[0.012, 0.06, 0.09]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Luminaire housings                                                  */
/* ------------------------------------------------------------------ */

function Housings() {
  const p = CX_PLAN;
  return (
    <group>
      {/* Suspended linear over the desk. */}
      <mesh position={[p.pendant.x, p.pendant.y, p.pendant.z]} castShadow>
        <boxGeometry args={[p.pendant.w, 0.1, 0.13]} />
        <primitive object={M.walnutDark} attach="material" />
      </mesh>
      {([-1, 1] as const).map((s) => (
        <mesh key={s} position={[p.pendant.x + s * (p.pendant.w / 2 - 0.3), (p.pendant.y + CX.h) / 2 + 0.05, p.pendant.z]}>
          <cylinderGeometry args={[0.006, 0.006, CX.h - p.pendant.y - 0.1, 6]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}

      {/* Recessed trims. */}
      {p.generalHeads.map((h) => (
        <mesh key={`g${h.x}-${h.z}`} position={[h.x, CX.h - 0.012, h.z]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.052, 0.072, 18]} />
          <primitive object={M.housing} attach="material" />
        </mesh>
      ))}
      {p.taskHeads.map((h) => (
        <mesh key={`t${h.x}-${h.z}`} position={[h.x, CX.h - 0.012, h.z]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.036, 0.05, 16]} />
          <primitive object={M.housing} attach="material" />
        </mesh>
      ))}
      <mesh position={[p.artHead.x, CX.h - 0.012, p.artHead.z]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.036, 0.05, 16]} />
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
  /**
   * Cooler and far more contrasted than the first pass.
   *
   * At #3b3530 with #8f8275 veining, a dark warm-grey lit by a 2400 K cove and
   * an amber colour wash came out as a flat sheet of copper — the veining had
   * nothing like enough contrast to survive being washed in orange, and the
   * base was warm enough to go the same way. A greener grey holds its own
   * against warm light, and the pale veining then reads as stone.
   */
  const stone = useMemo(() => makeMarbleTexture("#38393a", "#b9b7b0"), []);
  const deskStone = useMemo(() => makeMarbleTexture("#3d3e3f", "#aeaca6", 991), []);

  return (
    <group>
      <Shell stone={stone} />
      <Joinery stone={stone} />
      <Glazing sheer={curtains.sheer} blackout={curtains.blackout} view={view} />
      <Desk stone={deskStone} />
      <ExecChair x={CX_PLAN.execChair.x} z={CX_PLAN.execChair.z} />
      {CX_PLAN.visitors.map((v, i) => (
        <VisitorChair key={i} x={v.x} z={v.z} />
      ))}
      <Lounge />
      <Plants />
      <AirDiffuser />
      <Housings />
    </group>
  );
}
