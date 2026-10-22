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
 * The shell.
 *
 * `x` runs from the graphic wall on the left (0) to the feature wall on the
 * right (w); `z` runs from the back wall (0) to the glazed frontage behind the
 * camera (d).
 */
export const SH = {
  w: 30,
  d: 25,
  h: 7,
} as const;

/** Where everything stands. Shared with the light rig. */
export const SH_PLAN = {
  /** The raised circular hero platform, 6 m across and only 150 mm proud. */
  hero: { x: 13.5, z: 10.5, r: 3.0, h: 0.15 },
  /**
   * The track ring above it. Suspended, not cut in — see `Shell`.
   *
   * `band` is the width of the rail itself, not of an annulus. It was 0.85,
   * which is a metre of plaster painted the same colour as the ceiling eighty
   * centimetres behind it; at eye level the two tones differ by six values and
   * the ring disappeared into the soffit. In the reference it is a slim dark
   * rail read against pale plaster, and the contrast is the whole of why it
   * is the most recognisable thing in the photograph.
   *
   * 5 m across, not 8, and hung at 5.1 rather than 5.35. Apparent size is
   * radius over distance: the camera stands 10.3 m from the middle of it, so
   * 8 m spanned 51% of the frame where the reference spans 26%. Height is not
   * a free parameter either — the near arc is only 7.8 m away, and at 5.5 m
   * it sat 28° above the lens against a 25° half-field, so the top of the
   * ring was cropped off by the frame edge.
   */
  coffer: { r: 2.5, band: 0.18, y: 5.1, drop: 0.22 },
  /**
   * Backlit graphic panels. On the back wall — see the note in `Graphics`.
   *
   * Portrait, both of them. These were 7.0 × 3.4 and 6.0 × 3.0, which is
   * landscape at two to one; in the reference the left panel measures roughly
   * 153 × 280 px and the right one is taller than it is wide as well. A
   * landscape panel reads as a television, and the room already has screens.
   * A portrait one reads as print, which is what a brand wall is.
   */
  graphics: [
    // x = 6.5, not 4.6: on the wider lens the panel sat against the frame
    // edge and lost its left third. The reference puts it near the edge and
    // whole, which is a different thing.
    { x: 6.5, w: 3.3, h: 4.3, y: 3.0, line: "DRIVEN\nBY A BRIGHTER\nTOMORROW" },
    { x: 13.6, w: 2.9, h: 3.7, y: 2.8, line: "MORE\nTHAN\nA CAR\nA LIFESTYLE" },
  ],
  /** Tall black columns with vertical strips. */
  /**
   * Clear of the sightline to the graphics.
   *
   * The first of these stood at x = 8.6, which from a camera at x = 7 is
   * almost dead ahead — it ran straight down the middle of the left graphic
   * panel and cut the tagline in half. A column is structure; it is allowed
   * to be in the picture, and it is not allowed to be in front of the one
   * thing on that wall worth reading.
   */
  columns: [
    { x: 5.0, z: 3.4 },
    { x: 20.6, z: 13.2 },
    { x: 20.6, z: 4.2 },
  ],
  /** Mezzanine, back right. */
  mezz: { x0: 20.2, x1: SH.w, z0: 0, z1: 7.6, y: 3.6 },
  /** Customer lounge on the floor, forward of it. */
  lounge: { x: 23.6, z: 13.6 },
  /** Reception desk against the right wall. */
  desk: { x: 28.4, z0: 9.0, z1: 15.4, h: 1.08, d: 0.9 },
  /** RGB feature panels beside the mezzanine. */
  rgbWall: { x: SH.w - 0.1, z0: 1.4, z1: 7.2, y0: 0.2, y1: 3.4 },
  /** Dark walnut slat bay over the right-hand ceiling. */
  slats: { x0: 18.0, x1: SH.w, z0: 0.4, z1: 16.0, y: 6.8 },
  /**
   * The dropped soffit over the left bay: a band across the back and one down
   * the left, stepping the ceiling down 400 mm around the display floor.
   *
   * The linear runs sit on its underside at its inner edge — see `LINES` in
   * the light rig, which reads `drop` from here so the two cannot part
   * company. 400 mm because it has to read as a step from a lens 1.66 m off
   * the floor and twenty metres away, and because anything deeper starts
   * eating into the ring's headroom.
   */
  soffit: { drop: 0.4, zBack: 4.6, xLeft: 2.6, zFront: 17.2, xRight: 16.2 },
} as const;

/**
 * The cars. Generic forms with no badge, grille or marque on any of them.
 *
 * `kind` picks a silhouette rather than a model: the proportions of a coupé,
 * a saloon and a tall estate are different enough to read across a room, and
 * that is the whole requirement. Anything more specific would be somebody's
 * design.
 */
export const SH_CARS = [
  /**
   * Laid out to the reference photograph, which is a near-axial view.
   *
   * The first arrangement was built around a hard diagonal camera and put the
   * white saloon across the whole bottom of the frame — the fault the brief
   * names. In the reference the coupé sits in the *left third*, nearer the
   * lens than the hero and turned so its nose comes toward the camera and its
   * tail recedes to the upper left.
   *
   * Every heading here is set *relative to the lens*, not to the room. The
   * first pass picked them by eye against the plan and three of the six came
   * out within ten degrees of pointing straight down the camera axis — and a
   * car seen head-on is a slab, because the one view that shows none of its
   * flank is the one view with no length in it. Each is now turned 40 to 45
   * degrees off the sightline, which is the three-quarter the reference uses
   * on all six of its vehicles and the angle every showroom parks to.
   *
   * Every car is on the floor. The pair on the right stand under the
   * mezzanine, past the lounge, as the smaller vehicles do in the reference.
   */
  { id: "coupe", kind: "coupe", x: 9.8, z: 10.2, rot: 1.181, colour: "#70767d", hero: false },
  { id: "sedan", kind: "saloon", x: 7.4, z: 7.0, rot: 1.349, colour: "#33373d", hero: false },
  { id: "suv", kind: "suv", x: 13.5, z: 10.5, rot: 1.822, colour: "#28382d", hero: true },
  { id: "sport", kind: "coupe", x: 18.5, z: 11.4, rot: 1.807, colour: "#8e1c13", hero: false },
  { id: "white", kind: "saloon", x: 24.6, z: 4.2, rot: 1.669, colour: "#9ea0a0", hero: false },
  { id: "black", kind: "saloon", x: 27.4, z: 7.2, rot: 1.514, colour: "#141619", hero: false },
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
    color: "#4d4a45",
    roughness: 0.14,
    metalness: 0.0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.3,
  }),
  /** The floor without a reflector, for machines that cannot afford one. */
  floorFlat: new THREE.MeshPhysicalMaterial({
    color: "#4e4b47",
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
    color: "#c6c0b6",
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
    color: "#3a3733",
    roughness: 0.93,
    envMapIntensity: 0.3,
  }),
  dark: new THREE.MeshStandardMaterial({ color: "#191b1e", roughness: 0.6 }),
  darker: new THREE.MeshStandardMaterial({ color: "#0d0e10", roughness: 0.7 }),
  /** Dark walnut on the slat bay. */
  wood: new THREE.MeshStandardMaterial({ color: "#2f2016", roughness: 0.58 }),
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
      <group position={[hero.x, c.y, hero.z]}>
        {/* Soffit and top of the rail. */}
        <mesh rotation={[Math.PI / 2, 0, 0]} receiveShadow>
          <ringGeometry args={[c.r - c.band, c.r, 72, 1]} />
          <primitive object={M.coffer} attach="material" />
        </mesh>
        <mesh position={[0, c.drop, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[c.r - c.band, c.r, 72, 1]} />
          <primitive object={M.coffer} attach="material" />
        </mesh>
        {/* Its outer and inner faces. */}
        <mesh position={[0, c.drop / 2, 0]}>
          <cylinderGeometry args={[c.r, c.r, c.drop, 72, 1, true]} />
          <primitive object={M.coffer} attach="material" />
        </mesh>
        <mesh position={[0, c.drop / 2, 0]}>
          <cylinderGeometry args={[c.r - c.band, c.r - c.band, c.drop, 72, 1, true]} />
          <primitive object={M.coffer} attach="material" />
        </mesh>
        {Array.from({ length: 8 }, (_, i) => {
          const ang = (i * Math.PI * 2) / 8 + Math.PI / 16;
          const rr = c.r - c.band / 2;
          const rod = SH.h - c.y - c.drop;
          return (
            <mesh
              key={`rod-${i}`}
              position={[Math.cos(ang) * rr, c.drop + rod / 2, Math.sin(ang) * rr]}
            >
              <cylinderGeometry args={[0.016, 0.016, rod, 6]} />
              <primitive object={M.darker} attach="material" />
            </mesh>
          );
        })}
      </group>

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
        // Portrait canvas for a portrait panel. A 16:9 texture on a 3.3 × 4.3
        // plane squashes the ridgeline to about half its width, and a
        // mountain range is the one thing in the frame you cannot stretch.
        const map = makeBrandGraphic(g.line, Math.round(g.x * 7), 1536, 2048);
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
    // 1.4, not 0.5. In the reference this wall is the brightest thing on the
    // right-hand side and it is what makes the reception read as the second
    // destination in the room; measured, that zone came back at 57 against
    // the photograph's 120, and this is most of the difference.
    mark.emissiveIntensity = on ? 1.4 : 0.1;
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
      {/*
        Recessed plinth, so it floats over its own underglow — which it now
        has. The plinth was there and the glow was not: the desk sat on a
        block of the darkest material in the file and read as furniture
        pushed against a wall rather than as a lit object.
      */}
      <mesh position={[d.x + 0.05, 0.03, mid]}>
        <boxGeometry args={[d.d - 0.2, 0.06, len - 0.12]} />
        <primitive object={M.darker} attach="material" />
      </mesh>
      <mesh
        position={[d.x - d.d / 2 + 0.06, 0.07, mid]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[len - 0.1, 0.1]} />
        <meshBasicMaterial color="#ffe6c4" toneMapped={false} />
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
      <mesh position={[m.x0 + w / 2, m.y + 1.3, m.z0 + 0.08]}>
        <planeGeometry args={[w - 0.6, 2.2]} />
        <meshBasicMaterial color="#6d6256" toneMapped={false} />
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
  { x: 1.5, z: 2.0, s: 1.15 },
  { x: 1.5, z: 9.0, s: 1.0 },
  { x: 1.5, z: 16.2, s: 1.2 },
  { x: 21.2, z: 15.4, s: 0.95 },
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
