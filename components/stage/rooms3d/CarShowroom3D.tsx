"use client";

/**
 * Car Showroom — geometry.
 *
 * 26 by 20 metres under a six-and-a-half metre ceiling, which makes it the
 * widest room in the project. Two rules carried over from the hotel lobby,
 * both of them learned the expensive way:
 *
 * **Anything that appears more than about six times is instanced.** The
 * downlight field is fifty-four lenses, the track carries thirty-two heads,
 * the slatted ceiling is ninety battens and the planting is leaves. Drawn
 * individually that is well over a thousand draw calls before a single car.
 *
 * **Albedo is a budget, not a preference.** The lobby shipped with a floor
 * reflecting about 0.7 and it read as glare — there is no headroom left for a
 * highlight, and the surface bounces that light back onto everything above it.
 * Polished concrete is 0.25 to 0.35, and it is kept there here even though a
 * showroom floor *looks* pale, because what makes it look pale is the
 * reflection, not the diffuse.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { MAX_BLADE_STEP_RAD } from "@/lib/sim/fan";
import {
  CAR_SHAPES,
  makeBrandGraphic,
  makeCarBody,
  makeMarbleTexture,
  makeWordmark,
} from "./geometry";

/* ------------------------------------------------------------------ */
/* Dimensions                                                          */
/* ------------------------------------------------------------------ */

/**
 * The shell.
 *
 * `x` runs from the graphic wall on the left (0) to the feature wall on the
 * right (w); `z` runs from the back wall (0) to the glazed frontage behind the
 * camera (d).
 */
export const SH = {
  w: 26,
  d: 20,
  h: 6.5,
} as const;

/** Where everything stands. Shared with the light rig. */
export const SH_PLAN = {
  /** The raised circular hero platform, and the coffer that sits over it. */
  hero: { x: 11.5, z: 8.2, r: 3.4, h: 0.26 },
  /** Ceiling coffer above it: a ring of spots inside a lit edge. */
  coffer: { r: 4.2, y: 6.3, drop: 0.55 },
  /**
   * Backlit graphic panels, on the back wall rather than the left one.
   *
   * They started down the left wall, as the reference has them, and could not
   * be seen: the camera stands four metres from that wall and looks down the
   * room, so the wall is edge-on and every panel fell outside the left of the
   * frame. The hotel lobby's reception wall taught the same lesson — a surface
   * you are standing beside is not a surface you can photograph. On the back
   * wall they are nearly face-on to the lens, which is the only orientation in
   * which "large backlit brand graphics" means anything to someone looking at
   * the picture.
   */
  graphics: [
    { x: 4.4, w: 6.2, h: 3.2, y: 2.6, line: "DRIVEN BY A\nBRIGHTER\nTOMORROW" },
    { x: 11.6, w: 5.4, h: 2.9, y: 2.5, line: "MORE THAN\nA CAR,\nA LIFESTYLE" },
  ],
  /** Tall clad columns with vertical strips. */
  columns: [
    { x: 7.4, z: 3.2 },
    { x: 17.6, z: 10.6 },
    { x: 17.6, z: 3.0 },
  ],
  /** Mezzanine, back right, over the lounge. */
  mezz: { x0: 17.0, x1: SH.w, z0: 0, z1: 6.2, y: 3.5 },
  /** Customer lounge on the floor below and forward of it. */
  lounge: { x: 21.2, z: 12.6 },
  /** Reception desk against the right wall. */
  desk: { x: 24.3, z0: 7.4, z1: 13.2, h: 1.1, d: 0.9 },
  /** RGB feature panels, far right beyond the mezzanine. */
  rgbWall: { x: SH.w - 0.1, z0: 1.2, z1: 6.0, y0: 0.2, y1: 3.2 },
  /** Dark slatted ceiling bay over the right-hand half. */
  slats: { x0: 15.5, x1: SH.w, z0: 0.4, z1: 13.0, y: 6.3 },
} as const;

/**
 * The cars. Generic forms with no badge, grille or marque on any of them.
 *
 * `kind` picks a silhouette rather than a model: the proportions of a coupé,
 * a saloon and a boxy SUV are different enough to read across a room, and
 * that is the whole requirement. Anything more specific would be somebody's
 * design.
 */
export const SH_CARS = [
  // Far enough back that its near end is four metres off the lens. At 13.4
  // it filled the bottom-left quarter and ran off the edge of the frame,
  // which is the "nothing large within two metres" fault in the brief.
  { id: "coupe", kind: "coupe", x: 5.0, z: 11.4, rot: -0.5, colour: "#b9bfc6", hero: false },
  { id: "sedan", kind: "saloon", x: 4.2, z: 8.0, rot: -0.2, colour: "#3a3e44", hero: false },
  { id: "suv", kind: "suv", x: 11.5, z: 8.2, rot: 0.0, colour: "#2d4034", hero: true },
  { id: "sport", kind: "coupe", x: 15.4, z: 12.9, rot: 2.5, colour: "#9e2116", hero: false },
  { id: "white", kind: "saloon", x: 20.4, z: 4.6, rot: 1.9, colour: "#d8d8d6", hero: false },
  { id: "black", kind: "saloon", x: 23.4, z: 6.4, rot: 2.2, colour: "#17191c", hero: false },
] as const;

/* ------------------------------------------------------------------ */
/* Materials                                                          */
/* ------------------------------------------------------------------ */

const M = {
  /**
   * Polished concrete, at concrete's reflectance.
   *
   * A showroom floor photographs pale because it is *reflective*, not because
   * it is light — the brightness in a reference image is the cars and the
   * ceiling coming back off it. Giving it a pale albedo as well is how the
   * hotel lobby ended up looking like glare, so this stays at about 0.3 and
   * earns its brightness from a low roughness instead.
   */
  floor: new THREE.MeshPhysicalMaterial({
    color: "#6f7175",
    roughness: 0.14,
    metalness: 0.02,
    clearcoat: 0.55,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.5,
  }),
  /** The turntable deck: polished, unmapped — see `HeroPlatform`. */
  deck: new THREE.MeshPhysicalMaterial({
    color: "#6b6d71",
    roughness: 0.1,
    metalness: 0.03,
    clearcoat: 0.7,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.6,
  }),
  ceiling: new THREE.MeshStandardMaterial({ color: "#d9d6d0", roughness: 0.95 }),
  coffer: new THREE.MeshStandardMaterial({ color: "#cfcbc3", roughness: 0.92 }),
  wall: new THREE.MeshStandardMaterial({ color: "#b8b4ad", roughness: 0.93 }),
  /** The dark wall behind the graphics, and the column cladding. */
  dark: new THREE.MeshStandardMaterial({ color: "#26272a", roughness: 0.62 }),
  darker: new THREE.MeshStandardMaterial({ color: "#161719", roughness: 0.7 }),
  /** Dark wood slats on the right-hand ceiling bay. */
  wood: new THREE.MeshStandardMaterial({ color: "#4a3522", roughness: 0.6 }),
  /** Black track and spotlight bodies. */
  track: new THREE.MeshStandardMaterial({
    color: "#17181a",
    roughness: 0.45,
    metalness: 0.4,
  }),
  /**
   * Alloy, not chrome.
   *
   * A fully metallic surface shows only what it reflects, and the room's
   * environment is a small procedural rig — so at metalness 0.95 the wheels
   * came back as dark discs however bright the showroom was. Brushed alloy
   * keeps a diffuse base for the spotlights to land on, which is also what a
   * machined rim actually looks like.
   */
  rim: new THREE.MeshStandardMaterial({
    color: "#b4b8bd",
    roughness: 0.34,
    metalness: 0.62,
    envMapIntensity: 1.6,
  }),
  chrome: new THREE.MeshStandardMaterial({
    color: "#b9bec4",
    roughness: 0.18,
    metalness: 0.95,
    envMapIntensity: 1.8,
  }),
  brass: new THREE.MeshStandardMaterial({
    color: "#b08d55",
    roughness: 0.3,
    metalness: 0.85,
    envMapIntensity: 1.5,
  }),
  glass: new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: 0.04,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
  }),
};

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

/**
 * Floor, walls and the flat ceiling, with the circular coffer cut into it.
 *
 * The coffer is a ring of four bands rather than a solid plane with a hole,
 * for the same reason the lobby's stepped coffer is: a plane that covers its
 * own feature hides it, and what the eye reads as a raised circle is the
 * vertical return at its edge, which only exists if there is an opening to
 * return into.
 */
function Shell() {
  const c = SH_PLAN.coffer;
  const hero = SH_PLAN.hero;

  return (
    <group>
      {/* Floor. */}
      <mesh position={[SH.w / 2, 0, SH.d / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[SH.w, SH.d]} />
        <primitive object={M.floor} attach="material" />
      </mesh>

      {/*
        Ceiling, as a ring around the coffer.

        `ringGeometry` would be neater and is wrong here: the ceiling is
        rectangular and the opening is round, so the band between them is not a
        ring. Four rectangles around the circle's bounding box plus a true ring
        inside it is the shape, and the join is hidden by the coffer's own
        return.
      */}
      {[
        { x: SH.w / 2, z: (hero.z - c.r) / 2, w: SH.w, d: hero.z - c.r },
        { x: SH.w / 2, z: (hero.z + c.r + SH.d) / 2, w: SH.w, d: SH.d - hero.z - c.r },
        { x: (hero.x - c.r) / 2, z: hero.z, w: hero.x - c.r, d: c.r * 2 },
        { x: (hero.x + c.r + SH.w) / 2, z: hero.z, w: SH.w - hero.x - c.r, d: c.r * 2 },
      ].map((b, i) => (
        <mesh
          key={`ceil-${i}`}
          position={[b.x, SH.h, b.z]}
          rotation={[Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[b.w, b.d]} />
          <primitive object={M.ceiling} attach="material" />
        </mesh>
      ))}
      {/* The square corners the four bands leave around the circle. */}
      <mesh
        position={[hero.x, SH.h, hero.z]}
        rotation={[Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <ringGeometry args={[c.r, c.r * 1.42, 48, 1]} />
        <primitive object={M.ceiling} attach="material" />
      </mesh>

      {/* The coffer: a raised disc with a vertical return down to the ceiling. */}
      <mesh position={[hero.x, c.y + c.drop, hero.z]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[c.r, 56]} />
        <primitive object={M.coffer} attach="material" />
      </mesh>
      <mesh position={[hero.x, c.y + c.drop / 2, hero.z]}>
        <cylinderGeometry args={[c.r, c.r, c.drop, 56, 1, true]} />
        <primitive object={M.coffer} attach="material" />
      </mesh>

      {/* Back wall, and the left wall the graphics hang on. */}
      <mesh position={[SH.w / 2, SH.h / 2, 0]} receiveShadow>
        <planeGeometry args={[SH.w, SH.h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      <mesh position={[0.01, SH.h / 2, SH.d / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[SH.d, SH.h]} />
        <primitive object={M.dark} attach="material" />
      </mesh>
      <mesh
        position={[SH.w - 0.01, SH.h / 2, SH.d / 2]}
        rotation={[0, -Math.PI / 2, 0]}
        receiveShadow
      >
        <planeGeometry args={[SH.d, SH.h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      {/* The glazed frontage behind the camera, so the room is closed. */}
      <mesh position={[SH.w / 2, SH.h / 2, SH.d]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[SH.w, SH.h]} />
        <primitive object={M.glass} attach="material" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Slatted ceiling bay                                                 */
/* ------------------------------------------------------------------ */

const SLAT = { w: 0.1, gap: 0.085, d: 0.16 };

/** Dark timber battens over the right-hand half, instanced. */
function SlatCeiling() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const s = SH_PLAN.slats;
  const pitch = SLAT.w + SLAT.gap;
  const count = Math.floor((s.z1 - s.z0) / pitch);
  const span = s.x1 - s.x0;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const colour = new THREE.Color();
    const a = new THREE.Color("#5a4028");
    const b = new THREE.Color("#33240f");
    for (let i = 0; i < count; i++) {
      m.makeTranslation(s.x0 + span / 2, s.y - SLAT.d / 2, s.z0 + SLAT.w / 2 + i * pitch);
      mesh.setMatrixAt(i, m);
      const t = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
      colour.copy(a).lerp(b, t).multiplyScalar(0.9 + t * 0.2);
      mesh.setColorAt(i, colour);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [count, pitch, span, s.x0, s.y, s.z0]);

  return (
    <group>
      <mesh
        position={[s.x0 + span / 2, s.y - 0.005, (s.z0 + s.z1) / 2]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[span, s.z1 - s.z0]} />
        <primitive object={M.darker} attach="material" />
      </mesh>
      <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow receiveShadow>
        <boxGeometry args={[span, SLAT.d, SLAT.w]} />
        <meshStandardMaterial color="#ffffff" roughness={0.6} />
      </instancedMesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Columns                                                             */
/* ------------------------------------------------------------------ */

/** Tall dark columns, each with a recessed slot the arch channel lights. */
function Columns() {
  return (
    <group>
      {SH_PLAN.columns.map((c, i) => (
        <group key={`col-${i}`} position={[c.x, 0, c.z]}>
          <mesh position={[0, SH.h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.78, SH.h, 0.78]} />
            <primitive object={M.dark} attach="material" />
          </mesh>
          {/* Dark recess on two faces; the strip sits inside it. */}
          {[
            { p: [-0.395, SH.h / 2, 0] as [number, number, number], r: -Math.PI / 2 },
            { p: [0, SH.h / 2, 0.395] as [number, number, number], r: 0 },
          ].map((f, j) => (
            <mesh key={j} position={f.p} rotation={[0, f.r, 0]}>
              <planeGeometry args={[0.11, SH.h - 0.5]} />
              <primitive object={M.darker} attach="material" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Hero platform                                                       */
/* ------------------------------------------------------------------ */

/**
 * The raised circular platform, and the turntable on top of it.
 *
 * The plinth stands still and the deck turns — which is how a real one is
 * built, and also means the lit ring at the base does not rotate with the car.
 * `MAX_BLADE_STEP_RAD` caps the per-frame step for the reason set out in
 * `lib/sim/fan.ts`: a disc with any radial feature on it aliases into running
 * backwards if a frame turns it too far, and at the frame rates this project
 * runs at that is a real risk rather than a theoretical one.
 */
export function HeroPlatform({
  radiansPerSecond,
  children,
}: {
  radiansPerSecond: number;
  children?: React.ReactNode;
}) {
  const deck = useRef<THREE.Group>(null);
  const h = SH_PLAN.hero;

  useFrame((_, dt) => {
    if (!deck.current) return;
    deck.current.rotation.y += Math.min(radiansPerSecond * dt, MAX_BLADE_STEP_RAD);
  });

  return (
    <group position={[h.x, 0, h.z]}>
      {/* Plinth, with a shadow gap under its lip for the ring to wash. */}
      <mesh position={[0, h.h / 2, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[h.r, h.r, h.h, 64]} />
        <primitive object={M.darker} attach="material" />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[h.r + 0.14, h.r + 0.14, 0.04, 64]} />
        <primitive object={M.dark} attach="material" />
      </mesh>

      {/* The deck. Everything on it turns. */}
      <group ref={deck} name="cs-turntable-deck" position={[0, h.h, 0]}>
        {/*
          The deck gets its own material, not the floor's.
 
          A cylinder cap's UVs are radial, so a marble map on it fans out from
          the centre in a starburst — which on a turntable, slowly rotating,
          is about the most artificial thing the room could do. Plain polished
          stone with no map has nothing to fan.
        */}
        <mesh position={[0, -0.012, 0]} receiveShadow>
          <cylinderGeometry args={[h.r - 0.05, h.r - 0.05, 0.024, 64]} />
          <primitive object={M.deck} attach="material" />
        </mesh>
        {children}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Vehicles                                                            */
/* ------------------------------------------------------------------ */

/**
 * One car: a skinned body, a greenhouse, wheels and lamps.
 *
 * Paint is a `MeshPhysicalMaterial` with a clearcoat, which is what car paint
 * physically is — a pigmented base under a clear lacquer, and two specular
 * lobes rather than one. It is also the material that makes the high-CRI
 * demonstration visible at all: a single-lobe surface has no depth for a
 * spectrum to flatten.
 *
 * Nothing here is badged. The grille is a dark recess, the lamps are abstract
 * bars, and the proportions come from `CAR_SHAPES` — a coupé, a saloon and a
 * tall estate. None of it is anybody's design.
 */
function Car({
  kind,
  colour,
  lampsOn,
}: {
  kind: string;
  colour: string;
  /** Headlights and tail bars, lit in the launch and event scenes. */
  lampsOn: boolean;
}) {
  const shape = CAR_SHAPES[kind] ?? CAR_SHAPES.saloon;
  const body = useMemo(
    () => makeCarBody(shape.stations, shape.length),
    [shape],
  );

  const paint = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: colour,
        roughness: 0.3,
        // Metallic flake: enough to pick up the room, not enough to turn the
        // panel into a mirror and lose its colour entirely.
        metalness: 0.55,
        clearcoat: 1,
        clearcoatRoughness: 0.045,
        envMapIntensity: 1.7,
        side: THREE.DoubleSide,
      }),
    [colour],
  );

  const glass = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#1c2328",
        roughness: 0.06,
        metalness: 0.1,
        transparent: true,
        opacity: 0.62,
        envMapIntensity: 2,
        side: THREE.DoubleSide,
      }),
    [],
  );

  const lamp = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#0e1013",
        emissive: new THREE.Color("#ffffff"),
        emissiveIntensity: 0,
        roughness: 0.2,
        toneMapped: false,
      }),
    [],
  );
  const tail = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#2a0b0b",
        emissive: new THREE.Color("#ff2a18"),
        emissiveIntensity: 0,
        roughness: 0.25,
        toneMapped: false,
      }),
    [],
  );
  useLayoutEffect(() => {
    lamp.emissiveIntensity = lampsOn ? 3.4 : 0;
    tail.emissiveIntensity = lampsOn ? 2.2 : 0;
  });

  const L = shape.length;
  const last = shape.stations[shape.stations.length - 1];
  const mid = shape.stations[Math.floor(shape.stations.length / 2)];
  /** Axles at the classic fractions, so the stance reads right. */
  const axle = { front: -L * 0.31, rear: L * 0.31 };
  const wheelR = kind === "suv" ? 0.39 : 0.335;
  const track = mid.hw - 0.06;

  return (
    <group>
      <mesh geometry={body} castShadow receiveShadow>
        <primitive object={paint} attach="material" />
      </mesh>

      {/*
        The greenhouse, as a second skin just inside the roof.

        Drawn from the same stations with the sills raised to the shoulder, so
        the glass follows the body's own line exactly rather than being a box
        set into it — which is what makes a windscreen read as raked.
      */}
      <mesh
        geometry={useMemo(
          () =>
            makeCarBody(
              shape.stations.map((st) => ({
                ...st,
                hw: st.roofHw * 1.02,
                sill: st.shoulder + 0.012,
                shoulder: st.shoulder + 0.02,
              })),
              shape.length,
            ),
          [shape],
        )}
        scale={[0.995, 0.998, 0.985]}
      >
        <primitive object={glass} attach="material" />
      </mesh>

      {/* Wheels: a tyre, a dished rim and spokes. */}
      {[axle.front, axle.rear].map((x) =>
        [-track, track].map((z) => (
          <group key={`w-${x}-${z}`} position={[x, wheelR, z]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh castShadow>
              <cylinderGeometry args={[wheelR, wheelR, 0.235, 22]} />
              <meshStandardMaterial color="#121315" roughness={0.92} />
            </mesh>
            {/*
              Outboard of the tyre, not inside it.
 
              The tyre is 235 mm across, so its outer face is at ±0.1175 and a
              rim offset by 0.10 was buried in the rubber — every wheel read as
              a plain black disc. 0.125 puts the dish just proud of the
              sidewall, which is where an alloy actually sits.
            */}
            <mesh position={[0, z > 0 ? 0.125 : -0.125, 0]}>
              <cylinderGeometry args={[wheelR * 0.7, wheelR * 0.7, 0.03, 24]} />
              <primitive object={M.rim} attach="material" />
            </mesh>
            {Array.from({ length: 5 }, (_, k) => (
              <mesh
                key={k}
                position={[0, z > 0 ? 0.138 : -0.138, 0]}
                rotation={[0, (k * Math.PI * 2) / 5, 0]}
              >
                <boxGeometry args={[wheelR * 1.28, 0.016, 0.085]} />
                <primitive object={M.rim} attach="material" />
              </mesh>
            ))}
            <mesh position={[0, z > 0 ? 0.142 : -0.142, 0]}>
              <cylinderGeometry args={[wheelR * 0.2, wheelR * 0.2, 0.03, 16]} />
              <primitive object={M.chrome} attach="material" />
            </mesh>
          </group>
        )),
      )}

      {/* Headlamps and tail bars: abstract slots, not a face. */}
      {[-1, 1].map((side) => (
        <mesh
          key={`hl-${side}`}
          position={[-L / 2 + 0.07, mid.sill + 0.42, side * (mid.hw * 0.62)]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <planeGeometry args={[0.34, 0.1]} />
          <primitive object={lamp} attach="material" />
        </mesh>
      ))}
      <mesh position={[L / 2 - 0.04, last.sill + 0.42, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[last.hw * 1.5, 0.075]} />
        <primitive object={tail} attach="material" />
      </mesh>
      {/* A dark intake under the nose, which is what reads as a grille
          without being one. */}
      <mesh position={[-L / 2 + 0.03, mid.sill + 0.12, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[mid.hw * 1.3, 0.2]} />
        <primitive object={M.darker} attach="material" />
      </mesh>
    </group>
  );
}

/** Every car on the floor except the one on the turntable. */
function Fleet({ lampsOn }: { lampsOn: boolean }) {
  return (
    <group>
      {SH_CARS.filter((c) => !c.hero).map((c) => (
        <group key={c.id} position={[c.x, 0, c.z]} rotation={[0, c.rot, 0]}>
          <Car kind={c.kind} colour={c.colour} lampsOn={lampsOn} />
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Brand graphics, reception, lounge, mezzanine                        */
/* ------------------------------------------------------------------ */

/** Backlit graphic panels down the left wall, in their own dark reveals. */
function Graphics({ on }: { on: boolean }) {
  const panels = useMemo(
    () =>
      SH_PLAN.graphics.map((g) => {
        const map = makeBrandGraphic(g.line, Math.round(g.x * 7));
        return new THREE.MeshStandardMaterial({
          map,
          emissive: new THREE.Color("#ffffff"),
          emissiveMap: map,
          emissiveIntensity: 0,
          roughness: 0.75,
          toneMapped: false,
        });
      }),
    [],
  );
  useLayoutEffect(() => {
    panels.forEach((p) => {
      // Backlit, not lightbox. Past about 1.2 the sky clips and the ridge
      // behind it disappears, which is the whole subject of the graphic.
      p.emissiveIntensity = on ? 0.95 : 0.06;
    });
  });

  return (
    <group>
      {SH_PLAN.graphics.map((g, i) => (
        <group key={`gp-${i}`}>
          <mesh position={[g.x, g.y, 0.06]} receiveShadow>
            <planeGeometry args={[g.w + 0.55, g.h + 0.55]} />
            <primitive object={M.darker} attach="material" />
          </mesh>
          <mesh position={[g.x, g.y, 0.1]}>
            <planeGeometry args={[g.w, g.h]} />
            <primitive object={panels[i]} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Reception desk against the right wall, with the client's own wordmark. */
function Reception({ on }: { on: boolean }) {
  const d = SH_PLAN.desk;
  const len = d.z1 - d.z0;
  const mid = (d.z0 + d.z1) / 2;

  const mark = useMemo(() => {
    const map = makeWordmark("UNISER", "SMART SPACES — FOR A BRIGHTER TOMORROW");
    return new THREE.MeshStandardMaterial({
      map,
      emissive: new THREE.Color("#ffffff"),
      emissiveMap: map,
      emissiveIntensity: 0,
      roughness: 0.42,
      metalness: 0.2,
    });
  }, []);
  useLayoutEffect(() => {
    mark.emissiveIntensity = on ? 0.5 : 0.08;
  });

  return (
    <group>
      {/* Body, with a stone top oversailing the front — the shadow line under
          a worktop is most of what makes it read as stone. */}
      <mesh position={[d.x, d.h / 2 + 0.06, mid]} castShadow receiveShadow>
        <boxGeometry args={[d.d, d.h - 0.12, len]} />
        <primitive object={M.dark} attach="material" />
      </mesh>
      <mesh position={[d.x - 0.03, d.h + 0.02, mid]} castShadow receiveShadow>
        <boxGeometry args={[d.d + 0.14, 0.05, len + 0.12]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      {/* Recessed plinth, so it floats over its own underglow. */}
      <mesh position={[d.x + 0.05, 0.03, mid]}>
        <boxGeometry args={[d.d - 0.2, 0.06, len - 0.12]} />
        <primitive object={M.darker} attach="material" />
      </mesh>
      <mesh position={[d.x - d.d / 2 - 0.002, d.h * 0.52, mid]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[len * 0.62, 0.42]} />
        <primitive object={mark} attach="material" />
      </mesh>
    </group>
  );
}

/** Dark leather tub chairs round a low table, on a thin rug. */
function Lounge() {
  const { x, z } = SH_PLAN.lounge;
  const leather = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#2b2724",
        roughness: 0.55,
        clearcoat: 0.3,
        clearcoatRoughness: 0.5,
      }),
    [],
  );

  return (
    <group position={[x, 0, z]} rotation={[0, -0.5, 0]}>
      {/* 9 mm, bevelled. A thick slab reads as a plinth; see the lobby. */}
      <mesh position={[0, 0.0045, 0]} receiveShadow>
        <boxGeometry args={[4.4, 0.009, 4.0]} />
        <meshStandardMaterial color="#4e5054" roughness={1} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + 0.5;
        return (
          <group key={i} position={[Math.cos(a) * 1.45, 0, Math.sin(a) * 1.45]} rotation={[0, -a + Math.PI, 0]}>
            <mesh position={[0, 0.44, -0.05]} castShadow receiveShadow>
              <cylinderGeometry args={[0.42, 0.4, 0.7, 24, 1, false, Math.PI * 0.2, Math.PI * 1.3]} />
              <primitive object={leather} attach="material" />
            </mesh>
            <mesh position={[0, 0.43, 0.04]} castShadow>
              <cylinderGeometry args={[0.36, 0.36, 0.14, 22]} />
              <primitive object={leather} attach="material" />
            </mesh>
            <mesh position={[0, 0.15, 0]}>
              <cylinderGeometry args={[0.26, 0.31, 0.3, 18]} />
              <primitive object={M.track} attach="material" />
            </mesh>
          </group>
        );
      })}
      <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.58, 0.58, 0.06, 32]} />
        <primitive object={M.darker} attach="material" />
      </mesh>
      <mesh position={[0, 0.18, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.26, 0.3, 20]} />
        <primitive object={M.chrome} attach="material" />
      </mesh>
    </group>
  );
}

/** The mezzanine: a slab on columns with a glass balustrade and seating. */
function Mezzanine() {
  const m = SH_PLAN.mezz;
  const w = m.x1 - m.x0;
  const d = m.z1 - m.z0;

  return (
    <group>
      <mesh position={[m.x0 + w / 2, m.y - 0.14, m.z0 + d / 2]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.28, d]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      {/* The soffit under it is dark, so the lounge below reads as sheltered. */}
      <mesh
        position={[m.x0 + w / 2, m.y - 0.29, m.z0 + d / 2]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[w, d]} />
        <primitive object={M.darker} attach="material" />
      </mesh>
      {/* Glass balustrade along its open edge. */}
      <mesh position={[m.x0 + w / 2, m.y + 0.56, m.z1]}>
        <boxGeometry args={[w, 1.1, 0.02]} />
        <primitive object={M.glass} attach="material" />
      </mesh>
      <mesh position={[m.x0 + w / 2, m.y + 1.12, m.z1]}>
        <boxGeometry args={[w, 0.05, 0.06]} />
        <primitive object={M.chrome} attach="material" />
      </mesh>
      <mesh position={[m.x0, m.y + 0.56, m.z0 + d / 2]}>
        <boxGeometry args={[0.02, 1.1, d]} />
        <primitive object={M.glass} attach="material" />
      </mesh>
      {/* Two columns carrying it, so it is not floating. */}
      {[m.z1 - 0.5, m.z0 + 0.8].map((z, i) => (
        <mesh key={i} position={[m.x0 + 0.6, m.y / 2, z]} castShadow>
          <boxGeometry args={[0.4, m.y, 0.4]} />
          <primitive object={M.dark} attach="material" />
        </mesh>
      ))}
      {/* Chairs and tables, visible through the glass. */}
      {[
        { x: m.x0 + 2.4, z: m.z1 - 1.6 },
        { x: m.x0 + 4.4, z: m.z1 - 2.2 },
        { x: m.x0 + 6.2, z: m.z1 - 1.5 },
      ].map((p, i) => (
        <group key={`mc-${i}`} position={[p.x, m.y, p.z]} rotation={[0, 2.2 + i * 0.5, 0]}>
          <mesh position={[0, 0.42, 0]} castShadow>
            <cylinderGeometry args={[0.34, 0.32, 0.6, 18, 1, false, Math.PI * 0.2, Math.PI * 1.3]} />
            <primitive object={M.dark} attach="material" />
          </mesh>
          <mesh position={[0, 0.14, 0]}>
            <cylinderGeometry args={[0.2, 0.25, 0.28, 14]} />
            <primitive object={M.track} attach="material" />
          </mesh>
        </group>
      ))}
      {/* The feature line under its edge. */}
      <mesh position={[m.x0 + w / 2, m.y - 0.5, m.z1 - 0.02]}>
        <planeGeometry args={[w * 0.6, 0.3]} />
        <primitive object={M.darker} attach="material" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Planting                                                            */
/* ------------------------------------------------------------------ */

const LEAF_GEOM = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.38, 0.2, 0.32, 0.76, 0, 1);
  shape.bezierCurveTo(-0.32, 0.76, -0.38, 0.2, 0, 0);
  return new THREE.ShapeGeometry(shape, 12);
})();

const LEAF_COUNT = 34;
const LEAVES = Array.from({ length: LEAF_COUNT }, (_, i) => {
  const t = i / (LEAF_COUNT - 1);
  const n = Math.sin(i * 12.9898) * 43758.5453;
  const j = n - Math.floor(n);
  return {
    // 137.5 degrees: what real stems do, and why a plant is never in rows.
    turn: i * 2.39996,
    tilt: 1.52 - t * 0.78 + (j - 0.5) * 0.3,
    roll: (j - 0.5) * 1.1,
    len: (0.52 - t * 0.14) * (0.85 + j * 0.3),
    y: 0.52 + t * 0.95,
    dark: i % 3 === 0,
  };
});

/** A leafed specimen as one instanced draw. */
function Foliage({ scale = 1 }: { scale?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  // White, because the instance colours carry the green. `instanceColor`
  // multiplies; handing this a green material applies the albedo twice.
  const leaf = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.78,
        envMapIntensity: 1.4,
        side: THREE.DoubleSide,
      }),
    [],
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const tilt = new THREE.Quaternion();
    const roll = new THREE.Quaternion();
    const zAxis = new THREE.Vector3(0, 0, 1);
    const yAxis = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const light = new THREE.Color("#52703f");
    const dark = new THREE.Color("#374f2c");
    LEAVES.forEach((l, i) => {
      q.setFromAxisAngle(yAxis, l.turn);
      tilt.setFromAxisAngle(zAxis, -l.tilt);
      roll.setFromAxisAngle(yAxis, l.roll);
      q.multiply(tilt).multiply(roll);
      pos.set(0, l.y, 0);
      sc.set(l.len * 1.05, l.len, 1);
      m.compose(pos, q, sc);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, l.dark ? dark : light);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  return (
    <group scale={scale}>
      <instancedMesh ref={ref} args={[LEAF_GEOM, leaf, LEAF_COUNT]} castShadow />
      <mesh position={[0, 0.86, 0]}>
        <cylinderGeometry args={[0.013, 0.017, 0.74, 8]} />
        <meshStandardMaterial color="#374f2c" roughness={0.84} />
      </mesh>
    </group>
  );
}

const PLANTERS = [
  { x: 1.5, z: 2.0, s: 1.15 },
  { x: 1.5, z: 9.0, s: 1.0 },
  { x: 1.5, z: 16.2, s: 1.2 },
  { x: 16.3, z: 16.6, s: 1.05 },
  { x: 24.6, z: 16.4, s: 1.15 },
  { x: 24.6, z: 2.2, s: 0.95 },
] as const;

function Planting() {
  return (
    <group>
      {PLANTERS.map((p, i) => (
        <group key={`pl-${i}`} position={[p.x, 0, p.z]}>
          <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.42, 0.34, 0.6, 22]} />
            <primitive object={M.darker} attach="material" />
          </mesh>
          <group position={[0, 0.6, 0]}>
            <Foliage scale={p.s} />
          </group>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

/**
 * Canvas textures written onto the shared materials once, on mount.
 *
 * They cannot be built at module scope: the materials object is evaluated
 * during the server render, where there is no `document`.
 */
function Surfaces() {
  useLayoutEffect(() => {
    // Large-format polished concrete: a wide, soft mottle rather than veins.
    const floor = makeMarbleTexture("#6f7175", "#85878a", 7741);
    floor.repeat.set(SH.w / 6, SH.d / 6);
    M.floor.map = floor;
    M.floor.color.set("#ffffff");
    M.floor.needsUpdate = true;
  }, []);
  return null;
}

/* ------------------------------------------------------------------ */

export function CarShowroom3D({
  turntableRadiansPerSecond = 0,
  lampsOn = false,
  screensOn = true,
}: {
  turntableRadiansPerSecond?: number;
  /** Headlights and tail bars, lit in Launch and Event. */
  lampsOn?: boolean;
  /** The backlit graphics and the desk wordmark follow the display circuit. */
  screensOn?: boolean;
}) {
  const hero = SH_CARS.find((c) => c.hero)!;
  return (
    <group>
      <Surfaces />
      <Shell />
      <SlatCeiling />
      <Columns />
      <Graphics on={screensOn} />
      <Reception on={screensOn} />
      <Lounge />
      <Mezzanine />
      <Planting />
      <Fleet lampsOn={lampsOn} />
      <HeroPlatform radiansPerSecond={turntableRadiansPerSecond}>
        <group rotation={[0, hero.rot, 0]}>
          <Car kind={hero.kind} colour={hero.colour} lampsOn={lampsOn} />
        </group>
      </HeroPlatform>
    </group>
  );
}

export { M as SH_MATERIALS };
