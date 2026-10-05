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

import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
import { makeBlindTexture, makeCityTexture, makeCurtainGeometry } from "./geometry";
import { applySet, useTextureSet } from "./pbr";

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
  /**
   * 1.85 m of marble, not 2.6.
   *
   * Measured against the reference: there the slab takes about 15 per cent of
   * the frame with a run of joinery each side at 10 to 12. Mine was taking 30
   * and pushing the right-hand shelving off the edge of the picture entirely,
   * which is most of why the wall looked bare.
   */
  /**
   * Centred on the desk, not beside it.
   *
   * In the reference the slab sits directly behind the executive chair and is
   * the backdrop to the whole composition. Mine was off to the right, which
   * left the main subject backed by a dark gap between two bookcases — the
   * "background behind the table" problem exactly.
   */
  marble: { x0: 2.0, x1: 3.9, y0: 0.82, y1: 2.92 },
  /**
   * Joinery both sides of the marble, as the reference has it.
   *
   * The right-hand run became a display wall for a pass, and the room went
   * noticeably emptier for it — a lit bay full of books is a dense, warm,
   * detailed thing, and a black panel is a hole. The right unit starts higher
   * because the credenza runs under it.
   */
  shelves: [
    { x0: 0.3, x1: 1.85, bays: 4, bottom: 0.62 },
    { x0: 4.05, x1: 5.9, bays: 3, bottom: 1.0 },
  ],
  credenza: { x: 4.98, len: 2.1, d: 0.5, h: 0.62 },
  art: { x: 6.9, cy: 1.78, w: 1.2, h: 1.55 },

  /** The desk, parallel to the glazing with the chair backing onto it. */
  /**
   * 2.35 m long, not 3.2.
   *
   * The brief puts an executive desk at 1800-2200 mm and it is right: past
   * about two and a half metres a desk stops reading as a desk and starts
   * reading as a table, which is the exact failure this room had. It stays
   * dominant through mass and through the line of light under it, not length.
   */
  desk: { x: 2.95, z: 2.9, w: 2.6, d: 1.12, h: 0.75 },
  /**
   * Behind the desk, backing onto the feature wall and facing the room.
   *
   * The desk used to run parallel to the glazing with the chair on the window
   * side, which left it floating in the middle of the floor directly in front
   * of the marble. In the reference it is set back against the wall with the
   * room open in front of it, which is both how an executive office is laid
   * out and what keeps the feature wall visible.
   */
  execChair: { x: 2.95, z: 1.86 },
  /**
   * Two visitor chairs, and only two.
   *
   * This is the whole visitor zone. The brief caps it at two or three people
   * and forbids a conference arrangement — one senior executive owns this room
   * and the seating has to say so.
   */
  visitors: [
    { x: 2.3, z: 4.15 },
    { x: 3.65, z: 4.15 },
  ],

  /** Suspended linear over the desk, on its long axis. */
  pendant: { x: 2.95, z: 2.8, len: 2.2, y: 2.36 },

  /** Commercial carpet in the executive zone, not a patterned rug. */
  carpet: { x: 3.0, z: 4.0, w: 5.6, d: 4.4 },
  /**
   * The lounge, restored.
   *
   * The written brief said to strip it out; the client's own reference image
   * has a sectional and a round table in the foreground, and the image is what
   * they are actually asking for. A seating group in a CXO cabin is normal —
   * what made the earlier version read as residential was its scale and its
   * position in the frame, not its existence.
   */
  sofa: { x: 1.3, z: 6.65, len: 3.0 },
  coffee: { x: 2.95, z: 6.65 },

  diffuser: { x: 5.6, z: 7.6, len: 2.2 },

  /** Professional display, video bar and soundbar on the feature wall. */
  display: { x: 6.25, cy: 1.8, w: 1.85, h: 1.04 },
  /** Smart control panel, at the door end of the joinery. */
  panel: { x: 7.6, cy: 1.35 },

  generalHeads: [
    { x: 1.3, z: 1.4 }, { x: 3.9, z: 1.3 }, { x: 6.5, z: 1.4 },
    { x: 1.4, z: 4.3 }, { x: 6.6, z: 4.4 },
    { x: 1.5, z: 7.2 }, { x: 4.4, z: 7.1 }, { x: 6.7, z: 7.3 },
    { x: 2.6, z: 9.9 }, { x: 6.2, z: 9.9 },
  ],
  taskHeads: [
    { x: 2.1, z: 2.45 }, { x: 3.8, z: 2.45 },
    { x: 2.1, z: 3.15 }, { x: 3.8, z: 3.15 },
  ],
  artHead: { x: 6.9, z: 0.95 },
  motto: { z: 10.7, cy: 1.85, h: 1.8 },

  /** Two large architectural planters, not a scatter of houseplants. */
  plants: [
    { x: 1.05, z: 4.3, s: 1 },
    { x: 7.3, z: 4.6, s: 0.92 },
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
   * Floor, stone and carpet are declared here rather than inline, so the
   * texture pass can write scanned maps onto them without reconstructing
   * anything. Their colours stay as a tint under the albedo.
   */
  floor: new THREE.MeshStandardMaterial({
    color: "#8a7a67",
    roughness: 0.52,
    metalness: 0.02,
    envMapIntensity: 0.5,
  }),
  stone: new THREE.MeshStandardMaterial({
    color: "#a89d8c",
    roughness: 0.3,
    metalness: 0.04,
    envMapIntensity: 1.1,
  }),
  deskTop: new THREE.MeshStandardMaterial({
    color: "#6f685e",
    /**
     * Matt-honed, and the number went up twice before it was right.
     *
     * The blown band across this top was never the task lamp — it was the
     * suspended pendant, 2.2 m of bright emissive strip hanging directly above
     * a stone surface, reflecting in it. That is physically correct and it was
     * still clipping seven per cent of the top.
     *
     * Raising roughness spreads that reflection instead of dimming the fitting
     * that causes it, which is the right lever: the pendant has to stay bright,
     * because it is the one luminaire in the room anybody looks at.
     */
    roughness: 0.5,
    metalness: 0.04,
    envMapIntensity: 0.7,
  }),
  carpet: new THREE.MeshStandardMaterial({
    color: "#c6bdb0",
    roughness: 0.96,
    envMapIntensity: 0.25,
  }),
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
    color: "#36332f",
    roughness: 0.42,
    sheen: 0.8,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color("#8a7a63"),
  }),
  /**
   * Neutral commercial upholstery on the guest chairs.
   *
   * The colours from here down read lighter in source than they do on screen.
   * The scanned albedos are deliberately desaturated to a mid grey at build
   * time — ambientCG's carpet is red and its leather brown, and a tint cannot
   * undo a hue — so the material colour is multiplied by roughly 0.5 before
   * anything else touches it. Reading these as finished values is a mistake.
   */
  leather: new THREE.MeshPhysicalMaterial({
    color: "#7e7974",
    roughness: 0.58,
    sheen: 0.6,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color("#9c978f"),
  }),
  sofa: new THREE.MeshPhysicalMaterial({
    color: "#d6cbb8",
    roughness: 0.82,
    sheen: 1,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color("#d4cab6"),
  }),
  cushion: new THREE.MeshPhysicalMaterial({
    color: "#9a9684",
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
  /** Heavy taupe drape, stacking at the ends of the track. */
  drape: new THREE.MeshPhysicalMaterial({
    color: "#8a7f6d",
    roughness: 0.92,
    sheen: 0.8,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color("#cdbfa4"),
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
  /**
   * Book spines, as six shared materials rather than one per book.
   *
   * There are about sixty books on this wall. Six materials means six shader
   * programs; sixty inline `meshStandardMaterial` elements would mean sixty.
   *
   * Muted on purpose — a shelf of saturated spines is the fastest way to make
   * expensive joinery look like a charity shop.
   */
  books: [
    new THREE.MeshStandardMaterial({ color: "#2f3a33", roughness: 0.84 }),
    new THREE.MeshStandardMaterial({ color: "#4a2f2a", roughness: 0.84 }),
    new THREE.MeshStandardMaterial({ color: "#2b3242", roughness: 0.84 }),
    new THREE.MeshStandardMaterial({ color: "#6b5c44", roughness: 0.86 }),
    new THREE.MeshStandardMaterial({ color: "#30302e", roughness: 0.82 }),
    new THREE.MeshStandardMaterial({ color: "#8d8372", roughness: 0.88 }),
  ],
  /** Matte ceramic, for the vases. */
  ceramic: new THREE.MeshStandardMaterial({
    color: "#b4ab9c",
    roughness: 0.62,
    metalness: 0.02,
  }),
  ceramicDark: new THREE.MeshStandardMaterial({
    color: "#4a463f",
    roughness: 0.48,
    metalness: 0.04,
  }),
  housing: new THREE.MeshStandardMaterial({ color: "#1a1b1d", roughness: 0.5 }),
};

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

function Shell() {
  const { w, d, h, soffit } = CX;
  const win = CX_WINDOW;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[w / 2, 0, d / 2]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <primitive object={M.floor} attach="material" />
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

/**
 * What stands in one shelf bay.
 *
 * The bays were a row of identical thin boxes, which is what made the wall
 * read as empty even with the lights on. A bookcase is not books — it is books
 * *and* the gaps between them, one leaning, a stack laid flat, and two or three
 * objects with a different silhouette.
 *
 * Deterministic from `seed`, so nothing reshuffles on a remount, and every bay
 * gets a different arrangement without any of it being placed by hand.
 */
function BayContents({
  x0,
  x1,
  y,
  height,
  seed,
  closed,
}: {
  x0: number;
  x1: number;
  y: number;
  height: number;
  seed: number;
  closed: boolean;
}) {
  const span = x1 - x0;
  const cx = (x0 + x1) / 2;

  // Closed document storage in the bottom bay, with a pull.
  if (closed) {
    return (
      <group>
        <mesh position={[cx, y + height / 2 - 0.03, 0.33]}>
          <boxGeometry args={[span - 0.06, height - 0.07, 0.035]} />
          <primitive object={M.walnut} attach="material" />
        </mesh>
        <mesh position={[cx, y + height / 2 - 0.03, 0.352]}>
          <boxGeometry args={[span * 0.42, 0.012, 0.012]} />
          <primitive object={M.brushed} attach="material" />
        </mesh>
      </group>
    );
  }

  let st = seed * 2654435761;
  const rnd = () => {
    st = (st * 1103515245 + 12345) & 0x7fffffff;
    return (st % 10000) / 10000;
  };

  const items: React.ReactNode[] = [];
  let x = x0 + 0.12;
  const limit = x1 - 0.14;
  let n = 0;

  while (x < limit && n < 14) {
    const roll = rnd();

    if (roll < 0.56) {
      // A run of upright books, varied in height and thickness.
      const count = 3 + Math.floor(rnd() * 5);
      for (let i = 0; i < count && x < limit; i++) {
        const t = 0.028 + rnd() * 0.034;
        const bh = Math.min(height - 0.09, 0.19 + rnd() * 0.12);
        const lean = i === count - 1 && rnd() < 0.3 ? 0.22 : 0;
        items.push(
          <mesh
            key={`b${n}-${i}`}
            position={[x + t / 2, y + bh / 2, 0.26]}
            rotation={[0, 0, lean]}
            castShadow
          >
            <boxGeometry args={[t, bh, 0.18]} />
            <primitive object={M.books[Math.floor(rnd() * 6)]} attach="material" />
          </mesh>,
        );
        x += t + 0.004 + (lean ? 0.03 : 0);
      }
      x += 0.05;
    } else if (roll < 0.71) {
      // A short stack laid flat — what stops a shelf looking ruled.
      const layers = 2 + Math.floor(rnd() * 3);
      const w = 0.14 + rnd() * 0.05;
      for (let i = 0; i < layers; i++) {
        items.push(
          <mesh key={`s${n}-${i}`} position={[x + w / 2, y + 0.018 + i * 0.032, 0.26]} castShadow>
            <boxGeometry args={[w, 0.03, 0.19]} />
            <primitive object={M.books[Math.floor(rnd() * 6)]} attach="material" />
          </mesh>,
        );
      }
      x += w + 0.07;
    } else if (roll < 0.84) {
      // A ceramic vase.
      const tall = rnd() < 0.5;
      const r = tall ? 0.055 : 0.085;
      const vh = Math.min(height - 0.08, tall ? 0.3 : 0.17);
      items.push(
        <mesh key={`v${n}`} position={[x + r + 0.02, y + vh / 2, 0.26]} castShadow>
          <cylinderGeometry args={[r * 0.72, r, vh, 18]} />
          <primitive object={rnd() < 0.5 ? M.ceramic : M.ceramicDark} attach="material" />
        </mesh>,
      );
      x += r * 2 + 0.08;
    } else if (roll < 0.93) {
      // A globe on a ring stand, as the reference has.
      const r = Math.min(0.1, (height - 0.1) / 2.4);
      items.push(
        <group key={`g${n}`} position={[x + r + 0.03, y, 0.26]}>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[r * 0.5, r * 0.62, 0.035, 16]} />
            <primitive object={M.brushed} attach="material" />
          </mesh>
          <mesh position={[0, r + 0.06, 0]} rotation={[0, 0, 0.3]} castShadow>
            <torusGeometry args={[r * 1.12, 0.008, 8, 28]} />
            <primitive object={M.brushed} attach="material" />
          </mesh>
          <mesh position={[0, r + 0.06, 0]} castShadow>
            <sphereGeometry args={[r, 20, 16]} />
            <primitive object={M.ceramicDark} attach="material" />
          </mesh>
        </group>,
      );
      x += r * 2 + 0.1;
    } else {
      // An abstract object, for silhouette.
      const h2 = Math.min(height - 0.08, 0.2 + rnd() * 0.08);
      items.push(
        <mesh
          key={`o${n}`}
          position={[x + 0.07, y + h2 / 2, 0.26]}
          rotation={[0, rnd() * 0.8, 0]}
          castShadow
        >
          <boxGeometry args={[0.1, h2, 0.1]} />
          <primitive object={M.brushed} attach="material" />
        </mesh>,
      );
      x += 0.17;
    }
    n += 1;
  }

  return <group>{items}</group>;
}

function FeatureWall({ screens }: { screens: number }) {
  const p = CX_PLAN;
  /** Warm figured stone with strong veining, as the reference has. The cool
      grey slab read as a blank panel between two bookcases. */


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
        <primitive object={M.stone} attach="material" />
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
        const bottom = unit.bottom;
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
            {Array.from({ length: unit.bays }, (_, bi) => (
              <BayContents
                key={`bay${bi}`}
                x0={unit.x0}
                x1={unit.x1}
                y={bottom + pitch * bi + 0.022}
                height={pitch}
                seed={u * 11 + bi * 7}
                closed={bi === 0}
              />
            ))}
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
            emissiveIntensity={1.1 * screens}
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
          <meshStandardMaterial color="#8d8579" roughness={0.85} />
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
  const slats = useMemo(() => makeBlindTexture(), []);

  return (
    <group>
      {/**
       * The city, well outside the building.
       *
       * It was 0.7 m behind the glass on a 13 m plane, which is a mural: the
       * towers sat at arm's length and moved with the camera like wallpaper.
       * At 18 m on a 46 m plane the parallax is right and the skyline reads as
       * distance rather than as a backdrop.
       */}
      <mesh position={[-18, (win.y0 + win.y1) / 2 + 1.2, (win.z0 + win.z1) / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[46, 22]} />
        <meshBasicMaterial map={view} toneMapped={false} />
      </mesh>
      <mesh position={[0.02, (win.y0 + win.y1) / 2, (win.z0 + win.z1) / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[span, height]} />
        <primitive object={M.glass} attach="material" />
      </mesh>

      {/* Thin dark mullions, head and sill. */}
      {Array.from({ length: bays + 1 }, (_, i) => (
        <mesh key={`m${i}`} position={[0.03, (win.y0 + win.y1) / 2, win.z0 + bay * i]}>
          <boxGeometry args={[0.07, height, 0.05]} />
          <primitive object={M.matteBlack} attach="material" />
        </mesh>
      ))}
      {([win.y0, win.y1] as const).map((y, i) => (
        <mesh key={`t${i}`} position={[0.03, y, (win.z0 + win.z1) / 2]}>
          <boxGeometry args={[0.07, 0.07, span]} />
          <primitive object={M.matteBlack} attach="material" />
        </mesh>
      ))}

      {/* Blind cassettes. */}
      {Array.from({ length: bays }, (_, i) => (
        <mesh key={`c${i}`} position={[0.13, win.y1 - 0.05, win.z0 + bay * (i + 0.5)]}>
          <boxGeometry args={[0.11, 0.1, bay - 0.08]} />
          <primitive object={M.matteBlack} attach="material" />
        </mesh>
      ))}

      {/**
       * Venetian blinds on the sheer channel, drapes on the blackout channel.
       *
       * Both are driven by the existing curtain device — the brief is explicit
       * that nothing should grow a parallel system, and a shade already has
       * exactly two layers. The venetian lowers from the head; the drapes stack
       * at the two ends of the track.
       *
       * The slats are a striped texture rather than geometry. Thirty slats
       * across five bays is a hundred and fifty boxes for something read at
       * four metres through glass, and the picture is the same for one draw
       * call — which matters in a room already carrying sixteen lights.
       */}
      {sheer > 0.4 &&
        Array.from({ length: bays }, (_, i) => {
          const drop = height * (sheer / 100);
          return (
            <mesh
              key={`b${i}`}
              position={[0.1, win.y1 - drop / 2, win.z0 + bay * (i + 0.5)]}
              rotation={[0, Math.PI / 2, 0]}
            >
              <planeGeometry args={[bay - 0.1, drop]} />
              <meshStandardMaterial
                map={slats}
                map-repeat-y={Math.max(1, Math.round(drop * 14))}
                roughness={0.78}
                side={THREE.DoubleSide}
              />
            </mesh>
          );
        })}

      {/* Heavy drapes, stacked at the ends of the track. */}
      {Array.from({ length: 4 }, (_, i) => {
        const closed = Math.min(Math.max(blackout / 100, 0), 1);
        const toStart = i < 2;
        const seg = span / 4;
        const drawn = toStart
          ? win.z0 + i * seg
          : win.z0 + (i + 1) * seg;
        const parked = toStart ? win.z0 + i * 0.16 : win.z1 - (3 - i) * 0.16;
        const z = parked + (drawn - parked) * closed;
        return (
          <mesh
            key={`d${i}`}
            geometry={makeCurtainGeometry({
              length: seg + 0.08,
              height,
              folds: 9,
              foldDepth: 0.11,
              gather: 1 - closed,
            })}
            material={M.drape}
            position={[0.3, win.y0, z]}
            scale={[1, 1, toStart ? 1 : -1]}
            castShadow={closed > 0.5}
          />
        );
      })}
      {/* Curtain track. */}
      <mesh position={[0.3, win.y1 + 0.08, (win.z0 + win.z1) / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.022, 0.022, span + 0.2, 8]} />
        <primitive object={M.matteBlack} attach="material" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Desk and seating                                                    */
/* ------------------------------------------------------------------ */

function Desk({ screens }: { screens: number }) {
  const d = CX_PLAN.desk;
  /** Dark stone, not the pale slab it was. The brief asks for walnut and stone
      with restraint, and a white marble desk is the single most hotel-like
      object you can put in an office. */

  return (
    <group position={[d.x, 0, d.z]}>
      <RoundedBox args={[d.w, 0.085, d.d]} radius={0.015} smoothness={3} position={[0, d.h, 0]} castShadow receiveShadow>
        <primitive object={M.deskTop} attach="material" />
      </RoundedBox>
      {/* Marble waterfall ends, both sides. */}
      {([-1, 1] as const).map((sgn) => (
        <mesh key={sgn} position={[sgn * (d.w / 2 - 0.1), (d.h - 0.1) / 2 + 0.1, 0]} castShadow>
          <boxGeometry args={[0.2, d.h - 0.1, d.d - 0.08]} />
          <primitive object={M.deskTop} attach="material" />
        </mesh>
      ))}
      {/* Timber body on a recessed plinth that the strip lights. */}
      <mesh position={[0, (d.h - 0.06) / 2 + 0.06, -0.06]} castShadow>
        <boxGeometry args={[d.w - 0.9, d.h - 0.12, d.d - 0.28]} />
        <primitive object={M.walnut} attach="material" />
      </mesh>
      <mesh position={[0, 0.05, -0.06]}>
        <boxGeometry args={[d.w - 1.2, 0.1, d.d - 0.42]} />
        <primitive object={M.walnutDark} attach="material" />
      </mesh>

      {/* No monitor. It was specified, then asked for again as removed — and
          it was standing directly in front of the executive chair from this
          viewpoint, which is the better argument of the two. The laptop and
          the grommet carry the workstation on their own. */}
      {/* Laptop, open, beside it. */}
      <group position={[-0.32, d.h + 0.045, -0.12]}>
        <mesh>
          <boxGeometry args={[0.36, 0.012, 0.25]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
        <mesh position={[0, 0.112, -0.125]} rotation={[-0.32, 0, 0]}>
          <boxGeometry args={[0.36, 0.235, 0.01]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
        <mesh position={[0, 0.11, -0.119]} rotation={[-0.32, 0, 0]}>
          <planeGeometry args={[0.335, 0.21]} />
          {/**
           * Under the bloom threshold, deliberately.
           *
           * The composer blooms anything over 1.08, and this screen was at 1.2
           * with tone mapping off — so it went into the bloom pass at full
           * value and threw a halo across the desk behind it. That halo was
           * the "messed up lighting on the table": not a light at all, and
           * which is why changing the lamp and then the desk material moved
           * the measurement by nothing both times.
           *
           * A laptop screen is a small dim object. It has no business blooming.
           */}
          {/**
           * The laptop follows the room, like every other emitter in it.
           *
           * It was a fixed value on static geometry, so in Leave — everything
           * off, the room near black — a bright blue rectangle sat on the desk
           * at a mean of 71/255. An emissive that no channel can reach is a
           * light nobody can switch off.
           */}
          <meshStandardMaterial
            color="#000000"
            emissive={new THREE.Color("#5b7ba8")}
            emissiveIntensity={0.9 * screens}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* Cable grommet, a document set, and nothing else. */}
      <mesh position={[0.05, d.h + 0.046, -0.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.032, 0.046, 20]} />
        <primitive object={M.matteBlack} attach="material" />
      </mesh>
      <mesh position={[-0.95, d.h + 0.046, 0.06]} rotation={[-Math.PI / 2, 0, 0.1]}>
        <planeGeometry args={[0.3, 0.4]} />
        <primitive object={M.paper} attach="material" />
      </mesh>
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
 * The executive zone floor, and the lounge in front of it.
 *
 * A low sectional along the glazing with a round stone table, as the client's
 * reference has. The earlier version of this was a four-seat meeting table,
 * which read as a boardroom; the version before that was an oversized sofa
 * filling the foreground, which read as a living room. The difference is scale
 * and placement — a seating group set back along the window is what an
 * executive cabin actually has.
 */
function Lounge() {
  const p = CX_PLAN;


  return (
    <group>
      {/* Commercial carpet under the executive zone, plain. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[p.carpet.x, 0.004, p.carpet.z]} receiveShadow>
        <planeGeometry args={[p.carpet.w, p.carpet.d]} />
        <primitive object={M.carpet} attach="material" />
      </mesh>

      {/* Sectional along the glazing, facing into the room. */}
      <group position={[p.sofa.x, 0, p.sofa.z]} rotation={[0, Math.PI / 2, 0]}>
        <RoundedBox args={[p.sofa.len, 0.3, 0.94]} radius={0.07} smoothness={3} position={[0, 0.3, 0]} castShadow receiveShadow>
          <primitive object={M.sofa} attach="material" />
        </RoundedBox>
        <RoundedBox args={[p.sofa.len, 0.52, 0.24]} radius={0.07} smoothness={3} position={[0, 0.58, -0.35]} castShadow>
          <primitive object={M.sofa} attach="material" />
        </RoundedBox>
        {([-1, 1] as const).map((sgn) => (
          <RoundedBox
            key={sgn}
            args={[0.24, 0.44, 0.94]}
            radius={0.07}
            smoothness={3}
            position={[(sgn * (p.sofa.len - 0.24)) / 2, 0.46, 0]}
            castShadow
          >
            <primitive object={M.sofa} attach="material" />
          </RoundedBox>
        ))}
        {[-0.95, -0.32, 0.32, 0.95].map((cx, i) => (
          <RoundedBox
            key={cx}
            args={[0.4, 0.4, 0.14]}
            radius={0.06}
            smoothness={3}
            position={[cx, 0.62, -0.21]}
            rotation={[0.24, 0, i % 2 ? 0.1 : -0.08]}
            castShadow
          >
            <primitive object={i % 2 ? M.cushion : M.sofa} attach="material" />
          </RoundedBox>
        ))}
      </group>

      {/* Round stone coffee table. */}
      <group position={[p.coffee.x, 0, p.coffee.z]}>
        <mesh position={[0, 0.15, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.34, 0.3, 24]} />
          <primitive object={M.stone} attach="material" />
        </mesh>
        <mesh position={[0, 0.32, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.44, 0.44, 0.045, 28]} />
          <primitive object={M.stone} attach="material" />
        </mesh>
        {[0, 1].map((i) => (
          <mesh key={i} position={[-0.05 + i * 0.02, 0.35 + i * 0.022, 0.02]} rotation={[-Math.PI / 2, 0, 0.3 + i * 0.4]}>
            <planeGeometry args={[0.26, 0.19]} />
            <primitive object={M.paper} attach="material" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * Architectural planting: two slim specimens, not two trees.
 *
 * These were 0.7 m pots carrying two-metre canopies, and at this camera one of
 * them filled a quarter of the frame and buried the desk behind it. A planter
 * in an executive office is a tall narrow pot with a slender plant in it — it
 * punctuates a corner, it does not occupy one.
 */
function Plants() {
  return (
    <group>
      {CX_PLAN.plants.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} scale={p.s}>
          {/* Tall, narrow, matte black. */}
          <mesh position={[0, 0.28, 0]} castShadow>
            <cylinderGeometry args={[0.17, 0.14, 0.56, 18]} />
            <primitive object={M.planter} attach="material" />
          </mesh>
          {/* A slender stem with a few leaf clusters up it. */}
          {[
            [0.0, 0.78, 0.0, 0.14],
            [0.11, 1.02, 0.05, 0.12],
            [-0.09, 1.2, -0.07, 0.115],
            [0.06, 1.38, 0.08, 0.1],
            [-0.05, 1.54, -0.04, 0.085],
          ].map(([x, y, z, r], j) => (
            <mesh key={j} position={[x, y, z]} castShadow>
              <icosahedronGeometry args={[r, 1]} />
              <primitive object={M.foliage} attach="material" />
            </mesh>
          ))}
          <mesh position={[0, 0.95, 0]}>
            <cylinderGeometry args={[0.012, 0.016, 0.8, 8]} />
            <meshStandardMaterial color="#3d4a32" roughness={0.9} />
          </mesh>
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
        <boxGeometry args={[p.pendant.len, 0.1, 0.13]} />
        <primitive object={M.walnutDark} attach="material" />
      </mesh>
      {([-1, 1] as const).map((s) => (
        <mesh key={s} position={[p.pendant.x + s * (p.pendant.len / 2 - 0.3), (p.pendant.y + CX.h) / 2 + 0.05, p.pendant.z]}>
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

/**
 * Writes the scanned maps onto the room's materials, once.
 *
 * A component rather than a hook in `CxoCabin3D`, so the Suspense the textures
 * throw is caught below the room: the lights and the geometry keep rendering
 * while the images arrive and the surfaces fill in, instead of the whole room
 * unmounting and flashing.
 */
function Surfaces() {
  const floor = useTextureSet("floor", [6.5, 9]);
  const walnut = useTextureSet("walnut", [3, 2.2]);
  const stone = useTextureSet("stone", [1, 1]);
  const carpet = useTextureSet("carpet", [7, 6]);
  const leather = useTextureSet("leather", [3, 3]);

  useLayoutEffect(() => {
    applySet(M.floor, floor, { normalScale: 0.75, envMapIntensity: 0.5 });
    applySet(M.walnut, walnut, { normalScale: 0.6, envMapIntensity: 0.7 });
    applySet(M.walnutDark, walnut, { normalScale: 0.5, envMapIntensity: 0.3 });
    applySet(M.stone, stone, { normalScale: 0.4, envMapIntensity: 1.1 });
    applySet(M.deskTop, stone, { normalScale: 0.35, envMapIntensity: 1.2 });
    applySet(M.carpet, carpet, { normalScale: 1.2, envMapIntensity: 0.2 });
    applySet(M.leather, leather, { normalScale: 0.8, envMapIntensity: 0.6 });
    applySet(M.execLeather, leather, { normalScale: 0.8, envMapIntensity: 0.6 });
    applySet(M.sofa, carpet, { normalScale: 1.1, envMapIntensity: 0.25 });
    applySet(M.cushion, carpet, { normalScale: 1.1, envMapIntensity: 0.25 });
  }, [floor, walnut, stone, carpet, leather]);

  return null;
}

export function CxoCabin3D({
  curtains,
  view,
  screens,
}: {
  curtains: CxoCurtains;
  view: THREE.Texture;
  /**
   * How awake the room's screens are, 0..1.
   *
   * Derived in the stage from the desk-zone channels, because a laptop and a
   * wall control plate are on when somebody is working and off when the room
   * stands down — and there is no AV channel in this space to hang them on.
   */
  screens: number;
}) {
  return (
    <group>
      <Surfaces />
      <Shell />
      <FeatureWall screens={screens} />
      <Glazing sheer={curtains.sheer} blackout={curtains.blackout} view={view} />
      <Desk screens={screens} />
      {/* The executive backs onto the glazing and faces the room; the
          visitors face back at the desk. A chair's back sits at its own local
          -z, so facing +x is a quarter turn one way and -x the other. */}
      {/* The executive faces the room; the visitors face back at the desk. A
          chair's back sits at its own local -z, so rotation 0 faces +z. */}
      <Chair x={CX_PLAN.execChair.x} z={CX_PLAN.execChair.z} rotation={0} exec />
      {CX_PLAN.visitors.map((v, i) => (
        <Chair key={i} x={v.x} z={v.z} rotation={Math.PI} />
      ))}
      <Lounge />
      <Plants />
      <AirDiffuser />
      <Housings />
    </group>
  );
}
