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
  /**
   * One run of joinery, to the left of the marble. The right-hand bay is the
   * display wall.
   *
   * There were two, and the professional display was specified straight on top
   * of the second one — so the panel, the video bar and the control plate were
   * all buried inside a bookcase. The brief wants the technology to be
   * architectural and visible; it cannot be either while it is behind shelves.
   */
  shelves: [{ x0: 0.5, x1: 2.4, bays: 4 }],
  credenza: { x: 6.25, len: 2.5, d: 0.5, h: 0.62 },
  art: { x: 7.62, cy: 1.8, w: 1.2, h: 1.55 },

  /** The desk, parallel to the glazing with the chair backing onto it. */
  /**
   * 2.35 m long, not 3.2.
   *
   * The brief puts an executive desk at 1800-2200 mm and it is right: past
   * about two and a half metres a desk stops reading as a desk and starts
   * reading as a table, which is the exact failure this room had. It stays
   * dominant through mass and through the line of light under it, not length.
   */
  desk: { x: 2.65, z: 4.3, w: 1.15, d: 2.35, h: 0.75 },
  execChair: { x: 1.52, z: 4.3 },
  /**
   * Two visitor chairs, and only two.
   *
   * This is the whole visitor zone. The brief caps it at two or three people
   * and forbids a conference arrangement — one senior executive owns this room
   * and the seating has to say so.
   */
  visitors: [
    { x: 3.78, z: 3.78 },
    { x: 3.78, z: 4.82 },
  ],
  /** A compact discussion table beside them. Not a meeting table. */
  sideTable: { x: 4.55, z: 4.3 },

  /** Suspended linear over the desk, on its long axis. */
  pendant: { x: 2.65, z: 4.3, len: 2.6, y: 2.36 },

  /** Commercial carpet in the executive zone, not a patterned rug. */
  carpet: { x: 3.1, z: 6.6, w: 5.4, d: 6.8 },

  diffuser: { x: 5.6, z: 7.6, len: 2.2 },

  /** Professional display, video bar and soundbar on the feature wall. */
  display: { x: 6.25, cy: 1.8, w: 1.85, h: 1.04 },
  /** Smart control panel, at the door end of the joinery. */
  panel: { x: 7.72, cy: 1.35 },

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

  /** Two large architectural planters, not a scatter of houseplants. */
  plants: [
    { x: 0.95, z: 6.6, s: 1.15 },
    // Clear of the first one. At (2.15, 7.55) the two overlapped from this
    // viewpoint and read as one lumpy mass rather than two planters.
    { x: 4.3, z: 7.9, s: 1.1 },
    { x: 7.05, z: 9.7, s: 1.0 },
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
  /**
   * Brushed stainless, used sparingly, with matte black for everything else.
   *
   * The brief asks for no excessive gold and it is right — warm metal
   * everywhere is what tips an executive office from corporate into hotel. One
   * cool metal, sparingly, reads as specification rather than as decoration.
   */
  brushed: new THREE.MeshStandardMaterial({
    color: "#99a0a6",
    roughness: 0.34,
    metalness: 0.9,
  }),
  matteBlack: new THREE.MeshStandardMaterial({
    color: "#1a1b1d",
    roughness: 0.6,
    metalness: 0.15,
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
  /** Neutral commercial upholstery on the guest and meeting chairs. */
  leather: new THREE.MeshPhysicalMaterial({
    color: "#4a4744",
    roughness: 0.58,
    sheen: 0.6,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color("#9c978f"),
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
  /** Solar-filter screen fabric: open weave, neutral, commercial. */
  sheer: new THREE.MeshStandardMaterial({
    color: "#b9b4ac",
    roughness: 0.82,
    transparent: true,
    opacity: 0.52,
    side: THREE.DoubleSide,
  }),
  /** Blackout roller behind it. Opaque, because that is the whole product. */
  drape: new THREE.MeshStandardMaterial({
    color: "#3e3c39",
    roughness: 0.92,
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
      {/**
       * A small brushed logo plate, low on the slab.
       *
       * Four stacked words across a lit stone wall is a boardroom graphic, and
       * the brief names it as the thing making the room read that way. A clean
       * dedicated location for an identity is what an executive wall actually
       * carries — and leaving it blank is the honest placeholder, since the
       * client's mark is theirs to supply.
       */}
      <mesh position={[p.marble.x0 + 0.45, p.marble.y0 + 0.34, 0.11]}>
        <planeGeometry args={[0.52, 0.14]} />
        <primitive object={M.brushed} attach="material" />
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
                  {/* One open bay in four — the brief's 70 per cent closed,
                      and the difference between custom millwork and a
                      bookcase. Four books and one object in it, no more. */}
                  {bi === 3 &&
                    Array.from({ length: 4 }, (_, i) => {
                    const bh = 0.2 + ((k + i) % 5) * 0.032;
                    return (
                      <mesh
                        key={i}
                        position={[unit.x0 + 0.16 + i * 0.062, y + bh / 2, 0.26]}
                        rotation={[0, 0, i === 5 ? 0.22 : 0]}
                      >
                        <boxGeometry args={[0.045, bh, 0.2]} />
                        <meshStandardMaterial
                          color={["#3a3330", "#2a2724", "#443c36", "#232120"][(k + i) % 4]}
                          roughness={0.85}
                        />
                      </mesh>
                    );
                    })}
                  {/* Closed document storage in the two lower bays. */}
                  {bi < 3 && (
                    <group>
                      <mesh position={[cx, y + pitch / 2 - 0.03, 0.33]}>
                        <boxGeometry args={[span - 0.06, pitch - 0.07, 0.035]} />
                        <primitive object={M.walnut} attach="material" />
                      </mesh>
                      <mesh position={[cx, y + pitch / 2 - 0.03, 0.352]}>
                        <boxGeometry args={[span * 0.42, 0.012, 0.012]} />
                        <primitive object={M.brushed} attach="material" />
                      </mesh>
                    </group>
                  )}
                  {/* One sculptural object per unit, and no more. The brief
                      asks for curated niches, not a souvenir shelf. */}
                  {bi === 3 && (
                    <mesh position={[unit.x1 - 0.3, y + 0.13, 0.26]}>
                      <boxGeometry args={[0.16, 0.26, 0.16]} />
                      <primitive object={M.brushed} attach="material" />
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
            <primitive object={M.brushed} attach="material" />
          </mesh>
        ))}
      </group>

      {/**
       * The technology, integrated into the millwork rather than hung on it.
       *
       * A professional display recessed flush into the joinery, a video bar
       * under it and a soundbar under that — which is what makes a room read as
       * a corporate office rather than as a study with a television in it. The
       * brief is specific that this should look architectural, so the display
       * sits in its own dark reveal exactly as the marble slab does.
       */}
      <group position={[p.display.x, p.display.cy, 0]}>
        <mesh position={[0, 0, 0.085]}>
          <planeGeometry args={[p.display.w + 0.12, p.display.h + 0.12]} />
          <primitive object={M.walnutDark} attach="material" />
        </mesh>
        <mesh position={[0, 0, 0.095]}>
          <planeGeometry args={[p.display.w, p.display.h]} />
          <meshStandardMaterial color="#0b0c0e" roughness={0.12} metalness={0.25} />
        </mesh>
        {/**
         * The screen awake, dimly.
         *
         * The brief wants the technology unmistakable, and a dark rectangle on
         * a lit wall is just a hole. An executive information screen sits at a
         * low level most of the day — bright enough to read as a working
         * display, far too dim to compete with the marble beside it.
         */}
        <mesh position={[0, 0, 0.0955]}>
          <planeGeometry args={[p.display.w - 0.03, p.display.h - 0.03]} />
          <meshStandardMaterial
            color="#000000"
            emissive={new THREE.Color("#16243a")}
            emissiveIntensity={1}
            toneMapped={false}
          />
        </mesh>
        {[0.3, 0.1, -0.1].map((fy, i) => (
          <mesh key={fy} position={[-p.display.w / 4, fy, 0.096]}>
            <planeGeometry args={[p.display.w * 0.34, 0.03]} />
            <meshStandardMaterial
              color="#000000"
              emissive={new THREE.Color(i === 0 ? "#6f8fb8" : "#3c5a7c")}
              emissiveIntensity={1.3}
              toneMapped={false}
            />
          </mesh>
        ))}
        <mesh position={[p.display.w / 4, 0.05, 0.096]}>
          <planeGeometry args={[p.display.w * 0.36, p.display.h * 0.42]} />
          <meshStandardMaterial
            color="#000000"
            emissive={new THREE.Color("#24405f")}
            emissiveIntensity={1.1}
            toneMapped={false}
          />
        </mesh>
        {/* Video bar and soundbar, in matte black under the panel. */}
        <mesh position={[0, -p.display.h / 2 - 0.09, 0.12]}>
          <boxGeometry args={[0.4, 0.055, 0.06]} />
          <primitive object={M.matteBlack} attach="material" />
        </mesh>
        {/* The camera lens. Rotation belongs on the mesh, not the geometry. */}
        <mesh position={[0, -p.display.h / 2 - 0.09, 0.148]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.014, 0.014, 0.02, 12]} />
          <meshStandardMaterial color="#05060a" roughness={0.3} />
        </mesh>
        <mesh position={[0, -p.display.h / 2 - 0.22, 0.11]}>
          <boxGeometry args={[p.display.w * 0.8, 0.07, 0.07]} />
          <primitive object={M.matteBlack} attach="material" />
        </mesh>
      </group>

      {/* Smart control panel, flush in the joinery by the door end. */}
      <group position={[p.panel.x, p.panel.cy, 0.085]}>
        <mesh>
          <planeGeometry args={[0.2, 0.14]} />
          <primitive object={M.matteBlack} attach="material" />
        </mesh>
        <mesh position={[0, 0, 0.006]}>
          <planeGeometry args={[0.17, 0.112]} />
          <meshStandardMaterial
            color="#000000"
            emissive={new THREE.Color("#2f5b86")}
            emissiveIntensity={1.1}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* One abstract corporate artwork, on the fluted section. Minimal, as
          the brief asks — the premium comes from the millwork, not from
          hanging more things on it. */}
      <group position={[p.art.x, p.art.cy, 0.1]}>
        <mesh>
          <planeGeometry args={[p.art.w + 0.07, p.art.h + 0.07]} />
          <primitive object={M.matteBlack} attach="material" />
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

/**
 * Commercial motorised roller blinds, in place of the curtains.
 *
 * Two rollers per bay: a solar-filter screen for glare, a blackout behind it
 * for privacy and for the evening. A roller is also the honest geometry for a
 * motor position — it scales in Y from the head, which is exactly what the
 * device's 0-100 means, where a gathered curtain had to fake both a fold shape
 * and a travel.
 *
 * This is one of the clearest residential-to-corporate swaps in the brief: a
 * drape at a window is a house, a cassette roller is an office.
 */
function Glazing({ sheer, blackout, view }: CxoCurtains & { view: THREE.Texture }) {
  const win = CX_WINDOW;
  const span = win.z1 - win.z0;
  const height = win.y1 - win.y0;
  const bays = 5;
  const bay = span / bays;

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

      {/* Mullions, head and sill. */}
      {Array.from({ length: bays + 1 }, (_, i) => (
        <mesh key={`m${i}`} position={[0.03, (win.y0 + win.y1) / 2, win.z0 + bay * i]}>
          <boxGeometry args={[0.08, height, 0.06]} />
          <primitive object={M.matteBlack} attach="material" />
        </mesh>
      ))}
      {([win.y0, win.y1] as const).map((y, i) => (
        <mesh key={`t${i}`} position={[0.03, y, (win.z0 + win.z1) / 2]}>
          <boxGeometry args={[0.08, 0.08, span]} />
          <primitive object={M.matteBlack} attach="material" />
        </mesh>
      ))}

      {/* Cassettes, one pair per bay. */}
      {Array.from({ length: bays }, (_, i) => (
        <mesh key={`c${i}`} position={[0.13, win.y1 - 0.05, win.z0 + bay * (i + 0.5)]}>
          <boxGeometry args={[0.13, 0.12, bay - 0.08]} />
          <primitive object={M.matteBlack} attach="material" />
        </mesh>
      ))}

      {([
        { pos: blackout, x: 0.08, mat: M.drape, key: "bo" },
        { pos: sheer, x: 0.16, mat: M.sheer, key: "sh" },
      ] as const).map(({ pos, x, mat, key }) =>
        pos <= 0.4 ? null : (
          <group key={key}>
            {Array.from({ length: bays }, (_, i) => {
              const drop = height * (pos / 100);
              return (
                <mesh
                  key={i}
                  position={[x, win.y1 - drop / 2, win.z0 + bay * (i + 0.5)]}
                  rotation={[0, Math.PI / 2, 0]}
                  castShadow={key === "bo"}
                >
                  <planeGeometry args={[bay - 0.1, drop]} />
                  <primitive object={mat} attach="material" />
                </mesh>
              );
            })}
          </group>
        ),
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Desk and seating                                                    */
/* ------------------------------------------------------------------ */

function Desk() {
  const d = CX_PLAN.desk;
  /** Dark stone, not the pale slab it was. The brief asks for walnut and stone
      with restraint, and a white marble desk is the single most hotel-like
      object you can put in an office. */
  const top = useMemo(() => makeMarbleTexture("#2f3133", "#787c80", 991), []);
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
      {/**
       * A professional widescreen display on an arm, and a grommet for the
       * cables to disappear into.
       *
       * The brief calls the desk the most important change, and this is most of
       * what separates an executive workstation from a writing desk: a monitor
       * somebody actually works at, and no visible cables.
       */}
      <group position={[-0.25, d.h, -0.1]} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, 0.012, 0]}>
          <boxGeometry args={[0.24, 0.024, 0.16]} />
          <primitive object={M.matteBlack} attach="material" />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.38, 12]} />
          <primitive object={M.matteBlack} attach="material" />
        </mesh>
        <mesh position={[0, 0.56, 0.02]} rotation={[-0.06, 0, 0]}>
          <boxGeometry args={[1.0, 0.42, 0.022]} />
          <primitive object={M.matteBlack} attach="material" />
        </mesh>
        <mesh position={[0, 0.56, 0.034]} rotation={[-0.06, 0, 0]}>
          <planeGeometry args={[0.96, 0.385]} />
          <meshStandardMaterial
            color="#000000"
            emissive={new THREE.Color("#4e6d96")}
            emissiveIntensity={1.15}
            toneMapped={false}
          />
        </mesh>
      </group>
      {/* Cable grommet. */}
      <mesh position={[0.18, d.h + 0.046, -0.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.035, 0.05, 20]} />
        <primitive object={M.matteBlack} attach="material" />
      </mesh>
      <mesh position={[-0.1, d.h + 0.046, -1.15]} rotation={[-Math.PI / 2, 0, 0.12]}>
        <planeGeometry args={[0.3, 0.42]} />
        <primitive object={M.paper} attach="material" />
      </mesh>
      <group position={[0.08, d.h + 0.1, 1.05]}>
        <mesh>
          <cylinderGeometry args={[0.11, 0.09, 0.12, 16]} />
          <primitive object={M.brushed} attach="material" />
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
  /**
   * The executive chair has to read as the senior object in the room.
   *
   * The brief puts it second in the visual hierarchy, after the desk and ahead
   * of the feature wall, so the difference from the visitors' chairs is not
   * subtle: a taller back, a wider seat, a deeper cushion and black leather
   * against their neutral fabric.
   */
  const hide = exec ? M.execLeather : M.leather;
  const backH = exec ? 1.05 : 0.6;
  const seatW = exec ? 0.66 : 0.55;
  const seatD = exec ? 0.64 : 0.52;
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
      <RoundedBox args={[seatW, exec ? 0.18 : 0.14, seatD]} radius={0.06} smoothness={3} position={[0, 0.5, 0]} castShadow>
        <primitive object={hide} attach="material" />
      </RoundedBox>
      <RoundedBox
        args={[seatW - 0.03, backH, exec ? 0.18 : 0.13]}
        radius={0.06}
        smoothness={3}
        position={[0, 0.52 + backH / 2, -(seatD / 2 - 0.05)]}
        rotation={[-0.14, 0, 0]}
        castShadow
      >
        <primitive object={hide} attach="material" />
      </RoundedBox>
      {([-1, 1] as const).map((sgn) => (
        <mesh key={sgn} position={[sgn * (seatW / 2 - 0.02), 0.69, -0.03]}>
          <boxGeometry args={[0.07, 0.06, seatD * 0.68]} />
          <primitive object={hide} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Lounge                                                              */
/* ------------------------------------------------------------------ */

/**
 * The executive zone floor, and the compact discussion table.
 *
 * What stood here was a four-seat table with four chairs round it, which is a
 * boardroom in miniature and the opposite of what this room is. The visitor
 * seating is now two chairs at the desk and a small table beside them — enough
 * for a conversation, not enough for a meeting.
 */
function VisitorZone() {
  const p = CX_PLAN;
  const t = p.sideTable;

  return (
    <group>
      {/* Commercial carpet over the executive zone, plain. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[p.carpet.x, 0.004, p.carpet.z]} receiveShadow>
        <planeGeometry args={[p.carpet.w, p.carpet.d]} />
        <meshStandardMaterial color="#4d4a46" roughness={1} />
      </mesh>

      {/* Compact discussion table: stone top, matte black blade. */}
      <group position={[t.x, 0, t.z]}>
        <RoundedBox args={[0.62, 0.05, 0.62]} radius={0.012} smoothness={3} position={[0, 0.58, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#2a2c2e" roughness={0.28} metalness={0.08} />
        </RoundedBox>
        <mesh position={[0, 0.29, 0]} castShadow>
          <boxGeometry args={[0.1, 0.56, 0.1]} />
          <primitive object={M.matteBlack} attach="material" />
        </mesh>
        <mesh position={[0, 0.015, 0]}>
          <boxGeometry args={[0.42, 0.03, 0.42]} />
          <primitive object={M.matteBlack} attach="material" />
        </mesh>
        {/* One document set. Nothing else. */}
        <mesh position={[0, 0.608, 0.03]} rotation={[-Math.PI / 2, 0, 0.1]}>
          <planeGeometry args={[0.24, 0.3]} />
          <primitive object={M.paper} attach="material" />
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
        <primitive object={M.brushed} attach="material" />
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
      <VisitorZone />
      <Plants />
      <AirDiffuser />
      <Housings />
    </group>
  );
}
