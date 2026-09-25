"use client";

/**
 * Living Room — geometry only.
 *
 * Laid out to the client's sheet, and the composition is the point. On that
 * drawing the media wall faces you and the glazing runs away to its right, so
 * the television, the stone, the slats and the city at dusk are all in one
 * frame. An earlier pass put the glazing on the wall behind the camera: the
 * room lost both its daylight and its view, and every scene had to be carried
 * by the fixtures alone.
 *
 *              z = 0   +-------------------------+
 *   niches + slats     |  slats |   stone + TV   |
 *                      |                         | glazing
 *                      |         sofa            | x = LR.w
 *   pendants, x ~ 1    |                         |
 *                      +------------^------------+
 *                               camera, high z
 *
 * Self-contained rather than sharing the bedroom's materials, because rooms
 * differ in every surface and a shared palette means one room's tweak silently
 * changes the other.
 *
 * Coordinates in metres.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { MAX_BLADE_STEP_RAD } from "@/lib/sim/fan";
import { makeCurtainGeometry, makeScreenTexture } from "./geometry";

/**
 * Room dimensions.
 *
 * Measured off the client's sheet rather than guessed. On that drawing the
 * sectional's back occupies about a tenth of the frame height and the room runs
 * well past it to a dining zone — which only happens if the camera is nine or
 * ten metres from the far wall and three or four from the sofa. An earlier pass
 * put the whole room in 7.4 x 6.6, so the camera stood two metres behind the
 * sofa and everything in it looked oversized.
 */
export const LR = {
  /** Across the room. The glazing wall is at x = w. */
  w: 8.4,
  /** Away from the camera. The media wall is at z = 0. */
  d: 10.0,
  h: 3.3,
  /** Perimeter step in the ceiling; the cove sits at its inner edge. */
  soffit: { depth: 0.55, drop: 0.2 },
} as const;

export const LR_COVE_Y = LR.h - LR.soffit.drop + 0.03;
/** Glazed opening in the x = LR.w wall. */
/**
 * Glazed opening in the x = LR.w wall.
 *
 * It stops well short of the back of the room: on the sheet the glazing runs
 * beside the media wall and the far end of that side is solid, which is what
 * gives the view somewhere to end.
 */
export const LR_WINDOW = { z0: 0.5, z1: 6.2, y0: 0.06, y1: LR.h - 0.5 };
/** Television, centred on the stone panel of the z = 0 wall. */
export const LR_TV = { x: 5.7, y: 1.52, w: 2.2, h: 1.25 };

/**
 * Where the rest of the client's sheet lands in the room.
 *
 * Each callout on that drawing is a device in the space config, and each needs
 * somewhere real to live. Sharing the coordinates with the light rig keeps a
 * strip and the thing it is supposed to be lighting from drifting apart.
 */
export const LR_PLAN = {
  /** Slatted timber panel, left of the stone. */
  slats: { x0: 0.0, x1: 3.3 },
  /** Book-matched stone, carrying the television. */
  stone: { x0: 3.3, x1: LR.w },
  /** Shelving niches recessed into the slat panel, lit from inside. */
  niche: { x0: 1.15, x1: 2.95, y0: 0.4, y1: 2.5, bays: 3 },
  /** Floorstanders either side of the television. */
  speakers: [{ x: LR_TV.x - 1.75 }, { x: LR_TV.x + 1.75 }],
  /** Pendant cluster, hung over the dining table. */
  pendants: { x: 1.4, z: 1.7 },
  /** Ceiling fan hub, over the seating. */
  fan: { x: 4.1, z: 4.2, y: 2.72 },
  /** Dining table in the middle distance, under the pendants. */
  dining: { x: 1.4, z: 1.7 },
  /** Recessed air-conditioning cassette in the ceiling. */
  ac: { x: 4.4, z: 3.2 },
} as const;

/** Globe positions within the pendant cluster, relative to `LR_PLAN.pendants`. */
export const LR_PENDANT_GLOBES: { dx: number; dz: number; y: number; r: number }[] = [
  { dx: -0.2, dz: -0.42, y: 1.78, r: 0.115 },
  { dx: 0.14, dz: -0.16, y: 2.06, r: 0.095 },
  { dx: -0.1, dz: 0.16, y: 1.9, r: 0.105 },
  { dx: 0.22, dz: 0.46, y: 2.18, r: 0.09 },
  { dx: -0.02, dz: -0.02, y: 1.56, r: 0.125 },
  { dx: 0.26, dz: 0.16, y: 1.7, r: 0.1 },
  { dx: -0.16, dz: 0.5, y: 2.1, r: 0.085 },
];

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

/**
 * Warm timber against cool stone, over a muted floor.
 *
 * The sheet's warmth comes from the slats and the cove, not from the paint. An
 * earlier pass baked warmth into the walls and the floorboards as well, and the
 * tint landed twice — the whole room read as though it were lit by a bonfire.
 */
const M = {
  ceiling: new THREE.MeshStandardMaterial({ color: "#efece6", roughness: 0.96 }),
  soffit: new THREE.MeshStandardMaterial({ color: "#e8e4dc", roughness: 0.93 }),
  wall: new THREE.MeshStandardMaterial({ color: "#ded8cf", roughness: 0.94 }),
  floor: new THREE.MeshStandardMaterial({
    color: "#6b5647",
    roughness: 0.3,
    metalness: 0.03,
  }),
  plank: new THREE.MeshStandardMaterial({ color: "#584639", roughness: 0.42 }),
  rug: new THREE.MeshStandardMaterial({ color: "#c9bfae", roughness: 1 }),
  /**
   * Upholstery, as a sheen material rather than a plain diffuse one.
   *
   * `sheen` is the retroreflective fuzz that woven fabric has at grazing
   * angles — the pale rim you see along the top of a cushion facing a window.
   * Without it, cloth shades exactly like painted board, which is half of why
   * an earlier pass read as stacked cardboard. The other half was sharp
   * corners; see `RoundedBox` below.
   */
  sofa: new THREE.MeshPhysicalMaterial({
    color: "#8d8778",
    roughness: 0.96,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color("#d8d2c4"),
  }),
  sofaSeat: new THREE.MeshPhysicalMaterial({
    color: "#98927f",
    roughness: 0.95,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color("#e2dccd"),
  }),
  cushion: new THREE.MeshPhysicalMaterial({
    color: "#5c6350",
    roughness: 0.93,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.65,
    sheenColor: new THREE.Color("#9aa38a"),
  }),
  marble: new THREE.MeshStandardMaterial({
    color: "#2b2723",
    roughness: 0.14,
    metalness: 0.08,
  }),
  metal: new THREE.MeshStandardMaterial({
    color: "#2f3237",
    roughness: 0.42,
    metalness: 0.7,
  }),
  brass: new THREE.MeshStandardMaterial({
    color: "#b08d55",
    roughness: 0.3,
    metalness: 0.85,
  }),
  consoleBody: new THREE.MeshStandardMaterial({ color: "#efe9df", roughness: 0.6 }),
  consoleWood: new THREE.MeshStandardMaterial({ color: "#6a482c", roughness: 0.48 }),
  tv: new THREE.MeshStandardMaterial({ color: "#0b0c0e", roughness: 0.22 }),
  /** Book-matched stone behind the television. */
  stone: new THREE.MeshStandardMaterial({
    color: "#9a8f80",
    roughness: 0.24,
    metalness: 0.05,
  }),
  slatBack: new THREE.MeshStandardMaterial({ color: "#3a2a1c", roughness: 0.88 }),
  nicheBack: new THREE.MeshStandardMaterial({ color: "#372a1e", roughness: 0.82 }),
  speaker: new THREE.MeshStandardMaterial({ color: "#191a1d", roughness: 0.5 }),
  cone: new THREE.MeshStandardMaterial({ color: "#2e3034", roughness: 0.7 }),
  fanBlade: new THREE.MeshStandardMaterial({ color: "#3b3129", roughness: 0.55 }),
  drape: new THREE.MeshPhysicalMaterial({
    color: "#b9a68d",
    roughness: 0.9,
    sheen: 0.5,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color("#fff0dc"),
    side: THREE.DoubleSide,
  }),
  sheer: new THREE.MeshPhysicalMaterial({
    color: "#eef1f5",
    roughness: 0.6,
    transparent: true,
    opacity: 0.6,
    transmission: 0.42,
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
  foliage: new THREE.MeshStandardMaterial({ color: "#46603f", roughness: 0.82 }),
  pot: new THREE.MeshStandardMaterial({ color: "#d9d3c8", roughness: 0.7 }),
};

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

function Shell() {
  const { w, d, h, soffit } = LR;
  const soffitY = h - soffit.drop / 2;
  const planks = useMemo(() => Array.from({ length: 18 }, (_, i) => 0.22 + i * 0.42), []);

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

      {/* Left wall, and the wall behind the camera. */}
      <mesh position={[0, h / 2, d / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      <mesh position={[w / 2, h / 2, d]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>

      {/* Solid wall around the glazed opening, so the view cannot be seen past
          the ends of the glass. */}
      {[
        { pos: [w, h / 2, LR_WINDOW.z0 / 2], size: [LR_WINDOW.z0, h] },
        { pos: [w, h / 2, (LR_WINDOW.z1 + d) / 2], size: [d - LR_WINDOW.z1, h] },
        { pos: [w, (LR_WINDOW.y1 + h) / 2, d / 2], size: [d, h - LR_WINDOW.y1] },
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

      {/* Perimeter soffit; the cove sits on top of it. */}
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


      {/* Skirting. */}
      <mesh position={[w / 2, 0.05, 0.012]}>
        <boxGeometry args={[w, 0.1, 0.024]} />
        <primitive object={M.consoleBody} attach="material" />
      </mesh>
      <mesh position={[0.012, 0.05, d / 2]}>
        <boxGeometry args={[0.024, 0.1, d]} />
        <primitive object={M.consoleBody} attach="material" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Slatted timber panel                                                */
/* ------------------------------------------------------------------ */

const SLAT = { w: 0.055, d: 0.024, gap: 0.03 };

/**
 * The warm half of the media wall, as instanced battens.
 *
 * Real boxes rather than a normal-mapped plane, because the slats need to
 * self-shadow and catch the accent wash edge-on. That grazing highlight down
 * one side of every batten is most of why the reference reads as an expensive
 * room, and a normal map does not reproduce it under a light this oblique.
 */
function SlatPanel() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { x0, x1 } = LR_PLAN.slats;
  const n = LR_PLAN.niche;
  const height = LR.h - LR.soffit.drop;

  const { count, pitch } = useMemo(() => {
    const p = SLAT.w + SLAT.gap;
    return { count: Math.floor((x1 - x0) / p), pitch: p };
  }, [x0, x1]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const colour = new THREE.Color();
    const a = new THREE.Color("#b08a56");
    const b = new THREE.Color("#8d6a3d");

    for (let i = 0; i < count; i++) {
      const x = x0 + SLAT.w / 2 + i * pitch;
      // The niche is a hole in the panel, so battens crossing it run only from
      // its head up to the soffit.
      const overNiche = x > n.x0 - 0.04 && x < n.x1 + 0.04;
      const bh = overNiche ? height - n.y1 : height;
      const y = overNiche ? n.y1 + bh / 2 : bh / 2;
      scale.set(1, bh / height, 1);
      m.makeScale(scale.x, scale.y, scale.z);
      m.setPosition(x, y, SLAT.d / 2);
      mesh.setMatrixAt(i, m);

      const t = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
      colour.copy(a).lerp(b, t).multiplyScalar(0.92 + t * 0.16);
      mesh.setColorAt(i, colour);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [count, pitch, x0, height, n.x0, n.x1, n.y1]);

  return (
    <group>
      <mesh position={[(x0 + x1) / 2, height / 2, 0.004]} receiveShadow>
        <planeGeometry args={[x1 - x0, height]} />
        <primitive object={M.slatBack} attach="material" />
      </mesh>
      <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow receiveShadow>
        <boxGeometry args={[SLAT.w, height, SLAT.d]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} metalness={0} />
      </instancedMesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Media wall                                                          */
/* ------------------------------------------------------------------ */

/**
 * Stone panel, television, console, niches and speakers.
 *
 * The niches carry objects rather than being empty boxes. Accent lighting is
 * argued for by switching it off and watching the wall go flat, which only
 * works if there is something in the recess to stop being revealed.
 */
function MediaWall({ tvOn, audioLevel }: { tvOn: boolean; audioLevel: number }) {
  const st = LR_PLAN.stone;
  const n = LR_PLAN.niche;
  const bayH = (n.y1 - n.y0) / n.bays;
  const screen = useMemo(() => makeScreenTexture(), []);
  const screenMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: screen,
        emissiveMap: screen,
        emissive: new THREE.Color("#ffffff"),
        // A television is bright, not a lightbox. Pushed much past 1 it clips
        // to flat white in a darkened room, which is exactly where the picture
        // most needs to still look like a picture.
        emissiveIntensity: 1.0,
        roughness: 0.3,
        toneMapped: false,
      }),
    [screen],
  );

  return (
    <group>
      {/* Stone, floor to soffit. */}
      <mesh
        position={[(st.x0 + st.x1) / 2, (LR.h - LR.soffit.drop) / 2, 0.006]}
        receiveShadow
      >
        <planeGeometry args={[st.x1 - st.x0, LR.h - LR.soffit.drop]} />
        <primitive object={M.stone} attach="material" />
      </mesh>

      {/* Recessed niches in the slat panel. */}
      <mesh position={[(n.x0 + n.x1) / 2, (n.y0 + n.y1) / 2, 0.02]} receiveShadow>
        <planeGeometry args={[n.x1 - n.x0, n.y1 - n.y0]} />
        <primitive object={M.nicheBack} attach="material" />
      </mesh>
      {Array.from({ length: n.bays + 1 }, (_, i) => (
        <mesh
          key={`shelf-${i}`}
          position={[(n.x0 + n.x1) / 2, n.y0 + i * bayH, 0.13]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[n.x1 - n.x0, 0.03, 0.26]} />
          <primitive object={M.consoleWood} attach="material" />
        </mesh>
      ))}
      {Array.from({ length: n.bays }, (_, i) => {
        const base = n.y0 + i * bayH + 0.03;
        return (
          <group key={`obj-${i}`}>
            <mesh position={[n.x0 + 0.34, base + 0.13, 0.14]} castShadow>
              <cylinderGeometry args={[0.055, 0.075, 0.24, 14]} />
              <primitive object={M.pot} attach="material" />
            </mesh>
            <mesh position={[n.x0 + 0.68, base + 0.1, 0.14]} castShadow>
              <boxGeometry args={[0.1, 0.19, 0.13]} />
              <primitive object={M.brass} attach="material" />
            </mesh>
            {i !== 1 && (
              <mesh position={[n.x1 - 0.32, base + 0.2, 0.14]} castShadow>
                <sphereGeometry args={[0.11, 12, 10]} />
                <primitive object={M.foliage} attach="material" />
              </mesh>
            )}
          </group>
        );
      })}

      {/* Long low console under the television. */}
      <mesh position={[LR_TV.x, 0.26, 0.28]} castShadow receiveShadow>
        <boxGeometry args={[3.9, 0.4, 0.5]} />
        <primitive object={M.consoleWood} attach="material" />
      </mesh>
      {[-1.4, -0.47, 0.47, 1.4].map((dx) => (
        <mesh key={`door-${dx}`} position={[LR_TV.x + dx, 0.26, 0.535]}>
          <boxGeometry args={[0.86, 0.32, 0.02]} />
          <primitive object={M.consoleBody} attach="material" />
        </mesh>
      ))}

      {/* Television. */}
      <mesh position={[LR_TV.x, LR_TV.y, 0.07]} castShadow>
        <boxGeometry args={[LR_TV.w + 0.05, LR_TV.h + 0.05, 0.06]} />
        <primitive object={M.tv} attach="material" />
      </mesh>
      {tvOn && (
        <mesh position={[LR_TV.x, LR_TV.y, 0.105]}>
          <planeGeometry args={[LR_TV.w - 0.04, LR_TV.h - 0.04]} />
          <primitive object={screenMat} attach="material" />
        </mesh>
      )}

      {/* Soundbar. */}
      <mesh position={[LR_TV.x, 0.6, 0.3]} castShadow>
        <boxGeometry args={[1.5, 0.09, 0.1]} />
        <primitive object={M.speaker} attach="material" />
      </mesh>

      {/* Floorstanders. The cones move on the volume — a still speaker is a
          prop, and the requirement document asks for speaker animation by
          name. The excursion is exaggerated; the point is that it is alive. */}
      {LR_PLAN.speakers.map((sp, i) => (
        <group key={`spk-${i}`} position={[sp.x, 0, 0.32]}>
          <mesh position={[0, 0.58, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.3, 1.16, 0.28]} />
            <primitive object={M.speaker} attach="material" />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[0.36, 0.04, 0.34]} />
            <primitive object={M.metal} attach="material" />
          </mesh>
          {[0.38, 0.7, 0.98].map((y, j) => (
            <mesh
              key={`drv-${j}`}
              position={[0, y, 0.15 + audioLevel * (0.016 - j * 0.004)]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.088 - j * 0.021, 0.088 - j * 0.021, 0.018, 18]} />
              <primitive object={M.cone} attach="material" />
            </mesh>
          ))}
        </group>
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

const PANELS = 4;
/** Panels lap over each other, as real curtains do — butt-joined ones leak. */
const PANEL_OVERLAP = 0.05;

function Glazing({
  sheer,
  blackout,
  daylight,
  view,
}: LivingCurtains & { daylight: number; view: THREE.Texture }) {
  const span = LR_WINDOW.z1 - LR_WINDOW.z0;
  const height = LR_WINDOW.y1 - LR_WINDOW.y0;
  const seg = span / PANELS;

  const viewMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: view,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    [view],
  );

  const layers = [
    { key: "blackout", pos: blackout, mat: M.drape, x: LR.w - 0.2 },
    { key: "sheer", pos: sheer, mat: M.sheer, x: LR.w - 0.34 },
  ];

  return (
    <group>
      {/* The view, set well back so it has parallax against the mullions. */}
      <mesh
        position={[LR.w + 7, LR.h / 2 + 0.8, LR.d / 2]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[26, 13]} />
        <primitive object={viewMat} attach="material" />
      </mesh>

      <mesh
        position={[LR.w - 0.03, (LR_WINDOW.y0 + LR_WINDOW.y1) / 2, LR.d / 2]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[span, height]} />
        <primitive object={M.glass} attach="material" />
      </mesh>

      {/* Sill and mullions. */}
      <mesh position={[LR.w - 0.04, LR_WINDOW.y0, LR.d / 2]}>
        <boxGeometry args={[0.12, 0.12, span + 0.2]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      {[LR_WINDOW.z0, LR.d / 2, LR_WINDOW.z1].map((z, i) => (
        <mesh
          key={`mull-${i}`}
          position={[LR.w - 0.04, (LR_WINDOW.y0 + LR_WINDOW.y1) / 2, z]}
        >
          <boxGeometry args={[0.09, height, 0.07]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}

      {/* Track, boxed into the soffit edge. */}
      <mesh position={[LR.w - 0.27, LR_WINDOW.y1 + 0.04, LR.d / 2]}>
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
            ? LR_WINDOW.z0 + i * seg - PANEL_OVERLAP / 2
            : LR_WINDOW.z0 + (i + 1) * seg + PANEL_OVERLAP / 2;
          return (
            <mesh
              key={`${layer.key}-${i}`}
              geometry={geo}
              material={layer.mat}
              position={[layer.x, LR_WINDOW.y0, z]}
              scale={[1, 1, toStart ? 1 : -1]}
              castShadow={layer.key === "blackout"}
            />
          );
        });
      })}

      {/* A faint bloom on the glass in daylight, so the window reads as
          brighter than the room rather than as a picture hung on the wall. */}
      {daylight > 0.02 && (
        <mesh
          position={[LR.w - 0.05, (LR_WINDOW.y0 + LR_WINDOW.y1) / 2, LR.d / 2]}
          rotation={[0, -Math.PI / 2, 0]}
        >
          <planeGeometry args={[span, height]} />
          <meshBasicMaterial
            color="#eaf2ff"
            transparent
            opacity={0.1 * daylight}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Furniture                                                           */
/* ------------------------------------------------------------------ */

/**
 * The seating group.
 *
 * Rug, sofa, coffee table, ottomans and chair all live inside **one** rotated
 * group, laid out against each other in its local axes. That is the whole
 * point: an earlier pass angled the sofa but left the rug square to the room
 * and scattered the ottomans on their own coordinates, and the result looked
 * like the furniture had been pushed aside for cleaning. A room reads as
 * arranged when everything in a zone shares one axis — so the rug turns with
 * the sofa, and the ottomans sit on a line with the table.
 */
function SeatingGroup() {
  return (
    <group position={[2.9, 0, 5.0]} rotation={[0, 0.35, 0]}>
      {/* Rug, turned with the furniture standing on it. */}
      <mesh position={[0.6, 0.006, 0.05]} receiveShadow>
        <boxGeometry args={[4.9, 0.012, 4.0]} />
        <primitive object={M.rug} attach="material" />
      </mesh>

      {/* Sofa, facing +x across the group toward the media wall. Straight
          rather than an L: on the client's sheet the chaise end falls outside
          the frame, so a return would sit behind the camera and only cost
          frame space.

          Every upholstered part is a rounded box. A 4-6 cm radius is what real
          foam-and-fabric has, and sharp corners are the single strongest signal
          that something is a primitive rather than a sofa. */}
      <group position={[-1.3, 0, 0]}>
        <mesh position={[0, 0.05, 0]} receiveShadow>
          <boxGeometry args={[0.92, 0.1, 3.66]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
        <RoundedBox
          args={[1.05, 0.32, 3.8]}
          radius={0.05}
          smoothness={3}
          position={[0, 0.26, 0]}
          castShadow
          receiveShadow
        >
          <primitive object={M.sofa} attach="material" />
        </RoundedBox>
        <RoundedBox
          args={[0.22, 0.58, 3.8]}
          radius={0.07}
          smoothness={3}
          position={[-0.45, 0.6, 0]}
          rotation={[0, 0, 0.05]}
          castShadow
          receiveShadow
        >
          <primitive object={M.sofa} attach="material" />
        </RoundedBox>
        {[-1.26, 0, 1.26].map((z) => (
          <group key={`seat-${z}`}>
            <RoundedBox
              args={[0.92, 0.19, 1.18]}
              radius={0.075}
              smoothness={3}
              position={[0.05, 0.51, z]}
              castShadow
              receiveShadow
            >
              <primitive object={M.sofaSeat} attach="material" />
            </RoundedBox>
            <RoundedBox
              args={[0.2, 0.44, 1.16]}
              radius={0.08}
              smoothness={3}
              position={[-0.27, 0.72, z]}
              rotation={[0, 0, -0.14]}
              castShadow
            >
              <primitive object={M.sofaSeat} attach="material" />
            </RoundedBox>
          </group>
        ))}
        {/* Scatter cushions, turned off-axis. Nothing on a real sofa is
            square to anything else — which is the opposite of the furniture
            itself, and is exactly why both matter. */}
        {[
          { p: [-0.18, 0.78, -1.5], r: [0.2, 0.35, 0.3] },
          { p: [-0.18, 0.78, -0.62], r: [0.16, -0.3, -0.26] },
          { p: [-0.18, 0.78, 1.0], r: [0.18, 0.28, 0.24] },
        ].map((c, i) => (
          <RoundedBox
            key={`cu-${i}`}
            args={[0.4, 0.4, 0.14]}
            radius={0.06}
            smoothness={3}
            position={c.p as [number, number, number]}
            rotation={c.r as [number, number, number]}
            castShadow
          >
            <primitive object={M.cushion} attach="material" />
          </RoundedBox>
        ))}
      </group>

      {/* Round marble coffee table, square to the group and centred on the
          sofa's middle seat. */}
      <group position={[0.5, 0, 0]}>
        <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.64, 0.64, 0.09, 36]} />
          <primitive object={M.marble} attach="material" />
        </mesh>
        <mesh position={[0, 0.17, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.38, 0.34, 28]} />
          <primitive object={M.marble} attach="material" />
        </mesh>
        <mesh position={[0.12, 0.47, 0.08]} castShadow>
          <sphereGeometry args={[0.1, 12, 10]} />
          <primitive object={M.foliage} attach="material" />
        </mesh>
        <mesh position={[-0.22, 0.42, -0.12]} castShadow>
          <boxGeometry args={[0.3, 0.04, 0.22]} />
          <primitive object={M.consoleWood} attach="material" />
        </mesh>
      </group>

      {/* Two ottomans on a line with the table, and a tub chair beyond them —
          the near-right corner of the group, as on the sheet. */}
      {[
        { x: 1.9, z: -0.58, w: 0.88, d: 0.82 },
        { x: 1.9, z: 0.6, w: 0.8, d: 0.76 },
      ].map((o, i) => (
        <group key={`ott-${i}`} position={[o.x, 0, o.z]}>
          <RoundedBox
            args={[o.w, 0.36, o.d]}
            radius={0.14}
            smoothness={4}
            position={[0, 0.22, 0]}
            castShadow
            receiveShadow
          >
            <primitive object={M.cushion} attach="material" />
          </RoundedBox>
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[o.w * 0.34, o.w * 0.34, 0.06, 20]} />
            <primitive object={M.metal} attach="material" />
          </mesh>
        </group>
      ))}

      {/* Tub chair, turned back toward the sofa so the group closes. */}
      <group position={[2.5, 0, 1.62]} rotation={[0, -2.5, 0]}>
        <RoundedBox
          args={[0.8, 0.2, 0.76]}
          radius={0.075}
          smoothness={3}
          position={[0, 0.43, 0.02]}
          castShadow
          receiveShadow
        >
          <primitive object={M.cushion} attach="material" />
        </RoundedBox>
        <RoundedBox
          args={[0.8, 0.52, 0.2]}
          radius={0.09}
          smoothness={3}
          position={[0, 0.66, -0.3]}
          rotation={[-0.16, 0, 0]}
          castShadow
          receiveShadow
        >
          <primitive object={M.cushion} attach="material" />
        </RoundedBox>
        {[-0.35, 0.35].map((dx) => (
          <RoundedBox
            key={`arm-${dx}`}
            args={[0.16, 0.26, 0.66]}
            radius={0.07}
            smoothness={3}
            position={[dx, 0.53, 0.02]}
            castShadow
          >
            <primitive object={M.cushion} attach="material" />
          </RoundedBox>
        ))}
        <mesh position={[0, 0.17, 0]} castShadow>
          <cylinderGeometry args={[0.19, 0.26, 0.32, 24]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      </group>
    </group>
  );
}

/** Dining zone, console and plants — everything outside the seating group. */
function RoomFurniture() {
  return (
    <group>
      {/* Dining zone in the middle distance, under the pendants.
          The sheet leans on this for depth: something to see past the seating
          is most of what stops a large room reading as a small one. */}
      <group position={[LR_PLAN.dining.x, 0, LR_PLAN.dining.z]}>
        <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.15, 0.06, 2.3]} />
          <primitive object={M.consoleWood} attach="material" />
        </mesh>
        {[-0.48, 0.48].map((dx) =>
          [-0.95, 0.95].map((dz) => (
            <mesh key={`tl-${dx}-${dz}`} position={[dx, 0.36, dz]} castShadow>
              <boxGeometry args={[0.06, 0.72, 0.06]} />
              <primitive object={M.metal} attach="material" />
            </mesh>
          )),
        )}
        {[-0.72, 0.72].map((dx) =>
          [-0.62, 0, 0.62].map((dz) => (
            <group key={`ch-${dx}-${dz}`} position={[dx, 0, dz]}>
              <RoundedBox
                args={[0.44, 0.07, 0.46]}
                radius={0.03}
                smoothness={3}
                position={[0, 0.45, 0]}
                castShadow
                receiveShadow
              >
                <primitive object={M.cushion} attach="material" />
              </RoundedBox>
              <RoundedBox
                args={[0.07, 0.48, 0.44]}
                radius={0.03}
                smoothness={3}
                position={[dx > 0 ? 0.19 : -0.19, 0.69, 0]}
                rotation={[0, 0, dx > 0 ? -0.12 : 0.12]}
                castShadow
              >
                <primitive object={M.cushion} attach="material" />
              </RoundedBox>
              {[-0.17, 0.17].map((lx) =>
                [-0.17, 0.17].map((lz) => (
                  <mesh key={`cl-${lx}-${lz}`} position={[lx, 0.22, lz]}>
                    <boxGeometry args={[0.04, 0.44, 0.04]} />
                    <primitive object={M.metal} attach="material" />
                  </mesh>
                )),
              )}
            </group>
          )),
        )}
        <mesh position={[0, 0.85, 0]} castShadow>
          <cylinderGeometry args={[0.14, 0.1, 0.16, 16]} />
          <primitive object={M.pot} attach="material" />
        </mesh>
      </group>

      {/* Floor plants, which the sheet leans on heavily for warmth. */}
      {[
        { x: 7.7, z: 1.3 },
        { x: 0.45, z: 7.6 },
      ].map((p, i) => (
        <group key={`plant-${i}`} position={[p.x, 0, p.z]}>
          <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.2, 0.15, 0.32, 18]} />
            <primitive object={M.pot} attach="material" />
          </mesh>
          {Array.from({ length: 7 }, (_, j) => (
            <mesh
              key={`leaf-${j}`}
              position={[
                Math.sin(j * 1.9 + i) * 0.18,
                0.5 + (j % 4) * 0.16,
                Math.cos(j * 1.9 + i) * 0.18,
              ]}
              rotation={[Math.sin(j) * 0.5, j * 1.9, Math.cos(j) * 0.5]}
              castShadow
            >
              <sphereGeometry args={[0.2, 10, 6]} />
              <primitive object={M.foliage} attach="material" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/**
 * Recessed air-conditioning cassette.
 *
 * The client's sheet points an "AC Control" callout straight at the ceiling, so
 * the unit has to be somewhere you can point at too. The louvres swing open when
 * it runs and sit flush when it does not, wider as the fan is asked for more —
 * the same trick the fan uses. A control whose effect you cannot see in the room
 * is a control nobody believes.
 */
function AirConditioner({ on, fan }: { on: boolean; fan: number }) {
  const { x, z } = LR_PLAN.ac;
  const y = LR.h - 0.02;
  const tilt = on ? 0.5 + Math.min(fan, 3) * 0.16 : 0.02;

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.5, 0.62]} />
        <primitive object={M.consoleBody} attach="material" />
      </mesh>
      <mesh position={[0, y - 0.012, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.3, 0.44]} />
        <primitive object={M.slatBack} attach="material" />
      </mesh>
      {[-0.19, 0.19].map((dz, i) => (
        <mesh
          key={`louvre-${i}`}
          position={[0, y - 0.03, dz]}
          rotation={[i === 0 ? tilt : -tilt, 0, 0]}
          castShadow
        >
          <boxGeometry args={[1.28, 0.012, 0.14]} />
          <primitive object={M.consoleBody} attach="material" />
        </mesh>
      ))}
      {[-0.5, -0.25, 0, 0.25, 0.5].map((dx) => (
        <mesh key={`fin-${dx}`} position={[dx, y - 0.018, 0]}>
          <boxGeometry args={[0.012, 0.01, 0.4]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Pendant cluster — cords and canopy only.
 *
 * The globes live in the light rig, because their brightness is device state. A
 * decorative fitting that vanishes when it is switched off is the giveaway this
 * whole approach exists to avoid.
 */
function PendantRig() {
  const { x, z } = LR_PLAN.pendants;
  return (
    <group>
      <mesh position={[x, LR.h - 0.015, z]}>
        <cylinderGeometry args={[0.17, 0.17, 0.03, 24]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      {LR_PENDANT_GLOBES.map((g, i) => (
        <mesh key={`cord-${i}`} position={[x + g.dx, (LR.h + g.y + g.r) / 2, z + g.dz]}>
          <cylinderGeometry args={[0.004, 0.004, LR.h - g.y - g.r, 6]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Ceiling fan.
 *
 * The per-frame step is capped for the reason set out in `lib/sim/fan.ts`:
 * three blades 120 degrees apart alias into running backwards if a frame turns
 * them too far.
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
  view,
  audioLevel = 0,
  fanRadiansPerSecond = 0,
  ac = { on: false, fan: 0 },
}: {
  curtains: LivingCurtains;
  tvOn: boolean;
  /** 0..1 exterior brightness, so the window tracks the simulated clock. */
  daylight: number;
  /** The city beyond the glazing, day or night. */
  view: THREE.Texture;
  /** 0..1 music volume, which drives the speaker cones. */
  audioLevel?: number;
  fanRadiansPerSecond?: number;
  /** Air conditioning, so the cassette's louvres can show it running. */
  ac?: { on: boolean; fan: number };
}) {
  return (
    <group>
      <Shell />
      <SlatPanel />
      <MediaWall tvOn={tvOn} audioLevel={audioLevel} />
      <Glazing {...curtains} daylight={daylight} view={view} />
      <PendantRig />
      <CeilingFan radiansPerSecond={fanRadiansPerSecond} />
      <AirConditioner on={ac.on} fan={ac.fan} />
      <SeatingGroup />
      <RoomFurniture />
    </group>
  );
}
