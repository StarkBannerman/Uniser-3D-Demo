"use client";

/**
 * Den / Media Room — geometry only.
 *
 * Built to the client's den sheet. Laid out as a one-point room: the screen
 * wall square ahead, the display wall down the left with its shelving,
 * artwork and work zone, and the curtains down the right. That is the only
 * arrangement in which both side walls are in shot at once, and this room needs
 * it — the curtains closing is a stage of its headline scene, and the shelving
 * is what the accent layer exists to light.
 *
 *              z = 0   +-------------------------+
 *   shelves,           |     motorised screen    |
 *   artwork,           |                         | curtains
 *   workstation        |        seating          | x = DN.w
 *   x = 0              |                         |
 *                      +------------^------------+
 *                               camera, high z
 *
 * Coordinates in metres.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBox } from "@react-three/drei";
import { makeArtTexture, makeCurtainGeometry, makeScreenTexture } from "./geometry";

export const DN = {
  /** Across the room. The curtain wall is at x = w. */
  w: 7.6,
  /** Away from the camera. The screen wall is at z = 0. */
  d: 9.5,
  h: 3.0,
  soffit: { depth: 0.55, drop: 0.2 },
} as const;

export const DN_COVE_Y = DN.h - DN.soffit.drop + 0.03;
/** Glazed opening in the x = DN.w wall, behind the curtains. */
export const DN_WINDOW = { z0: 0.7, z1: 7.2, y0: 0.06, y1: DN.h - 0.5 };

export const DN_PLAN = {
  /**
   * The projection screen, and the case it rolls into.
   *
   * `y1` is the head — where the roller sits — and `drop` is how far the fabric
   * travels. The engine animates that from the device's `screen` value, at the
   * motor's own speed.
   */
  screen: { x: 3.8, w: 3.3, y1: 2.62, drop: 1.9 },
  /** Media console under the screen, with the colour wash beneath it. */
  console: { x: 3.8, w: 4.6, d: 0.52, h: 0.42 },
  /** Floorstanders either side. Deliberately large, as on the sheet. */
  speakers: [{ x: 1.15 }, { x: 6.45 }],
  /** Ceiling-mounted projector, throwing at the screen. */
  projector: { x: 3.8, z: 5.9, y: 2.78 },
  /** Built-in shelving on the left wall. */
  shelves: { z0: 2.2, z1: 5.6, y0: 0.35, y1: 2.5, bays: 4 },
  /** Framed artwork on the left wall, beyond the shelving. */
  art: { z: 6.9, y: 1.6, w: 1.35, h: 1.85 },
  /** Work zone against the left wall, nearest the screen. */
  desk: { z: 1.35, w: 1.9 },
  /** Slatted timber panel between the work zone and the shelving. */
  slats: { z0: 0.35, z1: 2.05 },
  /** Acoustic panels flanking the screen, on the projection wall. */
  acoustic: [{ x0: 0.1, x1: 7.5 }],
  /** Vertical RGB battens: two on the left wall, two flanking the screen. */
  battens: [
    { x: 0.04, z: 2.1, along: "z" as const },
    { x: 0.04, z: 5.7, along: "z" as const },
    { x: 1.72, z: 0.05, along: "x" as const },
    { x: 5.88, z: 0.05, along: "x" as const },
  ],
  /** Seating group origin and rotation. */
  seating: { x: 3.7, z: 4.5, rot: 0.1 },
  /** Lounge chair and its ottoman, by the curtains. */
  lounge: { x: 6.4, z: 4.7 },
} as const;

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

/**
 * Darker than the living room throughout.
 *
 * A media room is a dark room: pale walls bounce projector light straight back
 * at the screen and wash the image out, which is why real ones are finished in
 * charcoal and walnut. Keeping the living room's ivory here would have made
 * every scene read as the same house with the lights turned down.
 */
const M = {
  /**
   * Charcoal, not black.
   *
   * The first pass went too far the other way: at those values the room had
   * almost no bounce, so everything more than a metre from a fixture fell to
   * nothing and the work zone and the speakers simply were not visible. A real
   * media room is dark in tone but still reads — it is the *projection wall*
   * that wants to be near-black, not the whole box.
   */
  ceiling: new THREE.MeshStandardMaterial({ color: "#474138", roughness: 0.96 }),
  soffit: new THREE.MeshStandardMaterial({ color: "#453f38", roughness: 0.93 }),
  wall: new THREE.MeshStandardMaterial({ color: "#5a524a", roughness: 0.93 }),
  floor: new THREE.MeshStandardMaterial({
    color: "#5c4c3e",
    roughness: 0.4,
    metalness: 0.02,
  }),
  rug: new THREE.MeshStandardMaterial({ color: "#6d665c", roughness: 1 }),
  joinery: new THREE.MeshStandardMaterial({ color: "#54432f", roughness: 0.5 }),
  joineryBack: new THREE.MeshStandardMaterial({ color: "#241c16", roughness: 0.85 }),
  metal: new THREE.MeshStandardMaterial({
    color: "#26282c",
    roughness: 0.4,
    metalness: 0.75,
  }),
  brass: new THREE.MeshStandardMaterial({
    color: "#9d7f4e",
    roughness: 0.32,
    metalness: 0.85,
  }),
  /** Projection fabric: matt, near-white, and deliberately not emissive when
      the projector is off — a dead screen is a grey sheet, not a black hole. */
  screenFabric: new THREE.MeshStandardMaterial({
    color: "#cfcdc8",
    roughness: 0.94,
    metalness: 0,
    side: THREE.DoubleSide,
  }),
  speaker: new THREE.MeshStandardMaterial({ color: "#232529", roughness: 0.45 }),
  cone: new THREE.MeshStandardMaterial({ color: "#2b2d31", roughness: 0.7 }),
  sofa: new THREE.MeshPhysicalMaterial({
    color: "#6d6a64",
    roughness: 0.96,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color("#b6b1a7"),
  }),
  sofaSeat: new THREE.MeshPhysicalMaterial({
    color: "#78746d",
    roughness: 0.95,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color("#c2bcb1"),
  }),
  /** The red cushions are the one warm note on the sheet, and they matter:
      a room this dark needs a single saturated accent or it reads as grey. */
  cushion: new THREE.MeshPhysicalMaterial({
    color: "#6d2028",
    roughness: 0.92,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color("#b5606a"),
  }),
  leather: new THREE.MeshPhysicalMaterial({
    color: "#1d1a18",
    roughness: 0.45,
    metalness: 0,
    sheen: 0.4,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color("#6a625c"),
  }),
  walnut: new THREE.MeshStandardMaterial({ color: "#5c4028", roughness: 0.42 }),
  marble: new THREE.MeshStandardMaterial({
    color: "#26241f",
    roughness: 0.16,
    metalness: 0.08,
  }),
  drape: new THREE.MeshPhysicalMaterial({
    color: "#3f3a35",
    roughness: 0.92,
    metalness: 0,
    sheen: 0.6,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color("#8a8076"),
    side: THREE.DoubleSide,
  }),
  sheer: new THREE.MeshPhysicalMaterial({
    color: "#b9b6b0",
    roughness: 0.6,
    transparent: true,
    opacity: 0.55,
    transmission: 0.45,
    thickness: 0.02,
    side: THREE.DoubleSide,
  }),
  glass: new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: 0.05,
    transparent: true,
    opacity: 0.07,
    side: THREE.DoubleSide,
  }),
  foliage: new THREE.MeshStandardMaterial({ color: "#39512f", roughness: 0.84 }),
  pot: new THREE.MeshStandardMaterial({ color: "#2f2c28", roughness: 0.7 }),
};

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

function Shell() {
  const { w, d, h, soffit } = DN;
  const soffitY = h - soffit.drop / 2;

  return (
    <group>
      <mesh position={[w / 2, 0, d / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <primitive object={M.floor} attach="material" />
      </mesh>
      <mesh position={[w / 2, h, d / 2]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <primitive object={M.ceiling} attach="material" />
      </mesh>
      <mesh position={[0, h / 2, d / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      <mesh position={[w / 2, h / 2, d]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      {/* The projection wall is the one surface that genuinely wants to be
          near-black: a pale wall behind a screen bounces light straight back
          into the image and washes it out. */}
      <mesh position={[w / 2, h / 2, 0.01]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color="#2a2724" roughness={0.95} />
      </mesh>

      {/* Solid wall around the glazed opening. */}
      {[
        { pos: [w, h / 2, DN_WINDOW.z0 / 2], size: [DN_WINDOW.z0, h] },
        { pos: [w, h / 2, (DN_WINDOW.z1 + d) / 2], size: [d - DN_WINDOW.z1, h] },
        { pos: [w, (DN_WINDOW.y1 + h) / 2, d / 2], size: [d, h - DN_WINDOW.y1] },
      ].map((p, i) => (
        <mesh
          key={`reveal-${i}`}
          position={p.pos as [number, number, number]}
          rotation={[0, -Math.PI / 2, 0]}
          receiveShadow
        >
          <planeGeometry args={p.size as [number, number]} />
          <primitive object={M.wall} attach="material" />
        </mesh>
      ))}

      {[
        { pos: [w / 2, soffitY, soffit.depth / 2], size: [w, soffit.drop, soffit.depth] },
        { pos: [w / 2, soffitY, d - soffit.depth / 2], size: [w, soffit.drop, soffit.depth] },
        { pos: [soffit.depth / 2, soffitY, d / 2], size: [soffit.depth, soffit.drop, d] },
        { pos: [w - soffit.depth / 2, soffitY, d / 2], size: [soffit.depth, soffit.drop, d] },
      ].map((s, i) => (
        <mesh
          key={`sof-${i}`}
          position={s.pos as [number, number, number]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={s.size as [number, number, number]} />
          <primitive object={M.soffit} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Left wall: slats, work zone, shelving, artwork                      */
/* ------------------------------------------------------------------ */

const SLAT = { w: 0.05, d: 0.022, gap: 0.028 };

function SlatPanel() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { z0, z1 } = DN_PLAN.slats;
  const height = DN.h - DN.soffit.drop;

  const { count, pitch } = useMemo(() => {
    const p = SLAT.w + SLAT.gap;
    return { count: Math.floor((z1 - z0) / p), pitch: p };
  }, [z0, z1]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const colour = new THREE.Color();
    const a = new THREE.Color("#6b4d33");
    const b = new THREE.Color("#4e3824");
    for (let i = 0; i < count; i++) {
      m.makeTranslation(SLAT.d / 2, height / 2, z0 + SLAT.w / 2 + i * pitch);
      mesh.setMatrixAt(i, m);
      const t = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
      colour.copy(a).lerp(b, t).multiplyScalar(0.92 + t * 0.16);
      mesh.setColorAt(i, colour);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [count, pitch, z0, height]);

  return (
    <group>
      <mesh
        position={[0.004, height / 2, (z0 + z1) / 2]}
        rotation={[0, Math.PI / 2, 0]}
        receiveShadow
      >
        <planeGeometry args={[z1 - z0, height]} />
        <primitive object={M.joineryBack} attach="material" />
      </mesh>
      <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow receiveShadow>
        <boxGeometry args={[SLAT.d, height, SLAT.w]} />
        <meshStandardMaterial color="#ffffff" roughness={0.52} metalness={0} />
      </instancedMesh>
    </group>
  );
}

/**
 * Built-in shelving, the artwork, and the work zone.
 *
 * The shelves carry objects — a model car, a helmet, books, plants — because
 * the accent layer is argued for by switching it off and watching the wall go
 * flat, and that needs something in the recess to stop being revealed.
 */
function DisplayWall({ deskOn }: { deskOn: boolean }) {
  const sh = DN_PLAN.shelves;
  const a = DN_PLAN.art;
  const dk = DN_PLAN.desk;
  const bayH = (sh.y1 - sh.y0) / sh.bays;
  const art = useMemo(() => makeArtTexture(23), []);
  const artMat = useMemo(
    () => new THREE.MeshStandardMaterial({ map: art, roughness: 0.8 }),
    [art],
  );

  return (
    <group>
      {/* Shelving carcass, recessed into the wall. */}
      <mesh
        position={[0.02, (sh.y0 + sh.y1) / 2, (sh.z0 + sh.z1) / 2]}
        rotation={[0, Math.PI / 2, 0]}
        receiveShadow
      >
        <planeGeometry args={[sh.z1 - sh.z0, sh.y1 - sh.y0]} />
        <primitive object={M.joineryBack} attach="material" />
      </mesh>
      {Array.from({ length: sh.bays + 1 }, (_, i) => (
        <mesh
          key={`shelf-${i}`}
          position={[0.16, sh.y0 + i * bayH, (sh.z0 + sh.z1) / 2]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.32, 0.03, sh.z1 - sh.z0]} />
          <primitive object={M.joinery} attach="material" />
        </mesh>
      ))}
      {[sh.z0, (sh.z0 + sh.z1) / 2, sh.z1].map((z, i) => (
        <mesh key={`div-${i}`} position={[0.16, (sh.y0 + sh.y1) / 2, z]} castShadow>
          <boxGeometry args={[0.32, sh.y1 - sh.y0, 0.035]} />
          <primitive object={M.joinery} attach="material" />
        </mesh>
      ))}

      {/* What is on the shelves. */}
      {Array.from({ length: sh.bays }, (_, i) => {
        const y = sh.y0 + i * bayH + 0.03;
        const z = sh.z0 + 0.45 + (i % 2) * 0.35;
        return (
          <group key={`obj-${i}`}>
            {/* A run of books. */}
            {Array.from({ length: 6 }, (_, j) => (
              <mesh
                key={`bk-${j}`}
                position={[0.14, y + 0.13, z + j * 0.055]}
                castShadow
              >
                <boxGeometry args={[0.16, 0.24 + (j % 3) * 0.03, 0.045]} />
                <meshStandardMaterial
                  color={["#5c2b28", "#2f3a46", "#53482f", "#3a2f3f"][j % 4]}
                  roughness={0.85}
                />
              </mesh>
            ))}
            {i === 1 && (
              /* Model car, as on the sheet. */
              <group position={[0.16, y + 0.07, sh.z1 - 0.55]}>
                <mesh castShadow>
                  <boxGeometry args={[0.13, 0.07, 0.34]} />
                  <meshStandardMaterial color="#8c1d1d" roughness={0.3} metalness={0.3} />
                </mesh>
                <mesh position={[0, 0.06, -0.02]} castShadow>
                  <boxGeometry args={[0.1, 0.05, 0.14]} />
                  <meshStandardMaterial color="#6d1616" roughness={0.3} metalness={0.3} />
                </mesh>
              </group>
            )}
            {i === 2 && (
              /* Helmet. */
              <mesh position={[0.16, y + 0.13, sh.z1 - 0.5]} castShadow>
                <sphereGeometry args={[0.13, 16, 14]} />
                <meshStandardMaterial color="#b3b0a8" roughness={0.28} metalness={0.2} />
              </mesh>
            )}
            {i === 3 && (
              <group position={[0.16, y + 0.12, sh.z1 - 0.5]}>
                <mesh castShadow>
                  <cylinderGeometry args={[0.07, 0.09, 0.16, 16]} />
                  <primitive object={M.pot} attach="material" />
                </mesh>
                <mesh position={[0, 0.16, 0]} castShadow>
                  <sphereGeometry args={[0.15, 12, 10]} />
                  <primitive object={M.foliage} attach="material" />
                </mesh>
              </group>
            )}
          </group>
        );
      })}

      {/* Framed artwork. */}
      <mesh position={[0.03, a.y, a.z]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[a.w + 0.1, a.h + 0.1]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      <mesh position={[0.05, a.y, a.z]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[a.w, a.h]} />
        <primitive object={artMat} attach="material" />
      </mesh>

      {/* Work zone: desk, monitor, chair. The den is a work room before it is
          a cinema, and the sheet shows the station plainly. */}
      <group position={[0, 0, dk.z]}>
        <mesh position={[0.36, 0.72, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.72, 0.05, dk.w]} />
          <primitive object={M.walnut} attach="material" />
        </mesh>
        {[-dk.w / 2 + 0.1, dk.w / 2 - 0.1].map((dz) => (
          <mesh key={`dl-${dz}`} position={[0.36, 0.36, dz]} castShadow>
            <boxGeometry args={[0.6, 0.68, 0.04]} />
            <primitive object={M.metal} attach="material" />
          </mesh>
        ))}
        {/* Monitor. */}
        <mesh position={[0.22, 0.79, 0]} castShadow>
          <boxGeometry args={[0.16, 0.06, 0.24]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
        <mesh position={[0.2, 0.96, 0]} castShadow>
          <boxGeometry args={[0.04, 0.3, 0.06]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
        <mesh position={[0.24, 1.18, 0]} rotation={[0, 0.12, 0]} castShadow>
          <boxGeometry args={[0.04, 0.42, 0.78]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
        <mesh position={[0.265, 1.18, 0]} rotation={[0, 0.12, 0]}>
          <planeGeometry args={[0.72, 0.38]} />
          <meshStandardMaterial
            color={deskOn ? "#0b1520" : "#111315"}
            emissive={new THREE.Color(deskOn ? "#4e7fb4" : "#000000")}
            emissiveIntensity={deskOn ? 1.1 : 0}
            roughness={0.3}
            toneMapped={false}
          />
        </mesh>
        {/* Keyboard and a task chair. */}
        <mesh position={[0.5, 0.755, 0]} castShadow>
          <boxGeometry args={[0.16, 0.015, 0.42]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
        <group position={[1.15, 0, 0]}>
          <mesh position={[0, 0.46, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.5, 0.08, 0.52]} />
            <primitive object={M.leather} attach="material" />
          </mesh>
          <mesh position={[-0.2, 0.75, 0]} rotation={[0, 0, 0.12]} castShadow>
            <boxGeometry args={[0.08, 0.56, 0.48]} />
            <primitive object={M.leather} attach="material" />
          </mesh>
          <mesh position={[0, 0.22, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.44, 12]} />
            <primitive object={M.metal} attach="material" />
          </mesh>
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.3, 0.3, 0.05, 20]} />
            <primitive object={M.metal} attach="material" />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Screen wall                                                         */
/* ------------------------------------------------------------------ */

/**
 * Acoustic panelling either side of the screen.
 *
 * Without it the projection wall was a black void filling the middle of the
 * frame — correct in tone and completely dead. Every real media room has fabric
 * or slatted absorbers on that wall, so this is not decoration bolted on to
 * fill space: it is the treatment the wall would actually have, and it gives
 * the RGB battens beside it something to graze.
 *
 * It runs the full width, behind where the screen drops as well as beside it.
 * With the screen up — which is most of Work and all of All Off — the middle of
 * that wall is the middle of the frame, and panelling only the edges left the
 * dead area exactly where it mattered.
 */
function AcousticPanels() {
  const height = DN.h - DN.soffit.drop;
  return (
    <group>
      {DN_PLAN.acoustic.map((p, i) => {
        const w = p.x1 - p.x0;
        const count = Math.floor(w / 0.105);
        return (
          <group key={`ac-${i}`}>
            <mesh position={[(p.x0 + p.x1) / 2, height / 2, 0.03]} receiveShadow>
              <planeGeometry args={[w, height]} />
              <primitive object={M.joineryBack} attach="material" />
            </mesh>
            {Array.from({ length: count }, (_, j) => (
              <mesh
                key={`fin-${j}`}
                position={[p.x0 + 0.05 + j * 0.105, height / 2, 0.055]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[0.05, height, 0.055]} />
                <primitive object={M.joinery} attach="material" />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

/**
 * The motorised screen, its case, the console and the speakers.
 *
 * `screen` is 0..100 from the device, and the fabric is scaled by it. The drop
 * is genuine travel — `screenTravelMs` belongs to the motor, and a scene cannot
 * hurry it — which is why Movie waits seven seconds before firing the projector.
 */
function ScreenWall({
  screen,
  projectorOn,
  audioLevel,
}: {
  screen: number;
  projectorOn: boolean;
  audioLevel: number;
}) {
  const sc = DN_PLAN.screen;
  const co = DN_PLAN.console;
  const drop = Math.max(0, Math.min(1, screen / 100)) * sc.drop;
  const picture = useMemo(() => makeScreenTexture(), []);
  const pictureMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: picture,
        emissiveMap: picture,
        emissive: new THREE.Color("#ffffff"),
        emissiveIntensity: 1.0,
        roughness: 0.4,
        toneMapped: false,
      }),
    [picture],
  );

  return (
    <group>
      {/* Case, always present — a screen that vanishes when it is up is the
          giveaway this whole approach exists to avoid. */}
      <mesh position={[sc.x, sc.y1 + 0.08, 0.16]} castShadow>
        <boxGeometry args={[sc.w + 0.3, 0.16, 0.18]} />
        <primitive object={M.metal} attach="material" />
      </mesh>

      {drop > 0.02 && (
        <group>
          <mesh position={[sc.x, sc.y1 - drop / 2, 0.14]} receiveShadow>
            <planeGeometry args={[sc.w, drop]} />
            <primitive object={M.screenFabric} attach="material" />
          </mesh>
          {/* The picture only exists when the projector is running. */}
          {projectorOn && drop > sc.drop * 0.92 && (
            <mesh position={[sc.x, sc.y1 - drop / 2, 0.145]}>
              <planeGeometry args={[sc.w - 0.04, drop - 0.04]} />
              <primitive object={pictureMat} attach="material" />
            </mesh>
          )}
          {/* Weighted bar at the bottom edge. */}
          <mesh position={[sc.x, sc.y1 - drop, 0.14]}>
            <boxGeometry args={[sc.w, 0.035, 0.05]} />
            <primitive object={M.metal} attach="material" />
          </mesh>
        </group>
      )}

      {/* Media console. */}
      <mesh position={[co.x, co.h / 2 + 0.12, co.d / 2 + 0.02]} castShadow receiveShadow>
        <boxGeometry args={[co.w, co.h, co.d]} />
        <primitive object={M.joinery} attach="material" />
      </mesh>
      {[-1.6, -0.53, 0.53, 1.6].map((dx) => (
        <mesh key={`cd-${dx}`} position={[co.x + dx, co.h / 2 + 0.12, co.d + 0.03]}>
          <boxGeometry args={[1.0, co.h - 0.1, 0.02]} />
          <primitive object={M.walnut} attach="material" />
        </mesh>
      ))}

      {/* Floorstanders. Large on purpose — on the sheet they are nearly
          shoulder height and they are the first thing a client points at. */}
      {DN_PLAN.speakers.map((sp, i) => (
        <group key={`spk-${i}`} position={[sp.x, 0, 0.36]}>
          <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.38, 1.4, 0.36]} />
            <primitive object={M.speaker} attach="material" />
          </mesh>
          <mesh position={[0, 0.025, 0]}>
            <boxGeometry args={[0.46, 0.05, 0.44]} />
            <primitive object={M.metal} attach="material" />
          </mesh>
          {[0.36, 0.72, 1.04, 1.26].map((y, j) => (
            <mesh
              key={`drv-${j}`}
              position={[0, y, 0.19 + audioLevel * (0.018 - j * 0.004)]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry
                args={[0.11 - j * 0.02, 0.11 - j * 0.02, 0.02, 20]}
              />
              <primitive object={M.cone} attach="material" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Ceiling-mounted projector, with a visible lens when it is running. */
function Projector({ on }: { on: boolean }) {
  const p = DN_PLAN.projector;
  return (
    <group position={[p.x, 0, p.z]}>
      <mesh position={[0, (DN.h + p.y) / 2 + 0.06, 0]}>
        <cylinderGeometry args={[0.022, 0.022, DN.h - p.y - 0.12, 10]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      <mesh position={[0, DN.h - 0.02, 0]}>
        <boxGeometry args={[0.18, 0.04, 0.18]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      <mesh position={[0, p.y, 0]} castShadow>
        <boxGeometry args={[0.44, 0.17, 0.38]} />
        <primitive object={M.speaker} attach="material" />
      </mesh>
      <mesh position={[0, p.y, -0.21]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.065, 0.065, 0.06, 20]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      {on && (
        <mesh position={[0, p.y, -0.245]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.05, 20]} />
          <meshStandardMaterial
            color="#000000"
            emissive={new THREE.Color("#cfe0ff")}
            emissiveIntensity={3}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Glazing                                                             */
/* ------------------------------------------------------------------ */

export interface DenCurtains {
  sheer: number;
  blackout: number;
}

const PANELS = 5;
const PANEL_OVERLAP = 0.05;

function Glazing({
  sheer,
  blackout,
  view,
}: DenCurtains & { view: THREE.Texture }) {
  const span = DN_WINDOW.z1 - DN_WINDOW.z0;
  const height = DN_WINDOW.y1 - DN_WINDOW.y0;
  const seg = span / PANELS;
  const viewMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({ map: view, toneMapped: false, side: THREE.DoubleSide }),
    [view],
  );

  const layers = [
    { key: "blackout", pos: blackout, mat: M.drape, x: DN.w - 0.2 },
    { key: "sheer", pos: sheer, mat: M.sheer, x: DN.w - 0.34 },
  ];

  return (
    <group>
      <mesh
        position={[DN.w + 7, DN.h / 2 + 0.8, DN.d / 2]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[28, 13]} />
        <primitive object={viewMat} attach="material" />
      </mesh>
      <mesh
        position={[DN.w - 0.03, (DN_WINDOW.y0 + DN_WINDOW.y1) / 2, DN.d / 2]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[span, height]} />
        <primitive object={M.glass} attach="material" />
      </mesh>
      <mesh position={[DN.w - 0.04, DN_WINDOW.y0, DN.d / 2]}>
        <boxGeometry args={[0.12, 0.12, span + 0.2]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      {[DN_WINDOW.z0, DN.d / 2, DN_WINDOW.z1].map((z, i) => (
        <mesh
          key={`mull-${i}`}
          position={[DN.w - 0.04, (DN_WINDOW.y0 + DN_WINDOW.y1) / 2, z]}
        >
          <boxGeometry args={[0.09, height, 0.07]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
      <mesh position={[DN.w - 0.27, DN_WINDOW.y1 + 0.04, DN.d / 2]}>
        <boxGeometry args={[0.24, 0.04, span + 0.2]} />
        <primitive object={M.metal} attach="material" />
      </mesh>

      {layers.map((layer) => {
        const gather = 1 - Math.max(0, Math.min(1, layer.pos / 100));
        return Array.from({ length: PANELS }, (_, i) => {
          const geo = makeCurtainGeometry({
            length: seg + PANEL_OVERLAP,
            height,
            folds: 5,
            foldDepth: 0.05,
            gather,
          });
          const toStart = i < PANELS / 2;
          const z = toStart
            ? DN_WINDOW.z0 + i * seg - PANEL_OVERLAP / 2
            : DN_WINDOW.z0 + (i + 1) * seg + PANEL_OVERLAP / 2;
          return (
            <mesh
              key={`${layer.key}-${i}`}
              geometry={geo}
              material={layer.mat}
              position={[layer.x, DN_WINDOW.y0, z]}
              scale={[1, 1, toStart ? 1 : -1]}
              castShadow={layer.key === "blackout"}
            />
          );
        });
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Seating                                                             */
/* ------------------------------------------------------------------ */

function Seating() {
  const st = DN_PLAN.seating;
  const lo = DN_PLAN.lounge;

  return (
    <group>
      <group position={[st.x, 0, st.z]} rotation={[0, st.rot, 0]}>
        <mesh position={[0, 0.006, 0.1]} receiveShadow>
          <boxGeometry args={[5.2, 0.012, 4.2]} />
          <primitive object={M.rug} attach="material" />
        </mesh>

        {/* Sectional facing the screen, with a chaise returning to the left. */}
        <mesh position={[0, 0.05, 0.55]} receiveShadow>
          <boxGeometry args={[3.5, 0.1, 1.0]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
        <RoundedBox
          args={[3.6, 0.32, 1.1]}
          radius={0.05}
          smoothness={3}
          position={[0, 0.26, 0.55]}
          castShadow
          receiveShadow
        >
          <primitive object={M.sofa} attach="material" />
        </RoundedBox>
        <RoundedBox
          args={[3.6, 0.6, 0.24]}
          radius={0.08}
          smoothness={3}
          position={[0, 0.61, 1.03]}
          rotation={[0.06, 0, 0]}
          castShadow
          receiveShadow
        >
          <primitive object={M.sofa} attach="material" />
        </RoundedBox>
        {[-1.2, 0, 1.2].map((x) => (
          <group key={`seat-${x}`}>
            <RoundedBox
              args={[1.14, 0.2, 0.98]}
              radius={0.075}
              smoothness={3}
              position={[x, 0.51, 0.5]}
              castShadow
              receiveShadow
            >
              <primitive object={M.sofaSeat} attach="material" />
            </RoundedBox>
            <RoundedBox
              args={[1.12, 0.46, 0.2]}
              radius={0.08}
              smoothness={3}
              position={[x, 0.73, 0.88]}
              rotation={[-0.14, 0, 0]}
              castShadow
            >
              <primitive object={M.sofaSeat} attach="material" />
            </RoundedBox>
          </group>
        ))}
        {/* Chaise returning on the left. */}
        <RoundedBox
          args={[1.1, 0.32, 1.9]}
          radius={0.05}
          smoothness={3}
          position={[-2.15, 0.26, -0.3]}
          castShadow
          receiveShadow
        >
          <primitive object={M.sofa} attach="material" />
        </RoundedBox>
        <RoundedBox
          args={[0.24, 0.6, 1.9]}
          radius={0.08}
          smoothness={3}
          position={[-2.6, 0.61, -0.3]}
          castShadow
          receiveShadow
        >
          <primitive object={M.sofa} attach="material" />
        </RoundedBox>
        <RoundedBox
          args={[0.98, 0.2, 1.74]}
          radius={0.075}
          smoothness={3}
          position={[-2.12, 0.51, -0.3]}
          castShadow
          receiveShadow
        >
          <primitive object={M.sofaSeat} attach="material" />
        </RoundedBox>

        {/* The red cushions. One saturated accent is what stops a charcoal
            room reading as grey. */}
        {[
          { p: [-1.5, 0.79, 0.86], r: [0.2, 0.3, 0.28] },
          { p: [-0.55, 0.79, 0.86], r: [0.16, -0.26, -0.22] },
          { p: [-2.3, 0.79, -0.9], r: [0.18, 1.2, 0.3] },
        ].map((c, i) => (
          <RoundedBox
            key={`cu-${i}`}
            args={[0.44, 0.44, 0.15]}
            radius={0.06}
            smoothness={3}
            position={c.p as [number, number, number]}
            rotation={c.r as [number, number, number]}
            castShadow
          >
            <primitive object={M.cushion} attach="material" />
          </RoundedBox>
        ))}

        {/* Round marble coffee table, with a control tablet on a side table
            beside the chaise — the sheet shows one and it is the point. */}
        <group position={[0.1, 0, -0.9]}>
          <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.7, 0.7, 0.1, 36]} />
            <primitive object={M.marble} attach="material" />
          </mesh>
          <mesh position={[0, 0.17, 0]} castShadow>
            <cylinderGeometry args={[0.32, 0.4, 0.34, 28]} />
            <primitive object={M.marble} attach="material" />
          </mesh>
          <mesh position={[0.18, 0.44, 0.1]} castShadow>
            <cylinderGeometry args={[0.18, 0.18, 0.08, 24]} />
            <primitive object={M.joinery} attach="material" />
          </mesh>
        </group>
        <group position={[-2.55, 0, -1.6]}>
          <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.3, 0.3, 0.05, 24]} />
            <primitive object={M.marble} attach="material" />
          </mesh>
          <mesh position={[0, 0.22, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 0.42, 12]} />
            <primitive object={M.metal} attach="material" />
          </mesh>
          {/* The control tablet, propped up. */}
          <mesh position={[0, 0.56, 0]} rotation={[-0.35, 0.4, 0]} castShadow>
            <boxGeometry args={[0.24, 0.17, 0.012]} />
            <primitive object={M.metal} attach="material" />
          </mesh>
          <mesh position={[0, 0.561, 0.008]} rotation={[-0.35, 0.4, 0]}>
            <planeGeometry args={[0.21, 0.145]} />
            <meshStandardMaterial
              color="#0d1218"
              emissive={new THREE.Color("#3f6f9e")}
              emissiveIntensity={1.4}
              roughness={0.3}
              toneMapped={false}
            />
          </mesh>
        </group>
      </group>

      {/* Lounge chair and ottoman by the curtains. */}
      <group position={[lo.x, 0, lo.z]} rotation={[0, -2.35, 0]}>
        <RoundedBox
          args={[0.82, 0.2, 0.78]}
          radius={0.075}
          smoothness={3}
          position={[0, 0.4, 0]}
          castShadow
          receiveShadow
        >
          <primitive object={M.leather} attach="material" />
        </RoundedBox>
        <RoundedBox
          args={[0.82, 0.6, 0.2]}
          radius={0.09}
          smoothness={3}
          position={[0, 0.66, -0.32]}
          rotation={[-0.24, 0, 0]}
          castShadow
          receiveShadow
        >
          <primitive object={M.leather} attach="material" />
        </RoundedBox>
        {[-0.36, 0.36].map((dx) => (
          <RoundedBox
            key={`arm-${dx}`}
            args={[0.14, 0.24, 0.66]}
            radius={0.06}
            smoothness={3}
            position={[dx, 0.5, 0]}
            castShadow
          >
            <primitive object={M.leather} attach="material" />
          </RoundedBox>
        ))}
        <mesh position={[0, 0.16, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 0.3, 12]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.34, 0.34, 0.04, 20]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
        <RoundedBox
          args={[0.6, 0.2, 0.5]}
          radius={0.07}
          smoothness={3}
          position={[0, 0.34, 0.82]}
          castShadow
          receiveShadow
        >
          <primitive object={M.leather} attach="material" />
        </RoundedBox>
      </group>

      {/* Planting, which the sheet uses at both ends of the screen wall. */}
      {[
        { x: 0.62, z: 8.4 },
        { x: 6.95, z: 1.0 },
      ].map((p, i) => (
        <group key={`plant-${i}`} position={[p.x, 0, p.z]}>
          <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.22, 0.17, 0.4, 18]} />
            <primitive object={M.pot} attach="material" />
          </mesh>
          {Array.from({ length: 8 }, (_, j) => (
            <mesh
              key={`lf-${j}`}
              position={[
                Math.sin(j * 1.8 + i) * 0.2,
                0.62 + (j % 4) * 0.2,
                Math.cos(j * 1.8 + i) * 0.2,
              ]}
              rotation={[Math.sin(j) * 0.55, j * 1.8, Math.cos(j) * 0.55]}
              castShadow
            >
              <sphereGeometry args={[0.22, 10, 6]} />
              <primitive object={M.foliage} attach="material" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function Den3D({
  curtains,
  view,
  screen,
  projectorOn,
  deskOn,
  audioLevel = 0,
}: {
  curtains: DenCurtains;
  view: THREE.Texture;
  /** 0..100 screen deployment, from the AV device. */
  screen: number;
  projectorOn: boolean;
  deskOn: boolean;
  audioLevel?: number;
}) {
  return (
    <group>
      <Shell />
      <SlatPanel />
      <AcousticPanels />
      <DisplayWall deskOn={deskOn} />
      <ScreenWall screen={screen} projectorOn={projectorOn} audioLevel={audioLevel} />
      <Projector on={projectorOn} />
      <Glazing {...curtains} view={view} />
      <Seating />
    </group>
  );
}
