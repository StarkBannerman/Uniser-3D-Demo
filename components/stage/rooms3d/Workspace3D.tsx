"use client";

/**
 * Commercial Office — open-plan Workspace, geometry only.
 *
 * Built to the client's workspace sheet. Three zones on one floor plate, which
 * is the whole reason the room is worth showing:
 *
 *        z = 0   +--------------------------------------+
 *                |   wall graphic                       |
 *   glazing      |                 +-----------------+  |
 *   and blinds   |   desk benches  |  meeting room   |  |  graphic
 *   x = 0        |   (three runs)  |  (glazed box)   |  |  wall
 *                |                 +-----------------+  |  x = WS.w
 *                |                   break area         |
 *                +---------------^----------------------+
 *                           camera, high z and high x
 *
 * The camera sits in the near right corner so all three zones are in frame at
 * once — desks running away on the left, the glazed room square in the middle
 * distance, the break area in the near right. Every scene on the sheet changes
 * the balance between those three, so a view that can only see one of them
 * would throw away the point of the room.
 *
 * Coordinates in metres.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import {
  makeBlindTexture,
  makeCityTexture,
  makeScreenTexture,
  makeWordsTexture,
  type ScreenContent,
} from "./geometry";
import { applySet, useTextureSet } from "./pbr";
import type { ShadeState } from "@/lib/sim/types";

export const WS = {
  /** Across the room. Glazing at x = 0, graphic wall at x = w. */
  w: 16.0,
  /** Away from the camera. The far wall with the headline graphic is z = 0. */
  d: 13.5,
  h: 3.4,
  /** Perimeter coffer: the cove sits on top of this and washes the soffit. */
  soffit: { depth: 0.7, drop: 0.24 },
} as const;

export const WS_COVE_Y = WS.h - WS.soffit.drop + 0.03;

/** The glazed façade, behind the blinds. */
export const WS_WINDOW = { z0: 0.8, z1: 12.6, y0: 0.15, y1: WS.h - 0.52 };

export const WS_PLAN = {
  /**
   * Three desk benches, each eight seats — four a side, back to back.
   *
   * Benches rather than separate desks because that is what the sheet shows and
   * what an open plan is: the back-to-back run with a shared screen down the
   * middle is the defining object of the typology, and separate desks in rows
   * read as a call centre.
   */
  benches: [{ x: 2.35 }, { x: 5.15 }, { x: 7.95 }],
  bench: { z0: 2.6, z1: 8.6, w: 1.56, h: 0.74, seatsPerSide: 4 },

  /**
   * The glazed meeting room.
   *
   * Inside the floor plate rather than against a wall, so it is read from three
   * sides. It is the one zone on the floor that regularly needs to be darker
   * than everything around it, and that only reads if you can see the floor
   * around it at the same time.
   */
  meeting: { x0: 9.8, x1: 14.6, z0: 1.4, z1: 6.0, h: 2.85 },
  meetingTable: { w: 2.6, d: 1.15, h: 0.74 },
  /** Display on the meeting room's far wall, facing the camera through glass. */
  meetingDisplay: { w: 2.1, h: 1.18, cy: 1.5 },

  /** Break area, near right. Counter against the graphic wall. */
  break: { x0: 9.8, x1: 15.5, z0: 7.4, z1: 12.6 },
  /**
   * An island, not a run against the wall, and that is a framing decision.
   *
   * Against the x = 15 wall this sat fifty-seven degrees off the camera's
   * axis. Moving it along that wall does not help — the whole wall is outside
   * a 70 degree frame — so pressing the one scene that takes the break area to
   * ninety-five per cent showed the desks dimming and nothing brightening. A
   * zone the scenes rebalance has to be visible while they rebalance it, and
   * the only way to get this one into the picture was to bring it off the wall
   * and onto the floor. A coffee bar as an island is what open plans do with
   * them anyway: it is approachable from both sides and it holds the line
   * between the desks and the lounge.
   */
  counter: { x: 11.8, z0: 6.6, z1: 8.8, h: 1.05, d: 0.62 },
  /** Pendants over the counter. */
  counterPendants: [7.0, 7.6, 8.2, 8.8],
  /** Lounge cluster, out in the middle of the break zone. */
  lounge: { x: 12.9, z: 10.6 },
  /** Two café tables. */
  cafeTables: [
    { x: 11.0, z: 7.9 },
    { x: 13.4, z: 8.3 },
  ],

  /** General downlights, on a 2.4 m grid across the whole plate. */
  generalX: [1.5, 3.9, 6.3, 8.7, 11.1, 13.5],
  generalZ: [1.6, 4.0, 6.4, 8.8, 11.2],
  /** Suspended linear runs: one over each bench, plus two over the break zone. */
  linears: [
    { x: 2.35, z0: 2.2, z1: 9.0, y: 2.62 },
    { x: 5.15, z0: 2.2, z1: 9.0, y: 2.62 },
    { x: 7.95, z0: 2.2, z1: 9.0, y: 2.62 },
  ],
  /** Downlights inside the glazed room, separately circuited. */
  meetingHeads: { x: [10.9, 13.5], z: [2.4, 3.7, 5.0] },
  /** Ceiling fans over the open floor. */
  fans: [
    { x: 4.0, z: 10.6 },
    { x: 7.6, z: 11.4 },
  ],
  /** Cassette AC units. */
  cassettes: [
    { x: 3.2, z: 5.4 },
    { x: 7.2, z: 2.4 },
    { x: 12.2, z: 8.6 },
    { x: 6.0, z: 11.6 },
  ],
  /** Planters: between the benches and marking the zone edges. */
  plants: [
    { x: 3.75, z: 3.1, s: 1 },
    { x: 3.75, z: 8.1, s: 0.9 },
    { x: 6.55, z: 5.6, s: 0.95 },
    { x: 9.1, z: 7.0, s: 1.05 },
    { x: 1.3, z: 11.4, s: 1.1 },
    { x: 15.1, z: 6.6, s: 0.9 },
  ],
  /** Wall graphics, taken from the sheet. */
  headline: { z: 0.04, x: 2.6, cy: 2.0, h: 1.5 },
  sideline: { x: WS.w - 0.04, z: 9.6, cy: 2.05, h: 1.4 },
} as const;

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

/**
 * An office palette: light, and much lighter than it looks in source.
 *
 * Everything from `floorMat` down carries a scanned albedo, so its colour is
 * near white on purpose — colour and map *multiply*, and a colour chosen as if
 * it were the whole answer gets applied twice. That mistake cost the cabin next
 * door several days: its joinery ended up returning half a per cent of the
 * light that reached it against eight to twelve for the real timber, the
 * compensation all went into the fixtures, and the few surfaces that were not
 * sinks blew out while everything else stayed black.
 *
 * The rule, stated once: a material with a map gets a light tint, because the
 * albedo already carries the tone. A material without one gets a real colour,
 * because nothing else will.
 *
 * The values here are also deliberately high in absolute terms. This room works
 * to 400 lux across a twelve-metre-deep plate on a third of its connected load,
 * and that is only possible if the surfaces give the light back. Offices are
 * specified pale for exactly this reason.
 */
const M = {
  ceiling: new THREE.MeshStandardMaterial({ color: "#d8d4cc", roughness: 0.96 }),
  soffit: new THREE.MeshStandardMaterial({ color: "#cdc8bf", roughness: 0.93 }),
  wall: new THREE.MeshStandardMaterial({ color: "#c2bcb1", roughness: 0.94 }),
  /** The graphic walls, a shade down so the lettering reads against them. */
  wallAccent: new THREE.MeshStandardMaterial({ color: "#8e877c", roughness: 0.92 }),
  /**
   * Exposed services above the coffer: the dark plenum the sheet shows between
   * the linear runs. Dark on purpose, so the eye stops at the cove.
   */
  plenum: new THREE.MeshStandardMaterial({ color: "#2a2b2d", roughness: 0.95 }),

  /** Polished terrazzo. Takes the stone scan at a large tile. */
  floor: new THREE.MeshPhysicalMaterial({
    color: "#e4ded2",
    roughness: 0.26,
    metalness: 0.02,
    clearcoat: 0.55,
    clearcoatRoughness: 0.22,
    envMapIntensity: 0.9,
  }),
  /**
   * Light oak, on its own scan.
   *
   * The cabin's walnut map was the obvious thing to reuse and it is the wrong
   * timber: it averages 0.089 reflectance with red running nearly twice blue,
   * so office benches built on it came out mahogany however white the colour
   * went — and the colour cannot lift a map past the map's own value. So the
   * oak set is that scan re-seated on a pale warm oak, per channel against its
   * own means, which keeps every bit of the grain and moves only the tone.
   */
  oak: new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.5,
    metalness: 0.02,
    envMapIntensity: 0.5,
  }),
  /** Darker timber, for the counter body and the meeting table. */
  oakDark: new THREE.MeshStandardMaterial({
    color: "#b3a893",
    roughness: 0.56,
    envMapIntensity: 0.4,
  }),
  /** Desk pedestals, screens and the bench frame. */
  frame: new THREE.MeshStandardMaterial({ color: "#34363a", roughness: 0.52, metalness: 0.3 }),
  divider: new THREE.MeshStandardMaterial({ color: "#5d6468", roughness: 0.9 }),
  /** Task chair shells and lounge upholstery. */
  upholstery: new THREE.MeshPhysicalMaterial({
    color: "#cfc8bf",
    roughness: 0.82,
    sheen: 0.7,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color("#ded6c8"),
  }),
  upholsteryDark: new THREE.MeshPhysicalMaterial({
    color: "#7d8a84",
    roughness: 0.86,
    sheen: 0.8,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color("#a9b4ad"),
  }),
  rug: new THREE.MeshStandardMaterial({
    color: "#d6cec2",
    roughness: 0.96,
    envMapIntensity: 0.2,
  }),

  matteBlack: new THREE.MeshStandardMaterial({ color: "#1c1d1f", roughness: 0.58, metalness: 0.16 }),
  metal: new THREE.MeshStandardMaterial({ color: "#2a2d31", roughness: 0.36, metalness: 0.78 }),
  brushed: new THREE.MeshStandardMaterial({ color: "#9ba1a6", roughness: 0.33, metalness: 0.88 }),
  housing: new THREE.MeshStandardMaterial({ color: "#202225", roughness: 0.5 }),

  /**
   * Solar-filter roller: plain alpha, deliberately not `transmission`.
   *
   * A transmissive material makes three.js render the whole scene a second time
   * into a transmission buffer. In the boardroom that halved the frame rate on
   * its own the moment the blinds came down, and this floor has four times the
   * geometry. Against a bright window seen from inside a lit room the two are
   * not tellable apart.
   */
  blindSheer: new THREE.MeshStandardMaterial({
    color: "#d4cdc0",
    roughness: 0.8,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
  }),
  blindBlackout: new THREE.MeshStandardMaterial({
    color: "#514c45",
    roughness: 0.92,
    side: THREE.DoubleSide,
  }),
  glass: new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: 0.04,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
  }),
  /** The meeting room's partition glass — a touch more present than the façade. */
  partition: new THREE.MeshPhysicalMaterial({
    color: "#eaf0f2",
    roughness: 0.06,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
  }),

  foliage: new THREE.MeshStandardMaterial({
    color: "#44603a",
    roughness: 0.82,
    side: THREE.DoubleSide,
  }),
  foliageDark: new THREE.MeshStandardMaterial({
    color: "#2f4a2a",
    roughness: 0.86,
    side: THREE.DoubleSide,
  }),
  planter: new THREE.MeshStandardMaterial({ color: "#3c3d3f", roughness: 0.62 }),
  paper: new THREE.MeshStandardMaterial({ color: "#ddd7c9", roughness: 0.9 }),
} as const;

/** Screen glass, off. Monitors are everywhere here, so it is shared. */
const SCREEN_OFF = new THREE.MeshStandardMaterial({
  color: "#101316",
  roughness: 0.22,
  metalness: 0.1,
});

/* ------------------------------------------------------------------ */
/* Scanned maps                                                        */
/* ------------------------------------------------------------------ */

function Surfaces() {
  /**
   * Terrazzo at a terrazzo scale.
   *
   * [5, 4.2] over a 16 x 13.5 m plate is a 3.2 m tile, which magnifies marble
   * veining into metre-wide blotches — the floor read as a quarry slab rather
   * than as a poured finish. Just over a metre is the right order for the
   * aggregate to read as aggregate.
   */
  const stone = useTextureSet("stone", [20, 17]);
  const oak = useTextureSet("oak", [3.2, 2.4]);
  const carpet = useTextureSet("carpet", [4, 3.4]);
  const leather = useTextureSet("leather", [3, 3]);

  useLayoutEffect(() => {
    applySet(M.floor, stone, { normalScale: 0.3, envMapIntensity: 0.9 });
    applySet(M.oak, oak, { normalScale: 0.5, envMapIntensity: 0.5 });
    applySet(M.oakDark, oak, { normalScale: 0.55, envMapIntensity: 0.4 });
    applySet(M.rug, carpet, { normalScale: 0.35, envMapIntensity: 0.2 });
    applySet(M.upholstery, leather, { normalScale: 0.6, envMapIntensity: 0.4 });
    applySet(M.upholsteryDark, leather, { normalScale: 0.6, envMapIntensity: 0.4 });
  }, [stone, oak, carpet, leather]);

  return null;
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

function Shell() {
  const { w, d, h, soffit } = WS;
  const win = WS_WINDOW;

  const headline = useMemo(
    () =>
      makeWordsTexture(["BRIGHT", "PEOPLE", "BRIGHTER", "IDEAS"], "#8e877c", "#2b2722", {
        size: 44,
        spacing: 7,
        transparent: true,
      }),
    [],
  );
  const sideline = useMemo(
    () =>
      makeWordsTexture(["GOOD", "WORK", "BRIGHTER", "TOMORROW"], "#8e877c", "#f0e8da", {
        size: 40,
        spacing: 8,
        transparent: true,
      }),
    [],
  );

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[w / 2, 0, d / 2]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <primitive object={M.floor} attach="material" />
      </mesh>
      {/* The plenum above the coffer, not a flat ceiling. */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[w / 2, h + 0.18, d / 2]}>
        <planeGeometry args={[w, d]} />
        <primitive object={M.plenum} attach="material" />
      </mesh>
      {/* The flat ceiling inside the coffer. */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[w / 2, h, d / 2]}>
        <planeGeometry args={[w - soffit.depth * 2, d - soffit.depth * 2]} />
        <primitive object={M.ceiling} attach="material" />
      </mesh>

      {/* Perimeter coffer: soffit face, then its inner return. */}
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

      {/* Far wall, with the headline graphic on it. */}
      <mesh position={[w / 2, h / 2, 0]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <primitive object={M.wallAccent} attach="material" />
      </mesh>
      <mesh position={[WS_PLAN.headline.x, WS_PLAN.headline.cy, WS_PLAN.headline.z]}>
        <planeGeometry args={[WS_PLAN.headline.h * 0.52, WS_PLAN.headline.h]} />
        <meshBasicMaterial map={headline} transparent toneMapped={false} />
      </mesh>

      {/* Near wall, behind the camera. Flat, and never seen. */}
      <mesh position={[w / 2, h / 2, d]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[w, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>

      {/* Graphic wall on the right. */}
      <mesh position={[w, h / 2, d / 2]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <primitive object={M.wallAccent} attach="material" />
      </mesh>
      <mesh
        position={[WS_PLAN.sideline.x, WS_PLAN.sideline.cy, WS_PLAN.sideline.z]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[WS_PLAN.sideline.h * 0.52, WS_PLAN.sideline.h]} />
        <meshBasicMaterial map={sideline} transparent toneMapped={false} />
      </mesh>

      {/* Glazing wall exists where the glass does not. */}
      <mesh position={[0, win.y0 / 2, d / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[d, win.y0]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      <mesh position={[0, (win.y1 + h) / 2, d / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[d, h - win.y1]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      {([
        [win.z0 / 2, win.z0],
        [(win.z1 + d) / 2, d - win.z1],
      ] as const).map(([cz, len], i) => (
        <mesh key={i} position={[0, h / 2, cz]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[len, h]} />
          <primitive object={M.wall} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Glazing and blinds                                                  */
/* ------------------------------------------------------------------ */

function Glazing({ sheer, blackout, view }: { sheer: number; blackout: number; view: THREE.Texture }) {
  const win = WS_WINDOW;
  const span = win.z1 - win.z0;
  const height = win.y1 - win.y0;
  const bays = 8;
  const bay = span / bays;
  const slats = useMemo(() => makeBlindTexture(), []);
  useLayoutEffect(() => {
    view.wrapS = THREE.RepeatWrapping;
    view.repeat.set(1.6, 1);
    view.needsUpdate = true;
  }, [view]);

  return (
    <group>
      {/**
       * The city, well outside the building — and sized to what the window
       * actually samples of it.
       *
       * A 58 x 26 m backdrop sounds safe and is not. The opening is only 2.7 m
       * tall, so it sees a tenth of the texture's height, and at this distance
       * that tenth fell entirely inside the tower band: every pane was dark
       * navy with no sky in it at ten in the morning. Scaled to 11 m the same
       * opening spans sky at the head and towers at the sill, which is what
       * you see out of an upper floor.
       *
       * The width that buys back is made up by repeating horizontally rather
       * than by stretching, so the towers keep their proportions. This texture
       * instance belongs to this room — `makeCityTexture` builds a new canvas
       * per call — so setting `repeat` on it cannot reach the other rooms.
       */}
      <mesh position={[-22, 1.6, -3.3]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[34, 11]} />
        <meshBasicMaterial map={view} toneMapped={false} />
      </mesh>
      <mesh
        position={[0.02, (win.y0 + win.y1) / 2, (win.z0 + win.z1) / 2]}
        rotation={[0, Math.PI / 2, 0]}
      >
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

      {/* Roller cassettes. */}
      {Array.from({ length: bays }, (_, i) => (
        <mesh key={`c${i}`} position={[0.14, win.y1 - 0.06, win.z0 + bay * (i + 0.5)]}>
          <boxGeometry args={[0.12, 0.11, bay - 0.1]} />
          <primitive object={M.matteBlack} attach="material" />
        </mesh>
      ))}

      {/**
       * Two rollers per bay, dropping from the head.
       *
       * The sheer carries a slat texture rather than geometry: thirty slats
       * across eight bays is two hundred and forty boxes for something read at
       * eight metres through glass, and a striped albedo gives the same picture
       * for one draw call.
       */}
      {sheer > 0.4 &&
        Array.from({ length: bays }, (_, i) => {
          const drop = height * (sheer / 100);
          return (
            <mesh
              key={`s${i}`}
              position={[0.1, win.y1 - drop / 2, win.z0 + bay * (i + 0.5)]}
            >
              <planeGeometry args={[bay - 0.1, drop]} />
              <primitive object={M.blindSheer} attach="material" />
              <meshStandardMaterial
                attach="material"
                map={slats}
                color="#d4cdc0"
                roughness={0.8}
                transparent
                opacity={0.5}
                side={THREE.DoubleSide}
              />
            </mesh>
          );
        })}
      {blackout > 0.4 &&
        Array.from({ length: bays }, (_, i) => {
          const drop = height * (blackout / 100);
          return (
            <mesh
              key={`b${i}`}
              position={[0.06, win.y1 - drop / 2, win.z0 + bay * (i + 0.5)]}
            >
              <planeGeometry args={[bay - 0.1, drop]} />
              <primitive object={M.blindBlackout} attach="material" />
            </mesh>
          );
        })}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Desks                                                               */
/* ------------------------------------------------------------------ */

function TaskChair({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: number;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Seat. */}
      <RoundedBox args={[0.47, 0.08, 0.45]} radius={0.03} smoothness={2} position={[0, 0.45, 0]} castShadow>
        <primitive object={M.upholsteryDark} attach="material" />
      </RoundedBox>
      {/* Back. A chair's back sits at local -z, so a chair facing +z needs
          rotation 0 and one facing -z needs a half turn. Getting this backwards
          put two boardroom chairs facing the wall for a whole pass. */}
      <RoundedBox
        args={[0.45, 0.52, 0.07]}
        radius={0.03}
        smoothness={2}
        position={[0, 0.74, -0.2]}
        rotation={[-0.1, 0, 0]}
        castShadow
      >
        <primitive object={M.upholsteryDark} attach="material" />
      </RoundedBox>
      {/* Column and base. */}
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.42, 10]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.14, 0.05, Math.sin(a) * 0.14]} rotation={[0, -a, 0]}>
            <boxGeometry args={[0.28, 0.035, 0.05]} />
            <primitive object={M.matteBlack} attach="material" />
          </mesh>
        );
      })}
    </group>
  );
}

function Monitor({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[0.22, 0.015, 0.14]} />
        <primitive object={M.matteBlack} attach="material" />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[0.04, 0.26, 0.04]} />
        <primitive object={M.matteBlack} attach="material" />
      </mesh>
      <mesh position={[0, 0.42, 0.012]} rotation={[-0.06, 0, 0]} castShadow>
        <boxGeometry args={[0.58, 0.35, 0.022]} />
        <primitive object={M.matteBlack} attach="material" />
      </mesh>
      <mesh position={[0, 0.42, -0.003]} rotation={[-0.06, Math.PI, 0]}>
        <planeGeometry args={[0.55, 0.32]} />
        <primitive object={SCREEN_OFF} attach="material" />
      </mesh>
    </group>
  );
}

/**
 * One back-to-back bench.
 *
 * Seats face across the bench, so the row at low x faces +x and the row at
 * high x faces -x. The divider down the centre is what makes it a bench rather
 * than two desks pushed together, and it is also the only thing stopping a
 * monitor on one side being visible through the other.
 */
function Bench({ x }: { x: number }) {
  const b = WS_PLAN.bench;
  const len = b.z1 - b.z0;
  const cz = (b.z0 + b.z1) / 2;
  const half = b.w / 2;
  const pitch = len / b.seatsPerSide;

  return (
    <group position={[x, 0, 0]}>
      {/* Two tops, one each side of the divider. */}
      {([-1, 1] as const).map((sgn) => (
        <mesh key={sgn} position={[sgn * (half / 2), b.h, cz]} receiveShadow castShadow>
          <boxGeometry args={[half, 0.035, len]} />
          <primitive object={M.oak} attach="material" />
        </mesh>
      ))}
      {/* Divider screen down the middle. */}
      <mesh position={[0, b.h + 0.19, cz]}>
        <boxGeometry args={[0.045, 0.38, len]} />
        <primitive object={M.divider} attach="material" />
      </mesh>
      {/* Frame: legs at each end and a mid span. */}
      {[b.z0 + 0.1, cz, b.z1 - 0.1].map((z, i) => (
        <group key={i}>
          <mesh position={[0, b.h / 2, z]}>
            <boxGeometry args={[b.w - 0.12, 0.06, 0.06]} />
            <primitive object={M.frame} attach="material" />
          </mesh>
          {([-1, 1] as const).map((sgn) => (
            <mesh key={sgn} position={[sgn * (half - 0.1), b.h / 2, z]}>
              <boxGeometry args={[0.06, b.h, 0.06]} />
              <primitive object={M.frame} attach="material" />
            </mesh>
          ))}
        </group>
      ))}

      {Array.from({ length: b.seatsPerSide }, (_, i) => {
        const z = b.z0 + pitch * (i + 0.5);
        return (
          <group key={i}>
            {([-1, 1] as const).map((sgn) => (
              <group key={sgn}>
                <Monitor position={[sgn * 0.3, b.h + 0.02, z]} rotation={sgn > 0 ? -Math.PI / 2 : Math.PI / 2} />
                <TaskChair
                  position={[sgn * (half + 0.42), 0, z]}
                  rotation={sgn > 0 ? -Math.PI / 2 : Math.PI / 2}
                />
                {/* A keyboard and a pad of paper, so the desk is not bare. */}
                <mesh position={[sgn * 0.62, b.h + 0.025, z]} rotation={[0, sgn > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
                  <boxGeometry args={[0.36, 0.014, 0.13]} />
                  <primitive object={M.matteBlack} attach="material" />
                </mesh>
                {i % 2 === 0 && (
                  <mesh
                    position={[sgn * 0.5, b.h + 0.021, z + 0.26]}
                    rotation={[-Math.PI / 2, 0, 0.2]}
                  >
                    <planeGeometry args={[0.21, 0.29]} />
                    <primitive object={M.paper} attach="material" />
                  </mesh>
                )}
              </group>
            ))}
            {/* Pedestal under every other place. */}
            {i % 2 === 1 && (
              <mesh position={[half - 0.3, 0.29, z]} castShadow>
                <boxGeometry args={[0.42, 0.58, 0.5]} />
                <primitive object={M.frame} attach="material" />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Meeting room                                                        */
/* ------------------------------------------------------------------ */

function MeetingRoom({ displayOn, content }: { displayOn: boolean; content: ScreenContent }) {
  const m = WS_PLAN.meeting;
  const t = WS_PLAN.meetingTable;
  const dsp = WS_PLAN.meetingDisplay;
  const cx = (m.x0 + m.x1) / 2;
  const cz = (m.z0 + m.z1) / 2;
  const spanX = m.x1 - m.x0;
  const spanZ = m.z1 - m.z0;
  const screen = useMemo(() => makeScreenTexture(content), [content]);

  /**
   * Three glazed sides and one solid.
   *
   * The far side carries the display and is built solid, because a panel
   * floating in glass has nothing to sit against and reads as a hole. The other
   * three are glass with slim mullions, which is what makes the room read as
   * inside the floor plate rather than as a separate room.
   */
  return (
    <group>
      {/* Solid back wall, carrying the display. */}
      <mesh position={[cx, m.h / 2, m.z0]} receiveShadow>
        <planeGeometry args={[spanX, m.h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      <mesh position={[cx, dsp.cy, m.z0 + 0.04]}>
        <boxGeometry args={[dsp.w + 0.05, dsp.h + 0.05, 0.05]} />
        <primitive object={M.matteBlack} attach="material" />
      </mesh>
      <mesh position={[cx, dsp.cy, m.z0 + 0.075]}>
        <planeGeometry args={[dsp.w, dsp.h]} />
        {displayOn ? (
          <meshBasicMaterial map={screen} toneMapped={false} />
        ) : (
          <primitive object={SCREEN_OFF} attach="material" />
        )}
      </mesh>

      {/* Glazed sides. */}
      <mesh position={[cx, m.h / 2, m.z1]}>
        <planeGeometry args={[spanX, m.h]} />
        <primitive object={M.partition} attach="material" />
      </mesh>
      {([m.x0, m.x1] as const).map((x, i) => (
        <mesh key={i} position={[x, m.h / 2, cz]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[spanZ, m.h]} />
          <primitive object={M.partition} attach="material" />
        </mesh>
      ))}
      {/* Head and foot rails, plus mullions on the open sides. */}
      {([m.z1] as const).map((z) =>
        [0, 0.25, 0.5, 0.75, 1].map((f, i) => (
          <mesh key={`v${i}`} position={[m.x0 + spanX * f, m.h / 2, z]}>
            <boxGeometry args={[0.05, m.h, 0.05]} />
            <primitive object={M.matteBlack} attach="material" />
          </mesh>
        )),
      )}
      {([m.x0, m.x1] as const).map((x) =>
        [0, 0.34, 0.67, 1].map((f, i) => (
          <mesh key={`h${x}-${i}`} position={[x, m.h / 2, m.z0 + spanZ * f]}>
            <boxGeometry args={[0.05, m.h, 0.05]} />
            <primitive object={M.matteBlack} attach="material" />
          </mesh>
        )),
      )}
      {([m.z0, m.z1] as const).map((z, i) => (
        <mesh key={`r${i}`} position={[cx, m.h, z]}>
          <boxGeometry args={[spanX, 0.06, 0.06]} />
          <primitive object={M.matteBlack} attach="material" />
        </mesh>
      ))}
      {([m.x0, m.x1] as const).map((x, i) => (
        <mesh key={`rr${i}`} position={[x, m.h, cz]}>
          <boxGeometry args={[0.06, 0.06, spanZ]} />
          <primitive object={M.matteBlack} attach="material" />
        </mesh>
      ))}

      {/* Table and eight chairs. */}
      <RoundedBox
        args={[t.w, 0.05, t.d]}
        radius={0.02}
        smoothness={3}
        position={[cx, t.h, cz]}
        castShadow
        receiveShadow
      >
        <primitive object={M.oakDark} attach="material" />
      </RoundedBox>
      {([-1, 1] as const).map((sgn) => (
        <mesh key={sgn} position={[cx + sgn * (t.w / 2 - 0.28), t.h / 2, cz]}>
          <boxGeometry args={[0.08, t.h, t.d - 0.3]} />
          <primitive object={M.frame} attach="material" />
        </mesh>
      ))}
      {Array.from({ length: 3 }, (_, i) => {
        const x = cx - t.w / 2 + (t.w / 3) * (i + 0.5);
        return (
          <group key={i}>
            <TaskChair position={[x, 0, cz - t.d / 2 - 0.42]} rotation={0} />
            <TaskChair position={[x, 0, cz + t.d / 2 + 0.42]} rotation={Math.PI} />
          </group>
        );
      })}
      {([-1, 1] as const).map((sgn) => (
        <TaskChair
          key={sgn}
          position={[cx + sgn * (t.w / 2 + 0.44), 0, cz]}
          rotation={sgn > 0 ? -Math.PI / 2 : Math.PI / 2}
        />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Break area                                                          */
/* ------------------------------------------------------------------ */

function BreakArea() {
  const c = WS_PLAN.counter;
  const l = WS_PLAN.lounge;
  const len = c.z1 - c.z0;
  const cz = (c.z0 + c.z1) / 2;

  return (
    <group>
      {/* Counter against the graphic wall. */}
      <mesh position={[c.x, c.h / 2, cz]} castShadow receiveShadow>
        <boxGeometry args={[c.d, c.h, len]} />
        <primitive object={M.oakDark} attach="material" />
      </mesh>
      <mesh position={[c.x - 0.03, c.h + 0.025, cz]} receiveShadow>
        <boxGeometry args={[c.d + 0.1, 0.05, len + 0.08]} />
        <primitive object={M.oak} attach="material" />
      </mesh>
      {/* Stools. */}
      {[0.18, 0.39, 0.61, 0.82].map((f, i) => (
        <group key={i} position={[c.x - 0.74, 0, c.z0 + len * f]}>
          <mesh position={[0, 0.66, 0]} castShadow>
            <cylinderGeometry args={[0.17, 0.17, 0.06, 16]} />
            <primitive object={M.upholstery} attach="material" />
          </mesh>
          <mesh position={[0, 0.33, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.62, 10]} />
            <primitive object={M.metal} attach="material" />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.18, 0.18, 0.03, 16]} />
            <primitive object={M.matteBlack} attach="material" />
          </mesh>
        </group>
      ))}

      {/* Lounge: a rug, a sectional, two armchairs and a low table. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[l.x, 0.004, l.z]} receiveShadow>
        <planeGeometry args={[3.4, 2.8]} />
        <primitive object={M.rug} attach="material" />
      </mesh>
      <group position={[l.x - 1.1, 0, l.z]}>
        <RoundedBox args={[0.9, 0.36, 2.1]} radius={0.06} smoothness={2} position={[0, 0.24, 0]} castShadow>
          <primitive object={M.upholstery} attach="material" />
        </RoundedBox>
        <RoundedBox args={[0.22, 0.5, 2.1]} radius={0.06} smoothness={2} position={[-0.36, 0.5, 0]} castShadow>
          <primitive object={M.upholstery} attach="material" />
        </RoundedBox>
      </group>
      {([-1, 1] as const).map((sgn) => (
        <group key={sgn} position={[l.x + 0.9, 0, l.z + sgn * 0.85]}>
          <RoundedBox args={[0.82, 0.34, 0.8]} radius={0.07} smoothness={2} position={[0, 0.23, 0]} castShadow>
            <primitive object={M.upholsteryDark} attach="material" />
          </RoundedBox>
          <RoundedBox args={[0.2, 0.46, 0.8]} radius={0.07} smoothness={2} position={[0.31, 0.48, 0]} castShadow>
            <primitive object={M.upholsteryDark} attach="material" />
          </RoundedBox>
        </group>
      ))}
      <mesh position={[l.x - 0.1, 0.33, l.z]} castShadow>
        <cylinderGeometry args={[0.42, 0.42, 0.06, 24]} />
        <primitive object={M.oak} attach="material" />
      </mesh>
      <mesh position={[l.x - 0.1, 0.16, l.z]}>
        <cylinderGeometry args={[0.07, 0.1, 0.32, 12]} />
        <primitive object={M.metal} attach="material" />
      </mesh>

      {/* Café tables. */}
      {WS_PLAN.cafeTables.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]}>
          <mesh position={[0, 0.73, 0]} castShadow>
            <cylinderGeometry args={[0.44, 0.44, 0.05, 24]} />
            <primitive object={M.oak} attach="material" />
          </mesh>
          <mesh position={[0, 0.37, 0]}>
            <cylinderGeometry args={[0.05, 0.07, 0.72, 12]} />
            <primitive object={M.metal} attach="material" />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.3, 0.3, 0.03, 20]} />
            <primitive object={M.matteBlack} attach="material" />
          </mesh>
          {[0, Math.PI].map((a, j) => (
            <TaskChair key={j} position={[Math.sin(a) * 0.78, 0, Math.cos(a) * 0.78]} rotation={a + Math.PI} />
          ))}
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Plants                                                              */
/* ------------------------------------------------------------------ */

/**
 * One leaf, pointed at both ends, built once and shared.
 *
 * Lifted wholesale from the cabin, where the first attempt used plain planes
 * and read as cardboard strips stapled to a pole. A leaf is recognised by its
 * taper; without that no amount of arranging helps.
 */
const LEAF_GEOM = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.38, 0.2, 0.32, 0.76, 0, 1);
  s.bezierCurveTo(-0.32, 0.76, -0.38, 0.2, 0, 0);
  return new THREE.ShapeGeometry(s, 12);
})();

const LEAF_COUNT = 34;
const LEAVES = Array.from({ length: LEAF_COUNT }, (_, i) => {
  const t = i / (LEAF_COUNT - 1);
  const n = Math.sin(i * 12.9898) * 43758.5453;
  const j = n - Math.floor(n);
  return {
    // 137.5 degrees, the angle real stems put successive leaves at.
    turn: i * 2.39996,
    tilt: 1.34 - t * 0.98 + (j - 0.5) * 0.22,
    roll: (j - 0.5) * 1.1,
    len: (0.4 - t * 0.14) * (0.85 + j * 0.3),
    y: 0.54 + t * 0.86,
    dark: i % 3 === 0,
  };
});

function Plants() {
  return (
    <group>
      {WS_PLAN.plants.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} scale={p.s}>
          <mesh position={[0, 0.26, 0]} castShadow>
            <cylinderGeometry args={[0.2, 0.17, 0.52, 18]} />
            <primitive object={M.planter} attach="material" />
          </mesh>
          {LEAVES.map((l, j) => (
            <group key={j} position={[0, l.y, 0]} rotation={[0, l.turn, 0]}>
              <group rotation={[0, 0, -l.tilt]}>
                <mesh
                  geometry={LEAF_GEOM}
                  rotation={[0, l.roll, 0]}
                  scale={[l.len * 0.7, l.len, 1]}
                  castShadow
                >
                  <primitive object={l.dark ? M.foliageDark : M.foliage} attach="material" />
                </mesh>
              </group>
            </group>
          ))}
          <mesh position={[0, 0.88, 0]}>
            <cylinderGeometry args={[0.014, 0.018, 0.74, 8]} />
            <meshStandardMaterial color="#415037" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Ceiling services                                                    */
/* ------------------------------------------------------------------ */

/**
 * A ceiling fan, turning at its own speed.
 *
 * The blade angle is mutated on a ref inside `useFrame`, never held in state.
 * Computing it during render and pushing it back with `setState` is an infinite
 * render loop, and that is exactly how the cabin's fan locked the browser the
 * first time it was built.
 */
function Fan({ x, z, speed }: { x: number; z: number; speed: number }) {
  const blades = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (blades.current) blades.current.rotation.y += dt * speed * 2.6;
  });
  return (
    <group position={[x, WS.h - 0.42, z]}>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.44, 8]} />
        <primitive object={M.matteBlack} attach="material" />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.11, 0.13, 0.1, 16]} />
        <primitive object={M.matteBlack} attach="material" />
      </mesh>
      <group ref={blades}>
        {Array.from({ length: 3 }, (_, b) => (
          <mesh key={b} position={[0, -0.02, 0]} rotation={[0, (b / 3) * Math.PI * 2, 0.03]}>
            <boxGeometry args={[1.28, 0.016, 0.15]} />
            <primitive object={M.matteBlack} attach="material" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * The housings, with no light in them.
 *
 * Bodies live here and their lights live in the rig, which is a split worth
 * naming because it has bitten this project before: a fitting can be moved or
 * turned in one file and not the other, and nothing catches it. The plan
 * constants above are the only thing holding the two in agreement, so both
 * sides read their positions from `WS_PLAN` and never from a literal.
 */
function Housings({ fanSpeed }: { fanSpeed: number }) {
  return (
    <group>
      {/* Downlight apertures. */}
      {WS_PLAN.generalX.map((x) =>
        WS_PLAN.generalZ.map((z) => (
          <mesh key={`${x}-${z}`} position={[x, WS.h - 0.012, z]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.07, 16]} />
            <primitive object={M.housing} attach="material" />
          </mesh>
        )),
      )}
      {WS_PLAN.meetingHeads.x.map((x) =>
        WS_PLAN.meetingHeads.z.map((z) => (
          <mesh key={`m${x}-${z}`} position={[x, WS_PLAN.meeting.h - 0.012, z]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.065, 16]} />
            <primitive object={M.housing} attach="material" />
          </mesh>
        )),
      )}

      {/* Suspended linear bodies and their drops. */}
      {WS_PLAN.linears.map((r, i) => {
        const len = r.z1 - r.z0;
        const cz = (r.z0 + r.z1) / 2;
        return (
          <group key={i}>
            {/**
             * A lid over the diffuser, and the numbers are load-bearing.
             *
             * The extrusion must sit entirely above the lit blade in
             * `WorkspaceLightRig`, which spans r.y +/- 0.035. Twice this was
             * wrong by a couple of centimetres, and both times the result was
             * not a slightly-wrong fitting but a completely black one: these
             * hang 0.45 m above eye level, so the run is seen at about three
             * degrees and what you get is whichever surface is taller in
             * section. The housing was winning 70 mm to 27.
             */}
            <mesh position={[r.x, r.y + 0.05, cz]} castShadow>
              <boxGeometry args={[0.1, 0.03, len]} />
              <primitive object={M.matteBlack} attach="material" />
            </mesh>
            {[r.z0 + 0.4, cz, r.z1 - 0.4].map((z, j) => (
              <mesh key={j} position={[r.x, (r.y + WS.h) / 2 + 0.1, z]}>
                <cylinderGeometry args={[0.006, 0.006, WS.h - r.y - 0.1, 6]} />
                <primitive object={M.matteBlack} attach="material" />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* Counter pendants. */}
      {WS_PLAN.counterPendants.map((z, i) => (
        <group key={i} position={[WS_PLAN.counter.x - 0.35, 0, z]}>
          <mesh position={[0, 2.08, 0]} castShadow>
            <coneGeometry args={[0.17, 0.26, 20, 1, true]} />
            <primitive object={M.matteBlack} attach="material" />
          </mesh>
          <mesh position={[0, (2.2 + WS.h) / 2, 0]}>
            <cylinderGeometry args={[0.005, 0.005, WS.h - 2.2, 6]} />
            <primitive object={M.matteBlack} attach="material" />
          </mesh>
        </group>
      ))}

      {/* Ceiling fans. */}
      {WS_PLAN.fans.map((f, i) => (
        <Fan key={i} x={f.x} z={f.z} speed={fanSpeed} />
      ))}

      {/* Cassette AC units. */}
      {WS_PLAN.cassettes.map((c, i) => (
        <group key={i} position={[c.x, WS.h - 0.03, c.z]}>
          <mesh>
            <boxGeometry args={[0.84, 0.06, 0.84]} />
            <primitive object={M.ceiling} attach="material" />
          </mesh>
          <mesh position={[0, -0.032, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.6, 0.6]} />
            <primitive object={M.housing} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function Workspace3D({
  blinds,
  view,
  displayOn,
  screenContent,
  fanSpeed,
}: {
  blinds: ShadeState;
  view: THREE.Texture;
  displayOn: boolean;
  screenContent: ScreenContent;
  fanSpeed: number;
}) {
  return (
    <group>
      <Surfaces />
      <Shell />
      <Glazing sheer={blinds.sheer} blackout={blinds.blackout} view={view} />
      {WS_PLAN.benches.map((b, i) => (
        <Bench key={i} x={b.x} />
      ))}
      <MeetingRoom displayOn={displayOn} content={screenContent} />
      <BreakArea />
      <Plants />
      <Housings fanSpeed={fanSpeed} />
    </group>
  );
}
