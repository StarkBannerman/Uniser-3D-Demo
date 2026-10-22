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

import { Suspense, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { MAX_BLADE_STEP_RAD } from "@/lib/sim/fan";
import { CAR_MODELS, CarModel } from "./CarModel";
import { MeshReflectorMaterial } from "@react-three/drei";
import { useQuality } from "../Stage3D";
import {
  CAR_SHAPES,
  makeBrandGraphic,
  makeCarBody,
  makeAlloy,
  makeTyre,
  makeCarPanelMap,
  makeCarPillars,
  makeWordmark,
} from "./geometry";

/* ------------------------------------------------------------------ */
/* Dimensions                                                          */
/* ------------------------------------------------------------------ */

/**
 * The shell, solved from the reference image rather than taken from the
 * brief's figures - the brief itself says the image wins where they differ,
 * and they differ by about a factor of two.
 *
 * Three measurements fix the geometry. The platform's ellipse spans y
 * 0.63-0.69 of the frame, which for any eye-level camera is impossible at the
 * stated 7.5 m diameter: solving the pair gives a lens about 2.35 m up. The
 * hero's height in frame then puts it 11.5 m away, and the floor-to-back-wall
 * junction at y 0.65 puts the back wall 4-5 m behind the platform. A 78
 * degree lens at x = 16.5 of a 29 m room also, simply, cannot see the x = 0
 * wall (the half-field runs out 20 m down-range of a 17 m offset), and the
 * reference plainly shows that wall's panel - so the room is about 19.5 m
 * wide, not 29, and the lens stands 8.3 m off the left wall.
 *
 * Corner origin as ever: x = 0 is the left wall the big panel hangs on,
 * z = 0 the back wall, and the camera stands near z = 17.5 looking down -Z.
 */
export const SH = {
  w: 19.5,
  d: 22,
  h: 5.8,
} as const;

/**
 * SCAFFOLDING. The stock is off while the room is built against the
 * reference; the brief for this pass is the shell, not the cars.
 */
const SHOW_CARS = true;

/** Where everything stands. Shared with the light rig. */
export const SH_PLAN = {
  /** The circular hero platform, 150 mm proud, 4-5 m clear of the back wall. */
  hero: { x: 6.5, z: 6.0, r: 2.9, h: 0.15 },
  /** The oval drop-ceiling soffit over it, recessed 400 mm into the slab. */
  coffer: { rx: 3.5, rz: 2.3, band: 0.18, y: SH.h - 0.4, drop: 0.4 },
  /**
   * Backlit graphic panels. `face` says which plane a panel hangs on: "left"
   * is the x = 0 wall facing into the room, "back" the z = 0 wall facing the
   * camera.
   */
  graphics: [
    {
      face: "left" as const,
      x: 0.12,
      z: 2.9,
      w: 4.5,
      h: 5.2,
      y: 2.9,
      line: "DRIVEN\nBY A BRIGHTER\nTOMORROW",
    },
    {
      face: "back" as const,
      x: 10.0,
      z: 0.1,
      w: 3.5,
      h: 3.5,
      y: 2.4,
      line: "MORE\nTHAN\nA CAR\nA LIFESTYLE",
    },
  ],
  /** The dark-blue sign under the mezzanine. */
  sign: {
    x: 15.2,
    z: 0.3,
    w: 4.0,
    h: 1.8,
    y: 1.7,
    line: "EXPERIENCE\nTHE EXTRAORDINARY",
  },
  /** The big clad pillar, and the narrower lit fin beside it. */
  columns: [
    { x: 10.6, z: 5.8, w: 1.5 },
    { x: 12.0, z: 5.8, w: 0.5 },
  ],
  /** Mezzanine, back right: slab at 3.6, balustrade 1.1 above it. */
  mezz: { x0: 12, x1: SH.w, z0: 0, z1: 5, y: 3.6, rail: 1.1 },
  /** Customer lounge: a round rug with chairs on it, right foreground. */
  lounge: { x: 11.6, z: 11.2, r: 1.9 },
  /** Reception desk, right foreground, 4.5 m of it. */
  desk: { x: 13.6, z0: 10.0, z1: 14.3, h: 1.1, d: 0.9 },
  /** The blue-to-magenta LED wall on the right, behind the lounge. */
  rgbWall: { x: SH.w - 0.1, z0: 2.5, z1: 7.5, y0: 0.3, y1: 5.5 },
  /** Dark walnut slat ceiling over the right bay. */
  slats: { x0: 10.8, x1: SH.w, z0: 0, z1: 10.0, y: SH.h },
  /** The stepped soffit band around the white ceiling. */
  soffit: { drop: 0.3, zBack: 2.4, xLeft: 1.6, zFront: 16.0, xRight: 10.8 },
} as const;

/**
 * The cars, placed around the solved platform. Off for now - see SHOW_CARS -
 * but kept current so switching the stock back on lands it in the room the
 * shell actually is, not the one the brief described.
 */
export const SH_CARS = [
  { id: "coupe", kind: "coupe", x: 4.6, z: 9.2, rot: 1.432, colour: "#969ba3", hero: false },
  { id: "sedan", kind: "saloon", x: 4.2, z: 4.6, rot: 1.571, colour: "#1b1d21", hero: false },
  { id: "suv", kind: "suv", x: 6.5, z: 6.0, rot: 1.466, colour: "#28382d", hero: true },
  { id: "sport", kind: "coupe", x: 10.0, z: 1.6, rot: 0.973, colour: "#8e1c13", hero: false },
  { id: "white", kind: "suv", x: 16.0, z: 1.3, rot: 1.16, colour: "#c9ccce", hero: false },
  { id: "black", kind: "saloon", x: 18.6, z: 1.8, rot: 1.431, colour: "#141619", hero: false },
] as const;

/* ------------------------------------------------------------------ */
/* Materials                                                          */
/* ------------------------------------------------------------------ */

/**
 * Light above, darker below — which is what the reference actually is.
 *
 * This room was built dark on the theory that a showroom reads as premium
 * through contrast: charcoal everything, with the cars the brightest thing in
 * the frame. Measured against the client's own reference photograph, that is
 * backwards. Sampled from it: ceiling 103, upper wall 111, floor 113. Sampled
 * from ours at the same points: ceiling **8**, wall **15**, floor 133.
 *
 * So the real room has a lit pale ceiling and pale walls, and a floor that is
 * no brighter than they are. Ours had a near-black lid over a bright floor —
 * the inverse — and the inverse reads as a basement, however good the cars in
 * it are. Plaster and painted board are 0.6 to 0.75 reflectance; only the
 * feature walls and the slatted bay are dark, and those stay dark.
 */
const M = {
  /**
   * Polished concrete, and darker than it looks like it should be.
   *
   * Measured against the reference at the same points: its floor reads 111 in
   * the foreground and 97 in the middle distance. Ours read 139 and 123 — the
   * right shape, a quarter too bright, so this is a straight scale of the
   * albedo rather than anything done to the lighting.
   */
  floor: new THREE.MeshPhysicalMaterial({
    color: "#9b968d",
    roughness: 0.14,
    metalness: 0.0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.3,
  }),
  /** The floor without a reflector, for machines that cannot afford one. */
  floorFlat: new THREE.MeshPhysicalMaterial({
    color: "#9c968c",
    roughness: 0.12,
    metalness: 0.0,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 2.4,
  }),
  /** The hero platform deck. */
  deck: new THREE.MeshPhysicalMaterial({
    color: "#575350",
    roughness: 0.1,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.035,
    envMapIntensity: 1.5,
  }),
  /**
   * Pale plaster, not charcoal — and the ceiling is the *only* surface that
   * wanted inverting. Measured against the reference it now lands at 73–97
   * against its 83–99, which is as close as this gets.
   *
   * `envMapIntensity` is pulled down because the shared procedural
   * environment carries a deliberately cool fill from the glazing side, which
   * is right in the rooms it was built for and wrong here: it is the only
   * light a downward-facing surface receives in a room whose fittings all
   * point at the floor, and it left a cool ceiling (B/R 1.04) in a room whose
   * reference holds B/R 0.76 on every surface. The environment itself is
   * shared with seven approved rooms and is not ours to retune.
   */
  ceiling: new THREE.MeshStandardMaterial({
    color: "#f4eee4",
    roughness: 0.94,
    envMapIntensity: 0.3,
  }),
  /**
   * The ring rail: matt black, like the track heads bolted to it.
   *
   * It was pale plaster on the reading that the ring is a soffit. It is not —
   * the reference shows an extruded rail hung on rods, the same profile and
   * the same finish as the straight track runs crossing the ceiling beside
   * it. One component, bent into a circle.
   */
  coffer: new THREE.MeshStandardMaterial({
    color: "#121316",
    roughness: 0.45,
    metalness: 0.35,
  }),
  /**
   * Painted board, and dark after all.
   *
   * This went pale with the ceiling, on the reading that the reference's
   * upper register is light throughout. It is not. Sampled at matching
   * points, the reference's ceiling runs 83–99 and its back wall 65; ours
   * came back at 188, which is three times the figure and was the largest
   * single error in the room. The pale band in the photograph is the ceiling
   * soffit; the wall hanging beneath it is charcoal, and the backlit graphic
   * panels only read because of it.
   */
  wall: new THREE.MeshStandardMaterial({
    color: "#242220",
    roughness: 0.93,
    envMapIntensity: 0.3,
  }),
  dark: new THREE.MeshStandardMaterial({ color: "#191b1e", roughness: 0.6 }),
  darker: new THREE.MeshStandardMaterial({ color: "#0d0e10", roughness: 0.7 }),
  /**
   * Warm oak, for the desk. The slat ceiling keeps its own darker pair of
   * walnut tones (see `SlatCeiling`); this one was shared with it at #2f2016,
   * which under the room's light is a crate, and the reference's desk is the
   * warmest object in its corner.
   */
  wood: new THREE.MeshStandardMaterial({ color: "#6b4a2c", roughness: 0.52 }),
  track: new THREE.MeshStandardMaterial({
    color: "#101113",
    roughness: 0.42,
    metalness: 0.45,
  }),
  /**
   * Alloy, not chrome.
   *
   * A fully metallic surface shows only what it reflects, and in a dark room
   * that is almost nothing — at metalness 0.95 the wheels came back as black
   * discs however bright the spotlights were. Brushed alloy keeps a diffuse
   * base for the beams to land on, which is also what a machined rim is.
   */
  rim: new THREE.MeshStandardMaterial({
    color: "#aeb3b8",
    roughness: 0.32,
    metalness: 0.6,
    envMapIntensity: 1.8,
  }),
  /** Rubber. Rough enough that no fitting in the room puts a highlight on it. */
  tyre: new THREE.MeshStandardMaterial({ color: "#121315", roughness: 0.94 }),
  /** Mesh, in shadow but not a void. Near-black reads as a hole in the car. */
  grille: new THREE.MeshStandardMaterial({ color: "#26282c", roughness: 0.78, metalness: 0.2 }),
  /** A blank plate. No characters on it — it is not anybody's registration. */
  plate: new THREE.MeshStandardMaterial({ color: "#c8c9c4", roughness: 0.6 }),
  chrome: new THREE.MeshStandardMaterial({
    color: "#b9bec4",
    roughness: 0.16,
    metalness: 0.92,
    envMapIntensity: 2.2,
  }),
  glass: new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: 0.04,
    transparent: true,
    opacity: 0.08,
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
  const sf = SH_PLAN.soffit;
  const hero = SH_PLAN.hero;
  const quality = useQuality();

  return (
    <group>
      {/*
        The floor, and on a capable machine a real one.

        `MeshReflectorMaterial` renders the scene a second time into a mirror
        buffer, which is genuinely expensive — but a showroom floor that does
        not carry the cars and the LED lines back at you is not a showroom
        floor, it is lino. So it is the one place in this project worth a
        second pass, and it is gated: the high tier gets the reflector, and
        everything else gets a very smooth physical material that picks up the
        environment instead.

        `mirror` is deliberately well under one. A mirror is a swimming pool;
        polished terrazzo returns maybe a third of what lands on it and the
        aggregate scatters the rest.
      */}
      <mesh position={[SH.w / 2, 0, SH.d / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[SH.w, SH.d]} />
        {quality === "high" ? (
          <MeshReflectorMaterial
            resolution={512}
            mixBlur={1.2}
            /**
             * Under three, not over.
             *
             * `mixStrength` scales the reflection against the base colour, and
             * at the higher figure the warm scenes came back with the whole
             * lower half of the frame reading as an orange sheet rather than
             * as a dark floor carrying warm highlights. Terrazzo reflects; it
             * does not become the thing it reflects.
             */
            mixStrength={1.5}
            blur={[400, 110]}
            mirror={0.4}
            depthScale={0.8}
            minDepthThreshold={0.3}
            maxDepthThreshold={1.3}
            color="#15171a"
            roughness={0.45}
            metalness={0.1}
          />
        ) : (
          <primitive object={M.floorFlat} attach="material" />
        )}
      </mesh>

      {/*
        A solid ceiling, with the ring hung beneath it.

        It used to be four bands and an annulus around a circular opening,
        with the coffer pushed *up* into the hole. The reference does the
        opposite: the ceiling runs through, and a white ring is suspended
        below it with the track heads on its underside. That ring is the most
        recognisable thing in the photograph — the hero car stands inside it —
        and a recess cut into the ceiling reads as nothing at all from eye
        level, which is why ours never showed.
      */}
      <mesh
        position={[SH.w / 2, SH.h, SH.d / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[SH.w, SH.d]} />
        <primitive object={M.ceiling} attach="material" />
      </mesh>

      {/*
        The stepped soffit over the left bay.

        Four planes rather than two boxes: the undersides are all anyone sees
        from eye level and the fascias are what make the step read, while the
        top faces would be inside the void between soffit and slab, where
        nothing can look at them.
      */}
      {[
        // Back band, and its fascia facing into the room.
        { p: [sf.xLeft + (sf.xRight - sf.xLeft) / 2, SH.h - sf.drop, sf.zBack / 2] as [number, number, number],
          r: [Math.PI / 2, 0, 0] as [number, number, number], a: sf.xRight - sf.xLeft, b: sf.zBack },
        { p: [sf.xLeft + (sf.xRight - sf.xLeft) / 2, SH.h - sf.drop / 2, sf.zBack] as [number, number, number],
          r: [0, 0, 0] as [number, number, number], a: sf.xRight - sf.xLeft, b: sf.drop },
        // Left band, running forward from the back one, and its fascia.
        { p: [sf.xLeft / 2, SH.h - sf.drop, (sf.zBack + sf.zFront) / 2] as [number, number, number],
          r: [Math.PI / 2, 0, 0] as [number, number, number], a: sf.xLeft, b: sf.zFront - sf.zBack },
        { p: [sf.xLeft, SH.h - sf.drop / 2, (sf.zBack + sf.zFront) / 2] as [number, number, number],
          r: [0, Math.PI / 2, 0] as [number, number, number], a: sf.zFront - sf.zBack, b: sf.drop },
      ].map((f, i) => (
        <mesh key={`sf-${i}`} position={f.p} rotation={f.r} receiveShadow>
          <planeGeometry args={[f.a, f.b]} />
          <primitive object={M.ceiling} attach="material" />
        </mesh>
      ))}

      {/*
        The ring: a rail, a cove and the rods that hang them.

        The rail is a square extrusion — `band` wide, `drop` deep — closed top
        and bottom so it has a visible soffit for the heads to hang from. The
        lit cove that runs outboard of it is not here: it belongs to the light
        rig, because in the photograph it is a *circuit*, and a circuit has to
        go out when the scene says so. Building it here as plain emissive
        geometry would have left a white line burning through Closing.

        The rods are 0.016 m and there are eight, because six left a span long
        enough to read as a sag.

        `ringGeometry` is drawn in the XY plane and faces +Z, so the soffit
        takes +PI/2 about X to face down and the top face -PI/2. Getting that
        backwards leaves both faces culled and the ring reads as two floating
        cylinders, which is how the first pass of this looked.
      */}
      {/*
        Drawn as a unit ring inside a group scaled on X and Z, so the oval is
        one definition rather than two. The rail's apparent width then varies
        between the major and minor axes by the ratio of the radii - 180 mm
        across the ends, 120 mm down the sides - which is a detail nobody
        measures and far less code than extruding a true offset curve.
      */}
      <group position={[hero.x, c.y, hero.z]} scale={[c.rx, 1, c.rz]}>
        {/* Soffit and top of the rail. */}
        <mesh rotation={[Math.PI / 2, 0, 0]} receiveShadow>
          <ringGeometry args={[1 - c.band / c.rx, 1, 72, 1]} />
          <primitive object={M.coffer} attach="material" />
        </mesh>
        <mesh position={[0, c.drop, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1 - c.band / c.rx, 1, 72, 1]} />
          <primitive object={M.coffer} attach="material" />
        </mesh>
        {/* Its outer and inner faces. */}
        <mesh position={[0, c.drop / 2, 0]}>
          <cylinderGeometry args={[1, 1, c.drop, 72, 1, true]} />
          <primitive object={M.coffer} attach="material" />
        </mesh>
        <mesh position={[0, c.drop / 2, 0]}>
          <cylinderGeometry
            args={[1 - c.band / c.rx, 1 - c.band / c.rx, c.drop, 72, 1, true]}
          />
          <primitive object={M.coffer} attach="material" />
        </mesh>
      </group>
      {/*
        The rods hang outside that group, because a group scaled 4.5 by 3 turns
        a round rod into a ribbon.
      */}
      {Array.from({ length: 8 }, (_, i) => {
        const ang = (i * Math.PI * 2) / 8 + Math.PI / 16;
        const rr = 1 - c.band / c.rx / 2;
        const rod = SH.h - c.y - c.drop;
        return (
          <mesh
            key={`rod-${i}`}
            position={[
              hero.x + Math.cos(ang) * rr * c.rx,
              c.y + c.drop + rod / 2,
              hero.z + Math.sin(ang) * rr * c.rz,
            ]}
          >
            <cylinderGeometry args={[0.016, 0.016, rod, 6]} />
            <primitive object={M.darker} attach="material" />
          </mesh>
        );
      })}

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
  /**
   * The fins run along Z, and that is the whole of this change.
   *
   * They used to be long in X and repeat in Z, which puts them square across
   * the view: a ladder of horizontal bars. In the reference they recede with
   * the room and only read as diagonal because of perspective, which means
   * they run the other way - long in Z, repeating across X. The linear strips
   * in the next component follow them for the same reason.
   */
  const count = Math.floor((s.x1 - s.x0) / pitch);
  const span = s.z1 - s.z0;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const colour = new THREE.Color();
    const a = new THREE.Color("#4a3722");
    const b = new THREE.Color("#2a1d0e");
    for (let i = 0; i < count; i++) {
      m.makeTranslation(s.x0 + SLAT.w / 2 + i * pitch, s.y - SLAT.d / 2, s.z0 + span / 2);
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
      {/*
        The plane behind the fins glows faintly warm, and this is most of what
        makes the reference's timber ceiling read as a lit object rather than
        black bars: the light sits *between* the slats. Emissive geometry, not
        a light - a fitting up here would spend milliseconds on a surface that
        only ever needs to be seen, never to illuminate.
      */}
      <mesh
        position={[s.x0 + (s.x1 - s.x0) / 2, s.y - 0.005, s.z0 + span / 2]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[s.x1 - s.x0, span]} />
        <meshBasicMaterial color="#6a4a24" toneMapped={false} />
      </mesh>
      <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow receiveShadow>
        <boxGeometry args={[SLAT.w, SLAT.d, span]} />
        <meshStandardMaterial color="#ffffff" roughness={0.62} />
      </instancedMesh>
      {/* The deep dark fascia along the bay's open edge. */}
      <mesh position={[s.x0 - 0.12, s.y - 0.34, s.z0 + span / 2]}>
        <boxGeometry args={[0.24, 0.68, span]} />
        <primitive object={M.darker} attach="material" />
      </mesh>
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
            <boxGeometry args={[c.w, SH.h, c.w]} />
            <primitive object={M.dark} attach="material" />
          </mesh>
          {/*
            A dark recess on the two faces the lens can see, with the lit strip
            sitting inside it - the strips themselves belong to the light rig,
            because they are a circuit. The offsets come off `c.w` now; they
            were hard-coded at 0.4 for a single 780 mm column and the plan
            carries a 1.6 m pillar and a 500 mm fin.
          */}
          {[
            { p: [-c.w / 2 - 0.005, SH.h / 2, 0] as [number, number, number], r: -Math.PI / 2 },
            { p: [0, SH.h / 2, c.w / 2 + 0.005] as [number, number, number], r: 0 },
          ].map((f, j) => (
            <mesh key={j} position={f.p} rotation={[0, f.r, 0]}>
              <planeGeometry args={[Math.min(0.14, c.w * 0.34), SH.h - 0.5]} />
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
 * Four wheels from one geometry, in a single draw.
 *
 * The left-hand pair are the same mesh turned through half a revolution about
 * the vertical, which swaps the dished face to the outboard side. Mirroring a
 * geometry would invert its winding and need the material flipped with it;
 * rotating costs nothing and a wheel is symmetric about its axle anyway.
 */
function Wheels({
  geometry,
  material,
  axle,
  track,
  r,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  axle: { front: number; rear: number };
  track: number;
  r: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    let i = 0;
    for (const x of [axle.front, axle.rear]) {
      for (const z of [-track, track]) {
        q.setFromAxisAngle(up, z > 0 ? 0 : Math.PI);
        m.compose(new THREE.Vector3(x, r, z), q, one);
        mesh.setMatrixAt(i++, m);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [axle, track, r, geometry]);

  return (
    <instancedMesh ref={ref} args={[geometry, material, 4]} castShadow receiveShadow />
  );
}

/**
 * One car: paint, glass, a painted roof, wheels in their arches, lamps.
 *
 * Three skins rather than one. The paint stops at the shoulder and closes
 * across with a crowned deck; the glass is a narrower volume standing on that
 * beltline; a painted cap covers the top of it. That step from flank to glass
 * is what a single lofted tube could not produce, and it is the difference
 * between a car and a bar of soap — see `makeCarBody`.
 *
 * Paint is a `MeshPhysicalMaterial` with a clearcoat, which is what car paint
 * physically is: a pigmented base under a clear lacquer, two specular lobes
 * rather than one. It is also the material that makes the high-CRI
 * demonstration visible at all — a single-lobe surface has no depth for a
 * spectrum to flatten.
 *
 * Nothing here is badged. The grille is a dark recess, the lamps are abstract
 * bars, and the proportions come from `CAR_SHAPES`. None of it is anybody's
 * design.
 */
export function Car({
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
  /**
   * A modelled car if one has been supplied for this body type, the
   * procedural loft otherwise. Suspended rather than gated on a loaded flag,
   * so the room draws immediately and each car appears as its file arrives.
   */
  const model = CAR_MODELS[kind];
  const skins = useMemo(
    () => ({
      body: makeCarBody(shape.stations, shape.length, "body"),
      glass: makeCarBody(shape.stations, shape.length, "glass"),
      roof: makeCarBody(shape.stations, shape.length, "roof"),
      pillars: makeCarPillars(shape.stations, shape.length, shape.pillars),
    }),
    [shape],
  );
  const wheel = useMemo(
    () => ({ tyre: makeTyre(shape.wheelR), alloy: makeAlloy(shape.wheelR) }),
    [shape],
  );
  const panels = useMemo(() => makeCarPanelMap(shape.doors), [shape]);

  const paint = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: colour,
        map: panels,
        roughness: 0.3,
        // Metallic flake: enough to pick up the room, not enough to turn the
        // panel into a mirror and lose its colour entirely.
        //
        // 0.28. Car paint is a dielectric with flake suspended in it, not a
        // metal, and at 0.55 a pale silver had so little diffuse left that
        // the body was almost pure reflection — the coupé came back as a
        // white cut-out with a spotlight on it whatever its base colour was.
        metalness: 0.28,
        clearcoat: 1,
        clearcoatRoughness: 0.045,
        // 1.2, not 1.7. A pale metallic at 1.7 saturates to white under the
        // general wash before a spotlight has touched it, and then there is
        // no headroom left for the spotlight to do anything with.
        envMapIntensity: 1.2,
        side: THREE.DoubleSide,
      }),
    [colour, panels],
  );
  /** The roof cap: the same paint without the shut lines over it. */
  const roofPaint = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: colour,
        roughness: 0.3,
        metalness: 0.28,
        clearcoat: 1,
        clearcoatRoughness: 0.045,
        envMapIntensity: 1.2,
        side: THREE.DoubleSide,
      }),
    [colour],
  );

  /**
   * Opaque, dark, and only moderately glossy.
   *
   * Showroom glass is privacy-tinted and lit from above, so what you actually
   * see in a photograph is the ceiling reflected in it — almost never the
   * interior. An opaque dark surface gives exactly that, and it avoids a
   * sorted draw and the depth artefacts that come with one on a curved shell.
   *
   * The gloss had to come *down*. At roughness 0.08 with a full clearcoat the
   * greenhouse was a mirror, so it returned the pale floor across its whole
   * area and every car came out wearing a white bubble instead of a cabin —
   * the glass was the brightest thing on the vehicle. Softening it to 0.2 and
   * halving the environment keeps the sharp highlight along the top of the
   * screen, which is the part that reads as glass, and lets the rest go dark.
   */
  const glass = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#0b0e12",
        roughness: 0.5,
        metalness: 0,
        clearcoat: 0,
        clearcoatRoughness: 0.2,
        envMapIntensity: 0.7,
        /**
         * Glass reflects about four per cent of what hits it, and under a
         * twelve-head ring four per cent is still enough to read as a blank
         * white panel — the hero's windscreen came back as a visor. Cutting
         * the dielectric lobe to a third leaves the highlight along the top
         * of the screen, which is the part that says glass, and lets the
         * rest of it go dark the way a tinted screen does in a photograph.
         */
        specularIntensity: 0.35,
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
  const at = (t: number) =>
    shape.stations.reduce((a, b) =>
      Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a,
    );
  const nose = shape.stations[0];
  const tailSt = shape.stations[shape.stations.length - 1];
  const widest = shape.stations.reduce((a, b) => (b.hw > a.hw ? b : a));
  /** Axles at the classic fractions — the arches are cut to match. */
  const axle = { front: -L * 0.31, rear: L * 0.31 };
  const wheelR = shape.wheelR;
  /**
   * Inset by the tyre's half-width plus a little, so the sidewall sits just
   * inside the flank and fills the arch.
   *
   * The old figure put the whole wheel *inside* the body, which is why every
   * car looked like a blob with discs parked under it: a wheel you cannot see
   * the outer face of is not a wheel.
   */
  const tyreW = 0.235;
  const track = widest.hw - tyreW / 2 - 0.03;

  if (model) {
    return (
      <Suspense fallback={null}>
        <CarModel url={model} colour={colour} length={shape.length} />
      </Suspense>
    );
  }

  return (
    <group>
      <mesh geometry={skins.body} castShadow receiveShadow>
        <primitive object={paint} attach="material" />
      </mesh>
      <mesh geometry={skins.glass} castShadow>
        <primitive object={glass} attach="material" />
      </mesh>
      <mesh geometry={skins.roof} castShadow>
        <primitive object={roofPaint} attach="material" />
      </mesh>
      {/* A, B and C in paint, cutting the greenhouse into panes. */}
      <mesh geometry={skins.pillars} castShadow>
        <primitive object={roofPaint} attach="material" />
      </mesh>

      {/*
        Four wheels, two draw calls.

        Each wheel used to be eight meshes — tyre, dish, five spokes, hub —
        which is thirty-two a car and a hundred and ninety-two across the
        floor. The tread and the alloy are now one merged geometry apiece,
        instanced four times. The left pair are the same geometry turned
        through half a revolution, which is what puts the dish on the outboard
        side without a mirrored copy.
      */}
      <Wheels geometry={wheel.tyre} axle={axle} track={track} r={wheelR} material={M.tyre} />
      <Wheels geometry={wheel.alloy} axle={axle} track={track} r={wheelR} material={M.rim} />

      {/*
        Door mirrors, on the shoulder at the base of the A-pillar.

        Small, and worth every triangle: a mirror is the one detail that sits
        *outside* the silhouette, so it breaks the smooth outline of the
        greenhouse from any angle and is read instantly as a car.
      */}
      {[-1, 1].map((side) => {
        const st = at(0.34);
        return (
          /**
           * On the beltline, not above it.
           *
           * Mounted at the flank's full half-width but at shoulder + 40 mm,
           * every mirror sat in mid-air: by that height the section has
           * already tucked in to the deck and the body is barely 60 per cent
           * as wide as it is at the waist.
           */
          <group
            key={`m-${side}`}
            position={[(0.34 - 0.5) * L, st.shoulder - 0.02, side * st.hw * 0.86]}
          >
            <mesh position={[0, 0.02, side * 0.05]}>
              <boxGeometry args={[0.045, 0.028, 0.1]} />
              <primitive object={M.darker} attach="material" />
            </mesh>
            <mesh position={[0, 0.055, side * 0.135]} rotation={[0, 0, side * 0.1]}>
              <boxGeometry args={[0.15, 0.08, 0.055]} />
              <primitive object={paint} attach="material" />
            </mesh>
          </group>
        );
      })}

      {/*
        A face, laid out with the clearances written down.

        The first attempt stacked a lamp at 0.685–0.757, a grille at
        0.566–0.688 and an intake at 0.444–0.508 on a nose face only 400 mm
        tall — the lamps and the grille overlapped, and the whole front came
        back as one black hole with a white tab hanging off it. Everything is
        now positioned as a fraction of the nose station's own rise, with
        50 mm of paint showing between each piece, and sized to stay inside
        the ring at its own height so nothing hangs in the air beyond the
        bumper. The grille is dark grey rather than near-black, because a
        hole is not a grille.
      */}
      {(() => {
        const x0 = -L / 2 + 0.03;
        const rise = nose.shoulder - nose.sill;
        const w = nose.hw;
        const at = (f: number) => nose.sill + rise * f;
        return (
          <group>
            {[-1, 1].map((side) => (
              <mesh
                key={`hl-${side}`}
                position={[x0, at(0.847), side * (w * 0.64)]}
                rotation={[0, side * 0.16, side * 0.04]}
              >
                <boxGeometry args={[0.08, rise * 0.153, w * 0.52]} />
                <primitive object={lamp} attach="material" />
              </mesh>
            ))}
            {/* The plate sits 14 mm in front of the grille. Behind it — where
                it started — the grille box swallowed it whole and the only
                thing a magenta test could find was nothing at all. */}
            <mesh position={[x0, at(0.486), 0]}>
              <boxGeometry args={[0.08, rise * 0.29, w * 1.77]} />
              <primitive object={M.grille} attach="material" />
            </mesh>
            <mesh position={[x0 - 0.014, at(0.486), 0]}>
              <boxGeometry args={[0.08, rise * 0.19, 0.26]} />
              <primitive object={M.plate} attach="material" />
            </mesh>
            <mesh position={[x0, at(0.125), 0]}>
              <boxGeometry args={[0.08, rise * 0.167, w * 1.57]} />
              <primitive object={M.darker} attach="material" />
            </mesh>
          </group>
        );
      })()}

      {/* The tail, to the same rules: one bar, a plate, a valance, two pipes. */}
      {(() => {
        const x1 = L / 2 - 0.03;
        const rise = tailSt.shoulder - tailSt.sill;
        const w = tailSt.hw;
        const at = (f: number) => tailSt.sill + rise * f;
        return (
          <group>
            <mesh position={[x1, at(0.8), 0]}>
              <boxGeometry args={[0.08, rise * 0.1, w * 1.4]} />
              <primitive object={tail} attach="material" />
            </mesh>
            <mesh position={[x1 + 0.014, at(0.48), 0]}>
              <boxGeometry args={[0.08, rise * 0.14, 0.26]} />
              <primitive object={M.plate} attach="material" />
            </mesh>
            <mesh position={[x1, at(0.17), 0]}>
              <boxGeometry args={[0.08, rise * 0.16, w * 1.5]} />
              <primitive object={M.darker} attach="material" />
            </mesh>
            {[-1, 1].map((side) => (
              <mesh
                key={`ex-${side}`}
                position={[x1 + 0.02, at(0.17), side * (w * 0.6)]}
                rotation={[0, 0, Math.PI / 2]}
              >
                <cylinderGeometry args={[0.036, 0.036, 0.07, 12]} />
                <primitive object={M.chrome} attach="material" />
              </mesh>
            ))}
          </group>
        );
      })()}
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
        // Portrait canvas for a portrait panel, landscape for a landscape
        // one, so the ridgeline is never stretched to fit.
        const portrait = g.h >= g.w;
        const map = makeBrandGraphic(
          g.line,
          Math.round(g.z * 7),
          portrait ? 1536 : 2048,
          portrait ? 2048 : 1536,
        );
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
      p.emissiveIntensity = on ? 0.95 : 0.06;
    });
  });

  return (
    <group>
      {/*
        Each panel on the plane its plan says, which is the whole of this.
        
        Both of these used to be pinned to the back wall at z = 0.06 with only
        `x` varying - the component was written when both were back-wall art
        and never caught up with the plan, so the left wall's panel was lying
        flat on the far wall thirty-four metres away. It is 4.5 x 5.2 m and it
        was rendering as a postage stamp in the corner of the frame.
      */}
      {SH_PLAN.graphics.map((g, i) => {
        const left = g.face === "left";
        const pos: [number, number, number] = left
          ? [g.x, g.y, g.z]
          : [g.x, g.y, g.z];
        const rot: [number, number, number] = left ? [0, Math.PI / 2, 0] : [0, 0, 0];
        const nudge: [number, number, number] = left ? [0.04, 0, 0] : [0, 0, 0.04];
        return (
          <group key={`gp-${i}`} position={pos} rotation={rot}>
            {/* Dark reveal behind, so the panel has an edge against the wall. */}
            <mesh receiveShadow>
              <planeGeometry args={[g.w + 0.5, g.h + 0.5]} />
              <primitive object={M.darker} attach="material" />
            </mesh>
            <mesh position={[0, 0, 0.04]}>
              <planeGeometry args={[g.w, g.h]} />
              <primitive object={panels[i]} attach="material" />
            </mesh>
            {/* Warm graze down each side, as the reference has. */}
            {[-1, 1].map((sx) => (
              <mesh key={sx} position={[(sx * (g.w + 0.42)) / 2, 0, 0.05]}>
                <planeGeometry args={[0.06, g.h + 0.3]} />
                <meshBasicMaterial color="#ffdcae" toneMapped={false} />
              </mesh>
            ))}
            <primitive object={new THREE.Object3D()} position={nudge} />
          </group>
        );
      })}
    </group>
  );
}

/** Reception desk against the right wall, with the client's own wordmark. */
function Reception({ on }: { on: boolean }) {
  const d = SH_PLAN.desk;
  const len = d.z1 - d.z0;
  const mid = (d.z0 + d.z1) / 2;
  /**
   * Gently curved, because the reference's desk is.
   *
   * Built as a segment of a big cylinder whose centre sits behind the desk, so
   * the face that meets the room bows toward it. The radius is 7 m over 5 m of
   * desk, which is 450 mm of bow - enough to read as a curve in the frame and
   * shallow enough that the wordmark can stay on a flat plane across the
   * nearest part of it without looking stuck on.
   */
  const CURVE_R = 7;
  const arc = len / CURVE_R;
  const cx = d.x + CURVE_R;

  const mark = useMemo(() => {
    const map = makeWordmark("UNISER", "SMART SPACES - FOR A BRIGHTER TOMORROW");
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
    mark.emissiveIntensity = on ? 1.4 : 0.1;
  });

  /** Vertical timber slats across the curved face, as the reference has. */
  const SLATS = 54;

  return (
    <group>
      {/* The curved body. */}
      <mesh position={[cx, d.h / 2 + 0.06, mid]} castShadow receiveShadow>
        <cylinderGeometry
          args={[CURVE_R, CURVE_R, d.h - 0.12, 64, 1, true, Math.PI - arc / 2, arc]}
        />
        <primitive object={M.wood} attach="material" />
      </mesh>
      {/* Its slats, stood just proud of that face. */}
      {Array.from({ length: SLATS }, (_, i) => {
        const t = (i + 0.5) / SLATS - 0.5;
        const a = Math.PI + t * arc;
        return (
          <mesh
            key={`ds-${i}`}
            position={[
              cx + Math.cos(a) * (CURVE_R + 0.012),
              d.h / 2 + 0.06,
              mid + Math.sin(a) * (CURVE_R + 0.012),
            ]}
            rotation={[0, -a, 0]}
          >
            <boxGeometry args={[0.024, d.h - 0.22, 0.03]} />
            <primitive object={M.track} attach="material" />
          </mesh>
        );
      })}
      {/* Stone top, oversailing the front. */}
      <mesh position={[cx, d.h + 0.02, mid]} castShadow receiveShadow>
        <cylinderGeometry
          args={[CURVE_R + 0.07, CURVE_R + 0.07, 0.05, 64, 1, true, Math.PI - arc / 2, arc]}
        />
        <primitive object={M.wall} attach="material" />
      </mesh>
      {/*
        Two lines of light, which is what makes the desk read as an object
        rather than a block: one under the lip of the top, one at the recessed
        base. Both are emissive only - the desk lights itself in the
        photograph, it does not light the room.
      */}
      {[d.h - 0.04, 0.09].map((y, i) => (
        <mesh
          key={`dg-${i}`}
          position={[cx, y, mid]}
          rotation={[0, 0, 0]}
        >
          <cylinderGeometry
            args={[CURVE_R + 0.02, CURVE_R + 0.02, 0.05, 64, 1, true, Math.PI - arc / 2, arc]}
          />
          <meshBasicMaterial color="#ffdfb4" toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* The wordmark, across the nearest part of the curve. */}
      <mesh position={[d.x - 0.02, d.h * 0.56, mid]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[len * 0.6, 0.44]} />
        <primitive object={mark} attach="material" />
      </mesh>
    </group>
  );
}

/** Dark leather tub chairs round a low table, on a thin rug. */
/**
 * The dark-blue sign under the mezzanine.
 *
 * Emissive only, and deliberately dim: in the reference this panel is lit by
 * a blue wash rather than being a lightbox, and the text sits on it quietly.
 * Driven by the same display flag as the graphics and the desk, so Closing
 * takes it down with everything else.
 */
function Sign({ on }: { on: boolean }) {
  const g = SH_PLAN.sign;
  const mark = useMemo(() => {
    const map = makeWordmark("EXPERIENCE", "THE EXTRAORDINARY");
    return new THREE.MeshStandardMaterial({
      map,
      emissive: new THREE.Color("#5f86c8"),
      emissiveMap: map,
      emissiveIntensity: 0,
      roughness: 0.6,
    });
  }, []);
  useLayoutEffect(() => {
    mark.emissiveIntensity = on ? 0.8 : 0.08;
  });

  return (
    <group position={[g.x, g.y, g.z]}>
      {/* The blue ground, washed from below. */}
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[g.w + 0.5, g.h + 0.6]} />
        <meshStandardMaterial color="#11223f" roughness={0.85} />
      </mesh>
      <mesh>
        <planeGeometry args={[g.w, g.h]} />
        <primitive object={mark} attach="material" />
      </mesh>
      <mesh position={[0, -g.h / 2 - 0.26, 0.02]}>
        <planeGeometry args={[g.w + 0.4, 0.07]} />
        <meshBasicMaterial color="#8fb8ff" toneMapped={false} />
      </mesh>
    </group>
  );
}

function Lounge() {
  const { x, z, r } = SH_PLAN.lounge;
  const leather = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#3b332c",
        roughness: 0.5,
        clearcoat: 0.35,
        clearcoatRoughness: 0.45,
      }),
    [],
  );

  /**
   * Three chairs, not four, and a round rug rather than a rectangle.
   *
   * The reference seats three in an open C that faces the desk, with the low
   * table off the rug's centre. A closed ring of four reads as a meeting; an
   * open three reads as somewhere to wait, which is what this corner is.
   */
  const SEATS = [-0.55, 0.35, 1.5];

  return (
    <group position={[x, 0, z]} rotation={[0, -0.5, 0]}>
      <mesh position={[0, 0.006, 0]} receiveShadow>
        <cylinderGeometry args={[r, r, 0.012, 48]} />
        <meshStandardMaterial color="#85868a" roughness={1} />
      </mesh>
      {SEATS.map((a, i) => (
        <group
          key={i}
          position={[Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3]}
          rotation={[0, -a + Math.PI, 0]}
        >
          {/*
            Barrel back, and visibly a chair rather than a drum: the back
            rises past the seat, rolls over at an arm-height lip, and the seat
            cushion sits inside it with a shadow gap all round.
          */}
          <mesh position={[0, 0.52, -0.03]} castShadow receiveShadow>
            <cylinderGeometry args={[0.42, 0.38, 0.62, 26, 1, true, Math.PI * 0.16, Math.PI * 1.4]} />
            <primitive object={leather} attach="material" />
          </mesh>
          {/* The rolled rim: the same arc as the shell, flared a little, so
              the two can never part company the way a torus at its own start
              angle did. */}
          <mesh position={[0, 0.85, -0.03]} castShadow>
            <cylinderGeometry args={[0.45, 0.41, 0.09, 26, 1, true, Math.PI * 0.16, Math.PI * 1.4]} />
            <primitive object={leather} attach="material" />
          </mesh>
          <mesh position={[0, 0.42, 0.06]} castShadow>
            <cylinderGeometry args={[0.34, 0.34, 0.13, 24]} />
            <primitive object={leather} attach="material" />
          </mesh>
          {/* Four slim legs, which is what lifts it off the rug. */}
          {[0.6, 2.0, 3.5, 4.9].map((la, j) => (
            <mesh
              key={j}
              position={[Math.cos(la) * 0.3, 0.14, Math.sin(la) * 0.3]}
              castShadow
            >
              <cylinderGeometry args={[0.022, 0.018, 0.28, 8]} />
              <primitive object={M.track} attach="material" />
            </mesh>
          ))}
        </group>
      ))}
      {/* Low round table, off centre, with a tray on it. */}
      <group position={[0.35, 0, 0.5]}>
        <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.37, 0.37, 0.05, 30]} />
          <meshStandardMaterial color="#3e2c1c" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.2, 0]} castShadow>
          <cylinderGeometry args={[0.055, 0.055, 0.4, 14]} />
          <primitive object={M.track} attach="material" />
        </mesh>
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 0.025, 24]} />
          <meshStandardMaterial color="#3e2c1c" roughness={0.5} />
        </mesh>
      </group>
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
      {/*
        The soffit under it reads as sheltered, not as a hole.

        It was `darker`, which is #0d0e10, and against a room that now sits at
        77 overall it was simply absent — the right-hand third of the frame
        measured 27 where the reference measures 61, and most of that third is
        this plane and what is under it. Sheltered means in shadow, and a
        surface in shadow still has a value.
      */}
      <mesh
        position={[m.x0 + w / 2, m.y - 0.29, m.z0 + d / 2]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[w, d]} />
        <primitive object={M.dark} attach="material" />
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
      {/* The warm line along the balustrade's base, which in the reference is
          what draws the mezzanine's edge across the frame. */}
      <mesh position={[m.x0 + w / 2, m.y + 0.04, m.z1 + 0.01]}>
        <planeGeometry args={[w - 0.2, 0.05]} />
        <meshBasicMaterial color="#ffd9a4" toneMapped={false} />
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
      {/*
        The offices behind the glazing, as a lit wall rather than a lit room.

        Measured at the same point, the reference's mezzanine reads 61 and
        ours read 29 — the darkest part of the frame against one of the
        brighter parts of the photograph, and the right-hand third of the shot
        is a third of the shot. The honest fix is a fitting up there, and the
        honest fix is not affordable: this room runs at 11.7 fps on the high
        tier and a rect-area light costs about six milliseconds a frame.

        An emissive plane costs a draw call and no light at all. It cannot
        illuminate the chairs in front of it, which is exactly why it is
        placed *behind* them — what the camera gets is backlit furniture
        against a glowing wall, which is what the photograph shows, and the
        one thing an emitter of this kind is genuinely good at.
      */}
      {/*
        The offices behind the glazing.

        Three layers, because that is what reads from the floor: a warm lit
        back wall, a brighter band where the ceiling cove washes down it, and
        the furniture in front as silhouettes. None of it is a light - an
        emitter here would cost six milliseconds a frame to illuminate a room
        nobody can walk into. What the camera gets is backlit furniture
        against a glowing wall, which is exactly what the photograph shows.
      */}
      <mesh position={[m.x0 + w / 2, m.y + 1.35, m.z0 + 0.08]}>
        <planeGeometry args={[w - 0.5, 2.3]} />
        <meshBasicMaterial color="#8a7254" toneMapped={false} />
      </mesh>
      <mesh position={[m.x0 + w / 2, m.y + 2.3, m.z0 + 0.1]}>
        <planeGeometry args={[w - 0.8, 0.32]} />
        <meshBasicMaterial color="#ffe3bc" toneMapped={false} />
      </mesh>
      {/* Desks and task chairs, seen through the glass. */}
      {[1.8, 4.2, 6.6, 8.6].map((o, i) => (
        <group key={`mo-${i}`} position={[m.x0 + o, m.y, m.z0 + 1.5]}>
          <mesh position={[0, 0.62, 0]} castShadow>
            <cylinderGeometry args={[0.26, 0.24, 0.5, 14, 1, false, Math.PI * 0.2, Math.PI * 1.3]} />
            <primitive object={M.darker} attach="material" />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.04, 0.05, 0.4, 8]} />
            <primitive object={M.darker} attach="material" />
          </mesh>
          {i % 2 === 0 && (
            <mesh position={[0.5, 0.74, -0.7]}>
              <boxGeometry args={[1.5, 0.04, 0.75]} />
              <primitive object={M.dark} attach="material" />
            </mesh>
          )}
        </group>
      ))}
      {/* Glazing across the front of it. */}
      <mesh position={[m.x0 + w / 2, m.y + 1.5, m.z1 - 0.04]}>
        <boxGeometry args={[w - 0.3, 2.6, 0.02]} />
        <primitive object={M.glass} attach="material" />
      </mesh>
      {/* The warm cove that washes down the slab's face. */}
      <mesh position={[m.x0 + w / 2, m.y - 0.3, m.z1 - 0.03]}>
        <planeGeometry args={[w - 0.4, 0.1]} />
        <meshBasicMaterial color="#ffdfb6" toneMapped={false} />
      </mesh>
      {/*
        The feature line under its edge, and it is a *line*, which is to say
        it is lit. It was painted in the darkest material in the file, which
        made it a feature nobody could see. In the reference this edge is the
        brightest thing on the right-hand side and it is what separates the
        mezzanine from the lounge beneath it.
      */}
      <mesh position={[m.x0 + w / 2, m.y - 0.5, m.z1 - 0.02]}>
        <planeGeometry args={[w * 0.6, 0.12]} />
        <meshBasicMaterial color="#ffecd2" toneMapped={false} />
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

/**
 * Against the walls, and one at the edge of the frame to close it.
 *
 * The fourth of these used to stand at x = 16.3, four metres in front of the
 * lens and dead centre: a two-metre ficus straight through the middle of the
 * shot, hiding the red car and most of the lounge behind it. Planting belongs
 * at the edges of a showroom floor, which is also where the reference puts
 * it — the sightline from the door to the hero car is the one thing on the
 * plan nothing is allowed to stand in.
 */
const PLANTERS = [
  // Left wall, flanking the big panel.
  { x: 0.9, z: 1.2, s: 1.15 },
  { x: 0.9, z: 6.0, s: 1.0 },
  { x: 0.9, z: 12.5, s: 1.2 },
  // In front of the LED wall, and by the fin pillar, as the crop shows.
  { x: 18.4, z: 4.0, s: 1.1 },
  { x: 18.4, z: 7.0, s: 0.95 },
  { x: 11.0, z: 9.6, s: 0.9 },
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
    /**
     * No map on the floor at all.
     *
     * It carried a marble texture, and on near-black terrazzo that is both
     * invisible and actively harmful: a map multiplies the albedo, so its
     * variation lands as mottling in the reflection rather than as aggregate.
     * Fine aggregate at this scale is a roughness detail, not a colour one,
     * and the reflector carries the look instead.
     */
    M.floor.map = null;
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
      <Sign on={screensOn} />
      <Lounge />
      <Mezzanine />
      <Planting />
      {/*
        SCAFFOLDING - the stock is switched off while the room itself is being
        built against the reference, so the shell can be judged on its own.
        Flip `SHOW_CARS` back to true to put the fleet and the hero back.
      */}
      {SHOW_CARS && <Fleet lampsOn={lampsOn} />}
      <HeroPlatform radiansPerSecond={turntableRadiansPerSecond}>
        {SHOW_CARS && (
          <group rotation={[0, hero.rot, 0]}>
            <Car kind={hero.kind} colour={hero.colour} lampsOn={lampsOn} />
          </group>
        )}
      </HeroPlatform>
    </group>
  );
}

export { M as SH_MATERIALS };
