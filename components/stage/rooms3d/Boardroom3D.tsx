"use client";

/**
 * Commercial Office — Boardroom, geometry only.
 *
 * Built to the client's boardroom sheet. Laid out as a one-point room looking
 * down the length of the table: the screen wall square ahead, the glazed façade
 * down the left with its blinds, the timber feature wall down the right.
 *
 *              z = 0   +---------------------------+
 *   glazing            |  display, screen, speakers |
 *   and blinds         |                            |  slat wall
 *   x = 0              |      the long table        |  x = BR.w
 *                      |                            |
 *                      +-------------^--------------+
 *                                camera, high z
 *
 * That arrangement is forced by the scenes rather than chosen: the blinds
 * coming down is stage one of the headline demonstration and the screen
 * descending is stage four, so both walls have to be in frame at once.
 *
 * Coordinates in metres.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { makeCityTexture, makeScreenTexture, type ScreenContent } from "./geometry";

export const BR = {
  /** Across the room. The timber wall is at x = w, the glazing at x = 0. */
  w: 7.4,
  /** Away from the camera. The screen wall is at z = 0. */
  d: 11.6,
  h: 3.2,
  /** Perimeter coffer: the cove sits on top of this and washes the ceiling. */
  soffit: { depth: 0.62, drop: 0.22 },
} as const;

export const BR_COVE_Y = BR.h - BR.soffit.drop + 0.03;

/** Glazed opening in the x = 0 wall, behind the blinds. */
export const BR_WINDOW = { z0: 1.1, z1: 10.5, y0: 0.12, y1: BR.h - 0.42 };

export const BR_PLAN = {
  /**
   * The wall display, and the projection screen that drops in front of it.
   *
   * Both are real and both are in the sheet. Stowed, you see the display —
   * which is what a video call uses. Deployed, the fabric covers it and the
   * projector takes over. `y1` is the head, where the roller sits, and `drop`
   * is how far the fabric travels; the engine animates that from the device's
   * `screen` value at the motor's own speed.
   */
  display: { x: 3.7, w: 3.4, h: 1.91, cy: 1.62 },
  screen: { x: 3.7, w: 3.84, y1: 2.82, drop: 2.25 },
  /** Column speakers either side of the display. */
  speakers: [{ x: 1.2 }, { x: 6.2 }],
  /** Low credenza under the display. */
  credenza: { x: 3.7, w: 5.0, d: 0.48, h: 0.46 },
  /** Ceiling-mounted projector, throwing at the screen. */
  projector: { x: 3.7, z: 4.4, y: 2.96 },

  /** The table: 5.9 m long, on the room's axis. */
  table: { x: 3.7, z0: 2.3, z1: 8.2, w: 1.72, h: 0.745 },
  /** Six places a side plus a chair at each end. */
  seatsPerSide: 6,

  /** Suspended linear luminaire, on axis above the table. */
  /**
   * Suspended linear, on axis above the table.
   *
   * Stops 3.5 m short of the screen wall and hangs at 2.44: any lower or any
   * longer and it crosses the screen from the room's viewpoint, which is the
   * one thing a boardroom pendant must never do.
   */
  pendant: { x: 3.7, z0: 3.5, z1: 8.0, y: 2.44 },

  /** General downlights: two rows down the room. */
  generalRows: [1.35, 6.05],
  generalZ: [2.3, 3.9, 5.5, 7.1, 8.7, 10.3],
  /** Narrow-beam heads on the table, inboard of the general grid. */
  tableHeads: { rows: [2.72, 4.68], z: [3.5, 5.3, 7.1, 8.3] },
  /** The row nearest the screen, separately circuited. */
  frontZ: 1.05,
  frontX: [1.35, 2.78, 4.62, 6.05],
  /** Forward wash above the display, aimed back at the faces. */
  vc: { x: 3.7, w: 4.2, y: 2.88, z: 0.52 },

  /** Timber batten wall on the right, with the wordmark panel in it. */
  slats: { z0: 1.4, z1: 9.4 },
  words: { z: 2.9, cy: 1.72, h: 1.9 },
  /** Dark panel on the glazing pier, nearest the screen. */
  statement: { z: 1.0, cy: 1.7, h: 1.6 },
  /** Planters in the corners. */
  plants: [
    { x: 0.72, z: 1.0 },
    { x: 6.72, z: 10.6 },
    { x: 0.8, z: 10.5 },
  ],
} as const;

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

/**
 * Considerably lighter than the den, and deliberately so.
 *
 * A boardroom is a daylight room working to 400-500 lux, and the den's charcoal
 * would have eaten most of it — that room returns about 10 per cent of the
 * light that lands on its walls. These sit near 55 per cent, which is what an
 * office actually specifies, and it is why this room can run at a third of its
 * connected load on a bright morning and still read as bright.
 *
 * The floor is the exception: a dark honed porcelain, as on the sheet. It costs
 * some bounce and earns it back by giving the pendant and the cove something to
 * reflect in, which is what stops ten metres of floor reading as paper.
 */
const M = {
  ceiling: new THREE.MeshStandardMaterial({ color: "#d3cec5", roughness: 0.96 }),
  soffit: new THREE.MeshStandardMaterial({ color: "#c7c1b7", roughness: 0.92 }),
  wall: new THREE.MeshStandardMaterial({ color: "#bab3a7", roughness: 0.93 }),
  /** The screen wall. Darker, so the display has something to sit against. */
  screenWall: new THREE.MeshStandardMaterial({ color: "#5d564e", roughness: 0.9 }),
  floor: new THREE.MeshPhysicalMaterial({
    // Honed dark porcelain, as on the sheet. At #6a645e it read as white paper
    // under this much daylight and took the floor's reflections with it.
    color: "#45413d",
    roughness: 0.3,
    metalness: 0.02,
    clearcoat: 0.6,
    clearcoatRoughness: 0.24,
  }),
  /** American walnut, satin. The table and the batten wall share it. */
  timber: new THREE.MeshStandardMaterial({ color: "#6a5038", roughness: 0.46 }),
  timberDark: new THREE.MeshStandardMaterial({ color: "#3d2e21", roughness: 0.8 }),
  tableTop: new THREE.MeshPhysicalMaterial({
    // Dark walnut. The lighter value read as orange laminate, and a boardroom
    // table is the one surface in here nobody will forgive.
    color: "#43301f",
    // Satin, not mirror. At 0.22/0.12 the table reflected the screen almost
    // specularly, so a lit screen laid a hard bright sheet across its far half.
    // Spreading the highlight keeps the pendant's streak — which is most of why
    // the table photographs well — and turns the screen's reflection into a
    // sheen instead of an image.
    roughness: 0.34,
    metalness: 0.02,
    clearcoat: 0.6,
    clearcoatRoughness: 0.26,
  }),
  /** Tan leather, as on the sheet. Sheen, or it shades like painted board. */
  leather: new THREE.MeshPhysicalMaterial({
    color: "#8a7357",
    roughness: 0.62,
    metalness: 0,
    sheen: 0.7,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color("#d8c3a4"),
  }),
  metal: new THREE.MeshStandardMaterial({
    color: "#2e3237",
    roughness: 0.34,
    metalness: 0.82,
  }),
  chrome: new THREE.MeshStandardMaterial({
    color: "#b9bcc0",
    roughness: 0.18,
    metalness: 0.95,
  }),
  housing: new THREE.MeshStandardMaterial({ color: "#23262a", roughness: 0.52 }),
  /**
   * Solar-filter roller.
   *
   * Plain alpha, deliberately not `transmission`. A transmissive material makes
   * three.js render the entire scene a second time into a transmission buffer,
   * and with the blinds down that halved the frame rate on its own — Video
   * Conference, the one scene that lowers them, measured 5.6 fps against 39 for
   * the same room with them up.
   *
   * Against a bright window seen from inside a lit room the difference is not
   * visible: both give a pale screen with the skyline reading through it. One
   * costs an extra full-scene pass and the other costs nothing.
   */
  blindSheer: new THREE.MeshStandardMaterial({
    color: "#cfc8bb",
    roughness: 0.78,
    transparent: true,
    opacity: 0.56,
    side: THREE.DoubleSide,
  }),
  /** Blackout roller. Opaque, because that is the entire product. */
  blindBlackout: new THREE.MeshStandardMaterial({
    color: "#4a4540",
    roughness: 0.92,
    side: THREE.DoubleSide,
  }),
  glass: new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: 0.04,
    transparent: true,
    opacity: 0.07,
    side: THREE.DoubleSide,
  }),
  foliage: new THREE.MeshStandardMaterial({ color: "#3f5a39", roughness: 0.88 }),
  planter: new THREE.MeshStandardMaterial({ color: "#2b2d2f", roughness: 0.6 }),
};

/* ------------------------------------------------------------------ */
/* Wordmark panel                                                      */
/* ------------------------------------------------------------------ */

/**
 * The stacked wordmark on the timber wall.
 *
 * Canvas rather than geometry because it is four words — and because at this
 * distance a texture is indistinguishable from cut letters, while costing one
 * draw call instead of a few hundred.
 */
function makeWordsTexture(lines: string[], bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const step = c.height / (lines.length + 1);
  lines.forEach((line, i) => {
    g.font = "600 34px system-ui, sans-serif";
    g.letterSpacing = "6px";
    g.fillText(line, c.width / 2, step * (i + 1));
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

function Shell() {
  const { w, d, h, soffit } = BR;
  const inner = { x0: soffit.depth, x1: w - soffit.depth, z0: soffit.depth, z1: d - soffit.depth };

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[w / 2, 0, d / 2]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <primitive object={M.floor} attach="material" />
      </mesh>

      {/* Raised ceiling inside the coffer. */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[w / 2, h, d / 2]}>
        <planeGeometry args={[w, d]} />
        <primitive object={M.ceiling} attach="material" />
      </mesh>

      {/* Perimeter soffit: a dropped band all the way round, with the cove
          sitting on its upper face. Four quads rather than a ring because the
          strip inside it is addressed as four runs too. */}
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

      {/* Inner face of the coffer, so the drop reads as a real step. */}
      {([
        [w / 2, inner.z0, 0, w],
        [w / 2, inner.z1, Math.PI, w],
        [inner.x0, d / 2, Math.PI / 2, d - soffit.depth * 2],
        [inner.x1, d / 2, -Math.PI / 2, d - soffit.depth * 2],
      ] as const).map(([cx, cz, ry, len], i) => (
        <mesh key={i} position={[cx, h - soffit.drop / 2, cz]} rotation={[0, ry, 0]}>
          <planeGeometry args={[len, soffit.drop]} />
          <primitive object={M.soffit} attach="material" />
        </mesh>
      ))}

      {/* Screen wall, z = 0. */}
      <mesh position={[w / 2, h / 2, 0]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <primitive object={M.screenWall} attach="material" />
      </mesh>
      {/* Back wall, behind the camera. */}
      <mesh position={[w / 2, h / 2, d]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      {/* Glazing pier below and above the opening — the wall exists where the
          glass does not, or the city shows through a solid wall. */}
      <mesh position={[0, BR_WINDOW.y0 / 2, d / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[d, BR_WINDOW.y0]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      <mesh
        position={[0, (BR_WINDOW.y1 + h) / 2, d / 2]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[d, h - BR_WINDOW.y1]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      {([
        [BR_WINDOW.z0 / 2, BR_WINDOW.z0],
        [(BR_WINDOW.z1 + d) / 2, d - BR_WINDOW.z1],
      ] as const).map(([cz, len], i) => (
        <mesh key={i} position={[0, h / 2, cz]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[len, h]} />
          <primitive object={M.wall} attach="material" />
        </mesh>
      ))}

      <mesh position={[w, h / 2, d / 2]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>

      {/* Skirting, all four sides. Cheap, and its absence is the thing that
          makes an interior read as a box rather than a room. */}
      {([
        [w / 2, 0.05, w, 0.03, 0],
        [w / 2, d - 0.05, w, 0.03, 0],
        [0.05, d / 2, 0.03, d, 0],
        [w - 0.05, d / 2, 0.03, d, 0],
      ] as const).map(([cx, cz, sx, sz], i) => (
        <mesh key={i} position={[cx, 0.055, cz]}>
          <boxGeometry args={[sx, 0.11, sz]} />
          <primitive object={M.timberDark} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Timber feature wall                                                 */
/* ------------------------------------------------------------------ */

const BATTEN = { w: 0.055, d: 0.03, gap: 0.035 };

function SlatWall() {
  const { z0, z1 } = BR_PLAN.slats;
  const words = BR_PLAN.words;
  const texture = useMemo(
    () => makeWordsTexture(["PEOPLE", "IDEAS", "SPACES", "PROGRESS"], "#2a2019", "#c9b48f"),
    [],
  );

  // Battens stop short of the wordmark panel rather than running behind it.
  const gapStart = words.z - 0.95;
  const gapEnd = words.z + 0.95;
  const pitch = BATTEN.w + BATTEN.gap;
  const count = Math.floor((z1 - z0) / pitch);

  return (
    <group>
      {/* Dark backing, so the gaps between battens read as shadow. */}
      <mesh position={[BR.w - 0.016, BR.h / 2, (z0 + z1) / 2]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[z1 - z0, BR.h - 0.11]} />
        <primitive object={M.timberDark} attach="material" />
      </mesh>

      {Array.from({ length: count }, (_, i) => {
        const z = z0 + pitch * (i + 0.5);
        if (z > gapStart && z < gapEnd) return null;
        return (
          <mesh key={i} position={[BR.w - 0.016 - BATTEN.d / 2, BR.h / 2, z]} castShadow>
            <boxGeometry args={[BATTEN.d, BR.h - 0.14, BATTEN.w]} />
            <primitive object={M.timber} attach="material" />
          </mesh>
        );
      })}

      {/* The stacked wordmark. */}
      <mesh position={[BR.w - 0.05, words.cy, words.z]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[1.5, words.h]} />
        <meshStandardMaterial map={texture} roughness={0.85} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Glazing and blinds                                                  */
/* ------------------------------------------------------------------ */

const BAYS = 5;

export interface BoardroomBlinds {
  sheer: number;
  blackout: number;
}

function Glazing({ sheer, blackout, view }: BoardroomBlinds & { view: THREE.Texture }) {
  const win = BR_WINDOW;
  const height = win.y1 - win.y0;
  const span = win.z1 - win.z0;
  const bay = span / BAYS;

  return (
    <group>
      {/* The city, a little outside the glass. */}
      <mesh position={[-0.42, (win.y0 + win.y1) / 2, (win.z0 + win.z1) / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[span * 1.5, height * 1.5]} />
        <meshBasicMaterial map={view} toneMapped={false} />
      </mesh>

      <mesh position={[0.02, (win.y0 + win.y1) / 2, (win.z0 + win.z1) / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[span, height]} />
        <primitive object={M.glass} attach="material" />
      </mesh>

      {/* Mullions. */}
      {Array.from({ length: BAYS + 1 }, (_, i) => (
        <mesh key={`m${i}`} position={[0.03, (win.y0 + win.y1) / 2, win.z0 + bay * i]}>
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

      {/* Roller cassettes, one pair per bay. */}
      {Array.from({ length: BAYS }, (_, i) => (
        <mesh key={`c${i}`} position={[0.11, win.y1 + 0.03, win.z0 + bay * (i + 0.5)]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.055, 0.055, bay - 0.08, 10]} />
          <primitive object={M.housing} attach="material" />
        </mesh>
      ))}

      {/**
       * Two rollers per bay, dropping from the head.
       *
       * A roller is the honest geometry here rather than the residential
       * rooms' gathered fabric: it scales in Y from the top, which is exactly
       * what the device's 0-100 means, and a boardroom blind has no folds to
       * draw. The solar filter hangs just inboard of the blackout so both are
       * visible at partial deployment, which is what Video Conference asks for.
       */}
      {([
        { pos: blackout, y: 0.07, mat: M.blindBlackout, key: "bo" },
        { pos: sheer, y: 0.13, mat: M.blindSheer, key: "sh" },
      ] as const).map(({ pos, y, mat, key }) =>
        pos <= 0.4 ? null : (
          <group key={key}>
            {Array.from({ length: BAYS }, (_, i) => {
              const drop = height * (pos / 100);
              return (
                <mesh
                  key={i}
                  position={[y, win.y1 - drop / 2, win.z0 + bay * (i + 0.5)]}
                  rotation={[0, Math.PI / 2, 0]}
                >
                  <planeGeometry args={[bay - 0.09, drop]} />
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
/* Screen wall                                                         */
/* ------------------------------------------------------------------ */

/**
 * Emissive gain per content type.
 *
 * A presentation is a white slide deck and will clip to a flat rectangle if it
 * is driven as hard as a film — the den taught that twice. The conference feed
 * sits between the two.
 */
const SCREEN_EMISSIVE: Record<ScreenContent, number> = {
  // Brighter than the den's 0.34. That figure is right for a projector in a
  // charcoal room; here it left the screen reading as a grey panel while the
  // light it supposedly threw blew out the end of the table.
  presentation: 0.62,
  // A video call is a lit room on a screen — brighter than a slide deck, well
  // short of a film.
  conference: 0.7,
  desktop: 0.6,
  streaming: 0.9,
  game: 0.8,
};

/**
 * How fast a surface comes up and goes down, in milliseconds.
 *
 * A projector lamp strikes over a second or so and cools more slowly than it
 * lights; a panel wakes almost at once. Both used to be booleans, so every
 * change of scene snapped a large bright rectangle on or off in a single frame,
 * which is most of what made switching modes feel abrupt.
 */
const RAMP = {
  lampUp: 1300,
  lampDown: 800,
  panelUp: 450,
  panelDown: 350,
} as const;

function approach(ref: { current: number }, on: boolean, upMs: number, downMs: number, dt: number) {
  const target = on ? 1 : 0;
  const delta = target - ref.current;
  if (delta === 0) return;
  const step = (dt * 1000) / (delta > 0 ? upMs : downMs);
  ref.current += Math.sign(delta) * Math.min(step, Math.abs(delta));
}

function ScreenWall({
  screen,
  displayOn,
  projectorOn,
  content,
}: {
  screen: number;
  /** The wall panel is awake. */
  displayOn: boolean;
  /** The projector is running, so the fabric carries an image. */
  projectorOn: boolean;
  content: ScreenContent;
}) {
  const plan = BR_PLAN;
  const picture = useMemo(() => makeScreenTexture(content), [content]);
  const deployed = Math.min(Math.max(screen / 100, 0), 1);
  const drop = plan.screen.drop * deployed;
  /**
   * There is only a picture when the screen is all the way down.
   *
   * A position guard, not a timing one. Ramping the lamp was not enough on its
   * own: any path where the projector is lit while the fabric is moving put the
   * image on a part-height screen, squashed to fit it. Retracting was the
   * obvious one — leaving the scene kills the lamp in under a second while the
   * motor takes six — but a slow frame during the descent would do it too.
   *
   * A projector throwing a picture at a half-unrolled screen is wrong in every
   * direction, so the image simply does not exist until the screen is seated.
   */
  const seated = deployed > 0.985;

  /**
   * Each surface is two planes, not one material that switches.
   *
   * The backing is the physical object — white vinyl on the screen, black glass
   * on the panel — lit by the room like anything else. The image sits a
   * millimetre in front of it, emissive only and untouched by tone mapping, and
   * its intensity ramps from nothing.
   *
   * That split is what lets the screen descend *empty* and the picture arrive
   * afterwards when the projector strikes, which is the order it happens in.
   * One material carrying both meant the fabric either had an image on it from
   * the first frame of its travel or was a black rectangle.
   */
  const projected = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#000000"),
        emissive: new THREE.Color("#ffffff"),
        emissiveIntensity: 0,
        roughness: 0.5,
        transparent: true,
        toneMapped: false,
      }),
    [],
  );
  const panelImage = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#000000"),
        emissive: new THREE.Color("#ffffff"),
        emissiveIntensity: 0,
        roughness: 0.4,
        transparent: true,
        toneMapped: false,
      }),
    [],
  );

  const lamp = useRef(projectorOn ? 1 : 0);
  const panelGlow = useRef(displayOn ? 1 : 0);

  useLayoutEffect(() => {
    for (const m of [projected, panelImage]) {
      m.emissiveMap = picture;
      m.needsUpdate = true;
    }
    /**
     * A change of source blanks the surface and brings it back, the way a real
     * display does while it re-syncs.
     *
     * Without it the picture cut from a slide deck to a video call in a single
     * frame while every other thing in the room faded around it — which is a
     * good part of what made switching modes feel abrupt.
     */
    lamp.current = 0;
    panelGlow.current = 0;
  }, [projected, panelImage, picture]);

  useFrame((_, dt) => {
    approach(lamp, projectorOn && seated, RAMP.lampUp, RAMP.lampDown, dt);
    approach(panelGlow, displayOn, RAMP.panelUp, RAMP.panelDown, dt);
    const gain = SCREEN_EMISSIVE[content];
    projected.emissiveIntensity = gain * lamp.current;
    projected.opacity = lamp.current;
    panelImage.emissiveIntensity = gain * panelGlow.current;
    panelImage.opacity = panelGlow.current;
  });

  return (
    <group>
      {/* Recessed niche, so the display sits in the wall rather than on it. */}
      <mesh position={[plan.display.x, plan.display.cy, 0.012]}>
        <planeGeometry args={[plan.display.w + 0.14, plan.display.h + 0.12]} />
        <meshStandardMaterial color="#17191c" roughness={0.78} />
      </mesh>

      {/* The panel itself: black glass, always present. */}
      <mesh position={[plan.display.x, plan.display.cy, 0.03]}>
        <planeGeometry args={[plan.display.w, plan.display.h]} />
        <meshStandardMaterial color="#0c0e11" roughness={0.14} metalness={0.2} />
      </mesh>
      {/* What it is showing, fading up over it — and never while the fabric is
          down in front, because a covered display is a covered display. */}
      {deployed < 0.04 && (
        <mesh position={[plan.display.x, plan.display.cy, 0.034]}>
          <planeGeometry args={[plan.display.w, plan.display.h]} />
          <primitive object={panelImage} attach="material" />
        </mesh>
      )}

      {/* Roller case for the projection screen, above the display. */}
      <mesh position={[plan.screen.x, plan.screen.y1 + 0.06, 0.12]}>
        <boxGeometry args={[plan.screen.w + 0.2, 0.14, 0.16]} />
        <primitive object={M.housing} attach="material" />
      </mesh>

      {deployed > 0.01 && (
        <>
          {/* The fabric. White vinyl, lit by whatever is in the room — this is
              what you watch come down, with nothing on it. */}
          <mesh position={[plan.screen.x, plan.screen.y1 - drop / 2, 0.14]}>
            <planeGeometry args={[plan.screen.w, drop]} />
            <meshStandardMaterial color="#cfcec9" roughness={0.95} />
          </mesh>
          {/* The projected image, arriving afterwards — and always at the
              screen's full size, so it can never be squashed into a partly
              unrolled one. */}
          {seated && (
            <mesh
              position={[plan.screen.x, plan.screen.y1 - plan.screen.drop / 2, 0.144]}
            >
              <planeGeometry args={[plan.screen.w, plan.screen.drop]} />
              <primitive object={projected} attach="material" />
            </mesh>
          )}
          {/* Bottom bar, so the fabric reads as having weight. */}
          <mesh position={[plan.screen.x, plan.screen.y1 - drop, 0.145]}>
            <boxGeometry args={[plan.screen.w, 0.05, 0.03]} />
            <primitive object={M.housing} attach="material" />
          </mesh>
        </>
      )}

      {/* Column speakers. */}
      {plan.speakers.map((sp, i) => (
        <group key={i} position={[sp.x, 0, 0.2]}>
          <mesh position={[0, 1.08, 0]} castShadow>
            <boxGeometry args={[0.17, 2.0, 0.13]} />
            <primitive object={M.housing} attach="material" />
          </mesh>
          {[0.55, 0.95, 1.35].map((y) => (
            <mesh key={y} position={[0, y, 0.07]}>
              <circleGeometry args={[0.058, 16]} />
              <meshStandardMaterial color="#111316" roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Credenza under the display. */}
      <group position={[plan.credenza.x, 0, plan.credenza.d / 2 + 0.04]}>
        <mesh position={[0, plan.credenza.h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[plan.credenza.w, plan.credenza.h, plan.credenza.d]} />
          <primitive object={M.timber} attach="material" />
        </mesh>
        {[-1.2, 0, 1.2].map((x) => (
          <mesh key={x} position={[x, plan.credenza.h / 2, plan.credenza.d / 2 + 0.004]}>
            <planeGeometry args={[0.012, plan.credenza.h - 0.08]} />
            <primitive object={M.metal} attach="material" />
          </mesh>
        ))}
      </group>

      {/* Conference camera bar, centred under the display. */}
      <mesh position={[plan.display.x, plan.display.cy - plan.display.h / 2 - 0.1, 0.07]}>
        <boxGeometry args={[0.46, 0.07, 0.07]} />
        <primitive object={M.housing} attach="material" />
      </mesh>
    </group>
  );
}

function Projector({ on }: { on: boolean }) {
  const p = BR_PLAN.projector;
  return (
    <group position={[p.x, p.y, p.z]}>
      {/* Drop pole to the coffer. */}
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.3, 8]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      <mesh castShadow>
        <boxGeometry args={[0.38, 0.13, 0.32]} />
        <primitive object={M.housing} attach="material" />
      </mesh>
      {/* Lens, facing the screen. */}
      <mesh position={[0, 0, -0.17]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.05, 14]} />
        <meshStandardMaterial
          color={on ? "#dfe7f6" : "#15181c"}
          emissive={new THREE.Color(on ? "#cfe0ff" : "#000000")}
          emissiveIntensity={on ? 2.2 : 0}
          roughness={0.3}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Table and seating                                                   */
/* ------------------------------------------------------------------ */

function Chair({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: number;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Five-star base. */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          position={[
            Math.sin((i / 5) * Math.PI * 2) * 0.17,
            0.035,
            Math.cos((i / 5) * Math.PI * 2) * 0.17,
          ]}
          rotation={[0, (i / 5) * Math.PI * 2, 0]}
        >
          <boxGeometry args={[0.045, 0.045, 0.34]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
      <mesh position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.035, 0.045, 0.42, 10]} />
        <primitive object={M.chrome} attach="material" />
      </mesh>

      <RoundedBox args={[0.52, 0.1, 0.5]} radius={0.045} smoothness={3} position={[0, 0.49, 0]} castShadow>
        <primitive object={M.leather} attach="material" />
      </RoundedBox>

      {/* Back, reclined a few degrees. */}
      <RoundedBox
        args={[0.5, 0.66, 0.09]}
        radius={0.04}
        smoothness={3}
        position={[0, 0.85, -0.23]}
        rotation={[-0.14, 0, 0]}
        castShadow
      >
        <primitive object={M.leather} attach="material" />
      </RoundedBox>

      {([-0.29, 0.29] as const).map((x) => (
        <mesh key={x} position={[x, 0.66, -0.03]}>
          <boxGeometry args={[0.05, 0.04, 0.34]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

function Table() {
  const t = BR_PLAN.table;
  const length = t.z1 - t.z0;
  const cz = (t.z0 + t.z1) / 2;

  return (
    <group>
      <RoundedBox
        args={[t.w, 0.07, length]}
        radius={0.03}
        smoothness={3}
        position={[t.x, t.h, cz]}
        castShadow
        receiveShadow
      >
        <primitive object={M.tableTop} attach="material" />
      </RoundedBox>

      {/* Two plinth legs rather than four posts — a boardroom table is almost
          always on blades, and it keeps the under-table clear of chair bases. */}
      {([t.z0 + 1.1, t.z1 - 1.1] as const).map((z) => (
        <mesh key={z} position={[t.x, (t.h - 0.04) / 2, z]} castShadow>
          <boxGeometry args={[t.w - 0.5, t.h - 0.07, 0.1]} />
          <primitive object={M.timberDark} attach="material" />
        </mesh>
      ))}

      {/* Cable boxes down the centre line. */}
      {[t.z0 + 1.4, cz, t.z1 - 1.4].map((z) => (
        <mesh key={z} position={[t.x, t.h + 0.038, z]}>
          <boxGeometry args={[0.3, 0.012, 0.16]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}

      {/* The control tablet, angled, where the sheet puts it. */}
      <group position={[t.x + 0.46, t.h + 0.04, cz - 0.5]} rotation={[-0.42, -0.2, 0]}>
        <mesh>
          <boxGeometry args={[0.26, 0.18, 0.012]} />
          <primitive object={M.housing} attach="material" />
        </mesh>
        <mesh position={[0, 0, 0.008]}>
          <planeGeometry args={[0.235, 0.155]} />
          <meshStandardMaterial
            color="#000000"
            emissive={new THREE.Color("#2b4a74")}
            emissiveIntensity={1.4}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}

function Seating() {
  const t = BR_PLAN.table;
  const n = BR_PLAN.seatsPerSide;
  const length = t.z1 - t.z0;
  const step = length / n;
  /**
   * How far a chair sits from the table's centre line.
   *
   * 0.20 beyond the table edge, not 0.42. At 0.42 every seat stopped 17 cm
   * clear of the table and the whole room read as chairs parked near a table
   * rather than drawn up to one — measured, after it was pointed out. A tucked
   * chair overlaps the top by a hand's width, which this does by 7 cm.
   */
  const offset = t.w / 2 + 0.20;
  /** Same tuck at the two ends. */
  const endTuck = 0.18;

  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const z = t.z0 + step * (i + 0.5);
        return (
          <group key={i}>
            <Chair position={[t.x - offset, 0, z]} rotation={Math.PI / 2} />
            <Chair position={[t.x + offset, 0, z]} rotation={-Math.PI / 2} />
          </group>
        );
      })}
      {/**
       * The two ends.
       *
       * The rotations are the opposite way round from how they first read. A
       * chair's back sits at its own local -z, so the chair beyond the far end
       * of the table needs rotation 0 to put that back further away — at
       * `Math.PI` it swings round to face the wall, which is exactly what both
       * of these were doing.
       */}
      <Chair position={[t.x, 0, t.z0 - endTuck]} rotation={0} />
      <Chair position={[t.x, 0, t.z1 + endTuck]} rotation={Math.PI} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Dressing                                                            */
/* ------------------------------------------------------------------ */

function Plants() {
  return (
    <group>
      {BR_PLAN.plants.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh position={[0, 0.26, 0]} castShadow>
            <cylinderGeometry args={[0.24, 0.19, 0.52, 14]} />
            <primitive object={M.planter} attach="material" />
          </mesh>
          {[
            [0, 0.95, 0, 0.36],
            [0.17, 1.24, 0.1, 0.26],
            [-0.14, 1.18, -0.12, 0.23],
            [0.06, 1.46, -0.05, 0.17],
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

function StatementPanel() {
  const s = BR_PLAN.statement;
  const texture = useMemo(
    () => makeWordsTexture(["BETTER", "MEETINGS", "BRIGHTER", "IDEAS"], "#1d1f22", "#d6cdbb"),
    [],
  );
  return (
    <mesh position={[0.06, s.cy, s.z]} rotation={[0, Math.PI / 2, 0]}>
      <planeGeometry args={[1.5, s.h]} />
      <meshStandardMaterial map={texture} roughness={0.9} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Luminaire housings                                                  */
/* ------------------------------------------------------------------ */

/**
 * The bodies of the fittings, with no light in them.
 *
 * Emissive faces and the lights themselves live in `BoardroomLightRig`, because
 * those depend on device state and these do not — so the geometry here is built
 * once and never rebuilt when a dimmer moves.
 */
function Housings() {
  const p = BR_PLAN;
  return (
    <group>
      {/* Suspended linear: housing and its two drops. */}
      <mesh position={[p.pendant.x, p.pendant.y, (p.pendant.z0 + p.pendant.z1) / 2]} castShadow>
        <boxGeometry args={[0.14, 0.11, p.pendant.z1 - p.pendant.z0]} />
        <primitive object={M.housing} attach="material" />
      </mesh>
      {([p.pendant.z0 + 0.7, p.pendant.z1 - 0.7] as const).map((z) => (
        <mesh key={z} position={[p.pendant.x, (p.pendant.y + BR.h) / 2 + 0.05, z]}>
          <cylinderGeometry args={[0.006, 0.006, BR.h - p.pendant.y - 0.1, 6]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}

      {/* Recessed downlight trims: general grid, table heads, front row. */}
      {p.generalRows.flatMap((x) =>
        p.generalZ.map((z) => (
          <mesh key={`g${x}-${z}`} position={[x, BR.h - 0.012, z]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.055, 0.075, 18]} />
            <primitive object={M.housing} attach="material" />
          </mesh>
        )),
      )}
      {p.tableHeads.rows.flatMap((x) =>
        p.tableHeads.z.map((z) => (
          <mesh key={`t${x}-${z}`} position={[x, BR.h - 0.012, z]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.04, 0.056, 16]} />
            <primitive object={M.housing} attach="material" />
          </mesh>
        )),
      )}
      {p.frontX.map((x) => (
        <mesh key={`f${x}`} position={[x, BR.h - 0.012, p.frontZ]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.055, 0.075, 18]} />
          <primitive object={M.housing} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* The room                                                            */
/* ------------------------------------------------------------------ */

export function Boardroom3D({
  blinds,
  view,
  screen,
  projectorOn,
  displayOn,
  screenContent,
}: {
  blinds: BoardroomBlinds;
  view: THREE.Texture;
  screen: number;
  projectorOn: boolean;
  displayOn: boolean;
  screenContent: ScreenContent;
}) {
  return (
    <group>
      <Shell />
      <SlatWall />
      <Glazing sheer={blinds.sheer} blackout={blinds.blackout} view={view} />
      <StatementPanel />
      <ScreenWall
        screen={screen}
        displayOn={displayOn}
        projectorOn={projectorOn}
        content={screenContent}
      />
      <Projector on={projectorOn} />
      <Table />
      <Seating />
      <Plants />
      <Housings />
    </group>
  );
}
