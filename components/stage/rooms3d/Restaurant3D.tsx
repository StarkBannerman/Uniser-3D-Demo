"use client";

/**
 * The hotel restaurant, as geometry.
 *
 * Nothing in this file knows what the lights are doing. It builds the room and
 * the things in it; `RestaurantLightRig` lights them and `RestaurantStage`
 * drives both from the simulation.
 *
 * The plan is the client's hero frame read back into metres. Bar down the left
 * wall, wine wall closing the far end, twenty-two metres of glazing down the
 * right with the city across the water behind it, and a dropped ceiling raft
 * over the middle carrying the cove. The dining floor sits inside that with
 * twelve tops on a loose grid - loose because a restaurant laid out on an
 * exact grid reads as a canteen, and the client's frame has no two tables
 * squarely aligned.
 *
 * Almost everything repeated is an `InstancedMesh`. Twelve tables, forty-eight
 * chairs, ninety-six glasses and a hundred and forty bottles drawn
 * individually would be three hundred draw calls before the architecture gets
 * a look in. One of the downloaded models, `bar_bar.glb`, is 1349 separate
 * meshes for a single bar, which is why it is not in here.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import {
  makeCityTexture,
  makeFabricNormal,
  makeMarbleTexture,
  makeMatteMottle,
  makePlasterNormal,
} from "./geometry";

/** 15 x 22 m of dining floor, 4.2 m to the structural slab. */
export const RS = { w: 15, d: 22, h: 4.2 } as const;

/**
 * The room's furniture, in plan.
 *
 * Kept as data rather than buried in JSX so the light rig can aim at the same
 * coordinates the geometry uses. Every fixture that points at a table points
 * at `TABLES[n]`, and when a table moves the light follows it.
 */
export const RS_PLAN = {
  /** The glazed wall, and the mullion spacing on it. */
  glazing: { x: RS.w, z0: 1.6, z1: 20.4, mullionEvery: 2.35 },
  /** Bar counter down the left wall. */
  bar: { x0: 0.35, x1: 2.3, z0: 9.6, z1: 18.2, h: 1.12 },
  /** Wine wall closing the far end. */
  wine: { x0: 5.4, x1: 10.6, z: 0.5, y0: 0.35, y1: 3.5 },
  /** The dropped ceiling raft that carries the cove. */
  raft: { x0: 1.9, x1: 12.4, z0: 3.0, z1: 19.0, y: 3.35 },
  /** Centre of the pendant cluster. */
  pendants: { x: 6.3, z: 11.4, r: 1.65 },
} as const;

/**
 * Twelve tops, placed by eye from the client's frame.
 *
 * `seats` varies because a dining room's does: a restaurant with four chairs
 * on every table looks like a conference centre. `r` is the top's radius, and
 * the two larger rounds are the ones a party of six gets.
 */
export const TABLES: { x: number; z: number; r: number; seats: number; rot: number }[] = [
  { x: 3.6, z: 16.6, r: 0.62, seats: 4, rot: 0.3 },
  { x: 6.9, z: 17.4, r: 0.55, seats: 3, rot: 1.1 },
  { x: 10.2, z: 17.0, r: 0.62, seats: 4, rot: -0.4 },
  { x: 12.9, z: 15.2, r: 0.55, seats: 3, rot: 0.8 },
  { x: 4.3, z: 13.0, r: 0.55, seats: 4, rot: -0.9 },
  { x: 7.8, z: 13.4, r: 0.72, seats: 6, rot: 0.2 },
  { x: 11.3, z: 12.6, r: 0.62, seats: 4, rot: 1.4 },
  { x: 13.0, z: 9.6, r: 0.55, seats: 3, rot: -0.2 },
  { x: 4.1, z: 8.8, r: 0.62, seats: 4, rot: 0.6 },
  { x: 7.4, z: 8.4, r: 0.55, seats: 4, rot: -1.2 },
  { x: 10.6, z: 7.6, r: 0.72, seats: 6, rot: 0.9 },
  { x: 6.6, z: 4.6, r: 0.62, seats: 4, rot: 0.1 },
];

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

/**
 * One module-level set, mutated once by `Surfaces`.
 *
 * Materials are shared across every instance that uses them, so building them
 * per render would rebuild a shader programme per frame. The textures are
 * attached in a layout effect because they need a DOM canvas, which does not
 * exist when this module is first evaluated on the server.
 */
const M = {
/**
   * Polished, not mirrored.
   *
   * Sampled against the client's frame, our floor came back rgb(137,85,44)
   * where theirs is rgb(80,51,29) - it was the brightest large surface in the
   * room and it was returning the table lamps as streaks rather than as a
   * sheen. A polished stone floor in a dark restaurant does reflect, which is
   * half of why these rooms photograph well, but it reflects a tighter
   * highlight than a mirror would give, but a tight one: roughening it to
   * 0.26 spread each lamp into a wide dim smear and COST shadow - measured,
   * pixels below 0.15 fell from 20.7% to 15.5%, which is the mood going out
   * of the room rather than into it.
   */
  floor: new THREE.MeshPhysicalMaterial({
    color: "#36322b",
    roughness: 0.17,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.15,
    envMapIntensity: 1.1,
  }),
  wall: new THREE.MeshStandardMaterial({ color: "#5b5447", roughness: 0.93 }),
  ceiling: new THREE.MeshStandardMaterial({ color: "#3b3129", roughness: 0.92 }),
  /**
   * Darker than a plastered ceiling has any right to be, and measured.
   *
   * The raft is the top quarter of every frame of this room, so its albedo is
   * the single largest term in the image's mean luminance. At "#a89c88" the
   * ceiling alone held the frame at 0.329 against the reference's 0.221 - the
   * room below it was already right. A restaurant ceiling reads as a dark
   * plane with a warm line in it, not as a lit surface.
   */
  soffit: new THREE.MeshStandardMaterial({ color: "#6a6154", roughness: 0.9 }),
  /** The inside of a cove trough, which is never seen directly. */
  trough: new THREE.MeshStandardMaterial({ color: "#efe4cf", roughness: 0.96 }),
  stone: new THREE.MeshStandardMaterial({ color: "#6a6358", roughness: 0.42 }),
  timber: new THREE.MeshStandardMaterial({ color: "#4a3320", roughness: 0.58 }),
  timberDark: new THREE.MeshStandardMaterial({ color: "#271a10", roughness: 0.74 }),
  brass: new THREE.MeshStandardMaterial({
    color: "#b08d4f",
    roughness: 0.3,
    metalness: 0.9,
  }),
  metal: new THREE.MeshStandardMaterial({
    color: "#1d1b19",
    roughness: 0.45,
    metalness: 0.7,
  }),
  glass: new THREE.MeshPhysicalMaterial({
    color: "#cfd6d8",
    roughness: 0.06,
    metalness: 0,
    transmission: 0.92,
    thickness: 0.01,
    ior: 1.45,
    transparent: true,
    opacity: 0.32,
  }),
  /** Upholstery on the chairs - the taupe the client's frame uses. */
  seat: new THREE.MeshPhysicalMaterial({
    color: "#574e40",
    roughness: 0.86,
    /*
     * Sheen, but not a pale one.
     *
     * Sheen is a grazing-angle lobe, and on a chair back - which is almost
     * all grazing angle from a seated camera - a pale sheen colour lifts the
     * ENTIRE surface rather than edging it. Twelve chairs doing that made the
     * seating the brightest mass in the room and read as white plastic, even
     * though the albedo underneath measured rgb(58,47,34). The colour wants
     * to be a warmer, darker version of the cloth, not a highlight on it.
     */
    sheen: 0.35,
    sheenRoughness: 0.85,
    sheenColor: new THREE.Color("#6b5d49"),
  }),
  /**
   * The tops, and they are not white.
   *
   * The first pass dressed all twelve in linen and the room came back reading
   * as a banquet hall: a 1.2 m round of near-white at 0.9 roughness is the
   * brightest large surface in any frame that contains one, and twelve of
   * them under an ambient wash is most of why 38% of the image clipped. The
   * client's frame has dark tops with white covers ON them, which is both
   * what fine dining looks like and what gives a place setting somewhere to
   * read against.
   */
  tableTop: new THREE.MeshPhysicalMaterial({
    color: "#33281f",
    roughness: 0.46,
    clearcoat: 0.3,
    clearcoatRoughness: 0.3,
  }),
  linen: new THREE.MeshStandardMaterial({ color: "#cfc7b8", roughness: 0.9 }),
  china: new THREE.MeshPhysicalMaterial({
    color: "#f4f1ea",
    roughness: 0.16,
    clearcoat: 0.8,
    clearcoatRoughness: 0.1,
  }),
  bottleGreen: new THREE.MeshPhysicalMaterial({
    color: "#243a24",
    roughness: 0.12,
    transmission: 0.55,
    thickness: 0.06,
    ior: 1.5,
    transparent: true,
    opacity: 0.85,
  }),
  planter: new THREE.MeshStandardMaterial({ color: "#2f2b26", roughness: 0.7 }),
  foliage: new THREE.MeshStandardMaterial({
    color: "#31492c",
    roughness: 0.82,
    side: THREE.DoubleSide,
  }),
};

/* ------------------------------------------------------------------ */
/* Shared geometry                                                     */
/* ------------------------------------------------------------------ */

const GEOM = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 24),
  /** A chair: seat pad, back and four legs, merged into one buffer. */
  chair: (() => {
    const parts: THREE.BufferGeometry[] = [];
    const seat = new THREE.BoxGeometry(0.46, 0.1, 0.46);
    seat.translate(0, 0.45, 0);
    parts.push(seat);
    // A back that leans. Upholstered dining chairs are never vertical, and a
    // vertical one reads as a kitchen chair however good the material is.
    const back = new THREE.BoxGeometry(0.44, 0.52, 0.09);
    back.translate(0, 0.74, -0.2);
    back.rotateX(-0.12);
    parts.push(back);
    for (const [sx, sz] of [
      [-0.18, -0.18],
      [0.18, -0.18],
      [-0.18, 0.18],
      [0.18, 0.18],
    ]) {
      const leg = new THREE.CylinderGeometry(0.018, 0.015, 0.45, 8);
      leg.translate(sx, 0.225, sz);
      parts.push(leg);
    }
    return mergeAll(parts);
  })(),
  /** A wine glass, as cheap as one can be and still read as stemware. */
  glass: (() => {
    const parts: THREE.BufferGeometry[] = [];
    const bowl = new THREE.CylinderGeometry(0.035, 0.018, 0.085, 10, 1, true);
    bowl.translate(0, 0.145, 0);
    parts.push(bowl);
    const stem = new THREE.CylinderGeometry(0.0045, 0.0045, 0.085, 6);
    stem.translate(0, 0.06, 0);
    parts.push(stem);
    const foot = new THREE.CylinderGeometry(0.032, 0.032, 0.005, 10);
    foot.translate(0, 0.0025, 0);
    parts.push(foot);
    return mergeAll(parts);
  })(),
  /** A bottle for the wine wall and the back bar. */
  bottle: (() => {
    const parts: THREE.BufferGeometry[] = [];
    const body = new THREE.CylinderGeometry(0.038, 0.038, 0.19, 10);
    body.translate(0, 0.095, 0);
    parts.push(body);
    const neck = new THREE.CylinderGeometry(0.012, 0.03, 0.11, 8);
    neck.translate(0, 0.245, 0);
    parts.push(neck);
    return mergeAll(parts);
  })(),
  plate: new THREE.CylinderGeometry(0.13, 0.115, 0.016, 20),
};

/**
 * Merge a list of buffer geometries into one.
 *
 * Local rather than imported because the three.js helper lives in `examples`
 * and pulling the whole addon in for one function costs more than the forty
 * lines. Only handles what is used here - non-indexed float attributes with
 * the same keys - which every geometry built above satisfies.
 */
function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const keys = ["position", "normal", "uv"] as const;
  const out = new THREE.BufferGeometry();
  for (const key of keys) {
    if (!nonIndexed[0].getAttribute(key)) continue;
    const size = nonIndexed[0].getAttribute(key).itemSize;
    let total = 0;
    for (const g of nonIndexed) total += g.getAttribute(key).count * size;
    const arr = new Float32Array(total);
    let at = 0;
    for (const g of nonIndexed) {
      arr.set(g.getAttribute(key).array as Float32Array, at);
      at += g.getAttribute(key).count * size;
    }
    out.setAttribute(key, new THREE.BufferAttribute(arr, size));
  }
  out.computeVertexNormals();
  return out;
}

/* ------------------------------------------------------------------ */
/* Texturing                                                           */
/* ------------------------------------------------------------------ */

function Surfaces() {
  useLayoutEffect(() => {
    const floor = makeMarbleTexture("#484138", "#282420", 4409);
    floor.repeat.set(RS.w / 2.4, RS.d / 2.4);
    M.floor.map = floor;
    M.floor.color.set("#ffffff");
    M.floor.needsUpdate = true;

    const stone = makeMarbleTexture("#78705f", "#4b4539", 8123);
    stone.repeat.set(1, 2.2);
    M.stone.map = stone;
    M.stone.color.set("#ffffff");
    M.stone.needsUpdate = true;

    /**
     * The same two instruments the lobby settled on, for the same reason.
     *
     * A normal map is nearly useless on a matte wall under area light -
     * measured there at 0.2% of local contrast - so the walls get a near-white
     * albedo mottle that multiplies into their own colour, and the normal map
     * is kept only for where the cove grazes.
     */
    const plaster = makePlasterNormal(28, 5501);
    const mottleWall = makeMatteMottle(22, 0.13, 6173);
    const mottleSoft = makeMatteMottle(14, 0.07, 2287);
    const put = (
      mat: THREE.MeshStandardMaterial,
      normal: THREE.Texture | null,
      normalScale: number,
      albedo: THREE.Texture | null,
      repeat: number,
    ) => {
      if (normal) {
        const n = normal.clone();
        n.needsUpdate = true;
        n.repeat.set(repeat, repeat);
        mat.normalMap = n;
        mat.normalScale = new THREE.Vector2(normalScale, normalScale);
      }
      if (albedo) {
        const a = albedo.clone();
        a.needsUpdate = true;
        a.repeat.set(repeat, repeat);
        mat.map = a;
      }
      mat.needsUpdate = true;
    };
    put(M.wall, plaster, 0.5, mottleWall, RS.w / 8);
    put(M.soffit, plaster, 0.4, mottleWall, RS.w / 8);
    put(M.ceiling, plaster, 0.22, mottleSoft, RS.w / 11);

    const weave = makeFabricNormal(9, 0.62, 3313);
    const w = weave.clone();
    w.needsUpdate = true;
    w.repeat.set(5, 5);
    M.seat.normalMap = w;
    M.seat.normalScale = new THREE.Vector2(0.85, 0.85);
    M.seat.needsUpdate = true;

    const cloth = makeFabricNormal(6, 0.3, 991);
    const c = cloth.clone();
    c.needsUpdate = true;
    c.repeat.set(3, 3);
    M.linen.normalMap = c;
    M.tableTop.needsUpdate = true;
    M.linen.normalScale = new THREE.Vector2(0.4, 0.4);
    M.linen.needsUpdate = true;
  }, []);
  return null;
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

function Shell() {
  const { w, d, h } = RS;
  const r = RS_PLAN.raft;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[w / 2, 0, d / 2]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <primitive object={M.floor} attach="material" />
      </mesh>

      {/* Structural slab above the raft. Dark, because every photograph of
          this room is of the raft and the slab is only ever the gap. */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[w / 2, h, d / 2]}>
        <planeGeometry args={[w, d]} />
        <primitive object={M.ceiling} attach="material" />
      </mesh>

      {/* Back wall, left wall, and the short return by the entrance. */}
      <mesh position={[w / 2, h / 2, 0]}>
        <planeGeometry args={[w, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]} position={[0, h / 2, d / 2]}>
        <planeGeometry args={[d, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      <mesh rotation={[0, Math.PI, 0]} position={[w / 2, h / 2, d]}>
        <planeGeometry args={[w, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>

      {/* The raft: a soffit plane with a lip around it. The cove sits in the
          gap between the lip and the slab and throws up, which is why the
          trough's inside face is a separate, much paler material. */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[(r.x0 + r.x1) / 2, r.y, (r.z0 + r.z1) / 2]}>
        <planeGeometry args={[r.x1 - r.x0, r.z1 - r.z0]} />
        <primitive object={M.soffit} attach="material" />
      </mesh>
      {[
        { x: (r.x0 + r.x1) / 2, z: r.z0, w: r.x1 - r.x0, rot: 0 },
        { x: (r.x0 + r.x1) / 2, z: r.z1, w: r.x1 - r.x0, rot: Math.PI },
        { x: r.x0, z: (r.z0 + r.z1) / 2, w: r.z1 - r.z0, rot: -Math.PI / 2 },
        { x: r.x1, z: (r.z0 + r.z1) / 2, w: r.z1 - r.z0, rot: Math.PI / 2 },
      ].map((s, i) => (
        <group key={i} position={[s.x, 0, s.z]} rotation={[0, s.rot, 0]}>
          {/* outer face of the lip */}
          <mesh position={[0, (r.y + h) / 2, 0]}>
            <planeGeometry args={[s.w, h - r.y]} />
            <primitive object={M.soffit} attach="material" />
          </mesh>
          {/* inner face, 180mm in - the surface the cove actually washes */}
          <mesh rotation={[0, Math.PI, 0]} position={[0, (r.y + h) / 2, -0.18]}>
            <planeGeometry args={[s.w, h - r.y]} />
            <primitive object={M.trough} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * The slatted timber raft over the bar end.
 *
 * In the client's frame this is the one piece of warmth in the ceiling and it
 * is what the architectural layer is aimed at. Instanced: it is sixty
 * identical fins, and sixty draw calls for a ceiling detail would be absurd.
 */
function TimberFins() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const COUNT = 60;
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < COUNT; i++) {
      m.makeScale(0.055, 0.16, 3.1);
      m.setPosition(2.3 + i * 0.148, RS.h - 0.1, 2.05);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[GEOM.box, M.timber, COUNT]} castShadow>
      <primitive object={GEOM.box} attach="geometry" />
    </instancedMesh>
  );
}

/* ------------------------------------------------------------------ */
/* Glazing and the view                                                */
/* ------------------------------------------------------------------ */

/**
 * The city across the water.
 *
 * A cylinder rather than a plane, for the reason the lobby's cyclorama
 * documents: the sightline leaves this glass at a shallow angle, and a flat
 * backdrop placed to look right from the centre of the room is off its own end
 * by the time it reaches the corner of the frame.
 */
function CityBackdrop({ skyStep }: { skyStep: number }) {
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        side: THREE.BackSide,
        toneMapped: false,
        transparent: false,
      }),
    [],
  );
  useLayoutEffect(() => {
    const tex = makeCityTexture(skyStep, 41);
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    mat.map = tex;
    mat.needsUpdate = true;
    return () => tex.dispose();
  }, [skyStep, mat]);
  return (
    <mesh position={[RS.w / 2, 6, RS.d / 2]}>
      <cylinderGeometry args={[46, 46, 30, 48, 1, true]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

function Glazing() {
  const g = RS_PLAN.glazing;
  const count = Math.round((g.z1 - g.z0) / g.mullionEvery);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i <= count; i++) {
      m.makeScale(0.07, RS.h, 0.1);
      m.setPosition(g.x - 0.04, RS.h / 2, g.z0 + i * ((g.z1 - g.z0) / count));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [count, g]);
  return (
    <group>
      <mesh rotation={[0, -Math.PI / 2, 0]} position={[g.x, RS.h / 2, (g.z0 + g.z1) / 2]}>
        <planeGeometry args={[g.z1 - g.z0, RS.h]} />
        <primitive object={M.glass} attach="material" />
      </mesh>
      <instancedMesh ref={ref} args={[GEOM.box, M.metal, count + 1]}>
        <primitive object={GEOM.box} attach="geometry" />
      </instancedMesh>
      {/* Head and sill, so the glass reads as set into something. */}
      {[0.06, RS.h - 0.09].map((y, i) => (
        <mesh key={i} position={[g.x - 0.05, y, (g.z0 + g.z1) / 2]}>
          <boxGeometry args={[0.14, 0.14, g.z1 - g.z0]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/** Stone piers between the glazing bays, and two freestanding in the room. */
function StoneColumns() {
  const at = [
    { x: RS.w - 0.42, z: 4.6 },
    { x: RS.w - 0.42, z: 11.3 },
    { x: RS.w - 0.42, z: 18.0 },
    { x: 1.1, z: 6.4 },
  ];
  return (
    <group>
      {at.map((c, i) => (
        <mesh key={i} position={[c.x, RS.h / 2, c.z]} castShadow receiveShadow>
          <boxGeometry args={[0.66, RS.h, 0.78]} />
          <primitive object={M.stone} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Bar and wine wall                                                   */
/* ------------------------------------------------------------------ */

/**
 * The client's bar, decimated from seventy-four meshes to five.
 *
 * The counter and back-bar shelving built here first were legible as shapes
 * and nothing more - a brown block against a wall. This model carries the
 * bottles, the shelf detail and the back fittings that make a back bar read
 * as one, and after `join` it costs five draws instead of the seventy-four it
 * arrived with.
 *
 * Still positioned by the plan rather than by the model: the feature circuit
 * aims its strips at `RS_PLAN.bar`, so the model is fitted to that run and
 * the lighting continues to land where the lighting was designed to land.
 */
function Bar() {
  const b = RS_PLAN.bar;
  /**
   * Fitted by HEIGHT, which is the only axis that means anything here.
   *
   * The model's raw bounds are 946 x 4353 x 3387 and the tallest axis is y -
   * it is a compact back-bar unit with a tall display behind it, not a long
   * counter run. Fitting its footprint to the 8.6 m of wall the plan gives
   * the bar scaled the height to eleven metres, in a room that is 4.2 to the
   * slab, and the result was a black slab across half the frame.
   *
   * So it is sized by its 2.8 m height and repeated down the run instead,
   * which is how back bars are actually built: identical bays, not one
   * continuous joinery special.
   */
  const bays = [b.z0 + 1.6, b.z0 + 4.0, b.z0 + 6.4];
  return (
    <group>
      {bays.map((z, i) => (
        <FittedModel
          key={i}
          url={MODELS.bar}
          position={[b.x0 + 0.5, 0, z]}
          fitMetres={2.8}
          axis="y"
          rotY={Math.PI / 2}
        />
      ))}
    </group>
  );
}

function WineWall() {
  const v = RS_PLAN.wine;
  const ref = useRef<THREE.InstancedMesh>(null);
  const COLS = 15;
  const ROWS = 6;
  const COUNT = COLS * ROWS;
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    const s = new THREE.Vector3(1, 1, 1);
    const pos = new THREE.Vector3();
    let i = 0;
    // Bottles lie on their sides, which is both how wine is stored and the
    // only way a wall of them reads as a cellar rather than as a shop shelf.
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        pos.set(
          v.x0 + 0.16 + (c / (COLS - 1)) * (v.x1 - v.x0 - 0.32),
          v.y0 + 0.2 + (r / (ROWS - 1)) * (v.y1 - v.y0 - 0.4),
          v.z + 0.17,
        );
        s.setScalar(1.35);
        m.compose(pos, q, s);
        mesh.setMatrixAt(i++, m);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [v]);
  return (
    <group>
      {/* The joinery box, open to the room. */}
      <mesh position={[(v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2, v.z + 0.02]}>
        <boxGeometry args={[v.x1 - v.x0 + 0.3, v.y1 - v.y0 + 0.3, 0.1]} />
        <primitive object={M.timberDark} attach="material" />
      </mesh>
      <instancedMesh ref={ref} args={[GEOM.bottle, M.bottleGreen, COUNT]}>
        <primitive object={GEOM.bottle} attach="geometry" />
      </instancedMesh>
      {/* Glass front, so the wall has a sheen on it from the room. */}
      <mesh position={[(v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2, v.z + 0.4]}>
        <planeGeometry args={[v.x1 - v.x0, v.y1 - v.y0]} />
        <primitive object={M.glass} attach="material" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* The dining floor                                                    */
/* ------------------------------------------------------------------ */

/**
 * Tables, chairs, covers and glassware, all instanced.
 *
 * Chairs are placed around each top by angle rather than from a list, so a
 * table's seat count is the only thing that has to change to re-lay it.
 */
/**
 * Twelve covers, each the client's own dining set.
 *
 * Procedural tables and chairs came first and were cheaper - five instanced
 * meshes for the whole floor against ten draws per cover here - but they read
 * as boxes, and a boxy chair is the one thing that stops a dining room
 * looking like a restaurant. The decimated set is 15,673 triangles, so twelve
 * of them is 188k: well inside what this room can afford, and the draw calls
 * are what it costs.
 *
 * The model is a table and its covers - linen, china, cutlery, glassware -
 * and despite the name it has no chairs in it at all. Inspecting it says so:
 * 900 x 441 x 1200 of bounds is a 1.6 x 2.1 m top at 0.78 m and nothing
 * standing beside it. So the chairs stay procedural and instanced, which is
 * also where they belong: forty-eight of them is one draw call that way and
 * would be forty-eight if each came from a model.
 */
function DiningFloor() {
  const chairs = useRef<THREE.InstancedMesh>(null);
  const seatTotal = useMemo(() => TABLES.reduce((n, t) => n + t.seats, 0), []);

  useLayoutEffect(() => {
    const mesh = chairs.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    let c = 0;
    TABLES.forEach((t) => {
      for (let s = 0; s < t.seats; s++) {
        const a = t.rot + (s / t.seats) * Math.PI * 2;
        const rad = 1.02 + t.r * 0.25;
        e.set(0, a + Math.PI, 0);
        q.setFromEuler(e);
        pos.set(t.x + Math.sin(a) * rad, 0, t.z + Math.cos(a) * rad);
        m.compose(pos, q, one);
        mesh.setMatrixAt(c++, m);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [seatTotal]);

  return (
    <group>
      {TABLES.map((t, i) => (
        <FittedModel
          key={i}
          url={MODELS.dining}
          position={[t.x, 0, t.z]}
          /*
           * Fitted by height, not footprint.
           *
           * Scaling this set to a table's diameter put its top at 0.59 m -
           * below the seat of the chairs around it, so the covers read as
           * laid out on a coffee table. Dining height is 0.75 and it is one
           * of the few dimensions a viewer checks without knowing they are
           * checking it, so height is the axis that has to be right and the
           * footprint follows from it.
           */
          fitMetres={0.76}
          axis="y"
          rotY={t.rot}
        />
      ))}
      <instancedMesh ref={chairs} args={[GEOM.chair, M.seat, seatTotal]} castShadow receiveShadow>
        <primitive object={GEOM.chair} attach="geometry" />
      </instancedMesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Planting                                                            */
/* ------------------------------------------------------------------ */

/**
 * The downloaded models, after decimation.
 *
 * None of these were usable as they arrived. `elegant_dining_table_set.glb`
 * was 194,790 triangles for one cover - two and a quarter million across
 * twelve - and `bar_with_bottles.glb` was 56,830 triangles spread over
 * SEVENTY-FOUR meshes, which is the worse of the two problems: triangles are
 * cheap and draw calls are not.
 *
 * Run through gltf-transform - weld, simplify, flatten, join - they come out
 * at 15,673 triangles in 10 meshes and 29,596 in 5. The dining set is a 12.4x
 * cut with the silhouette intact, because almost all of that budget was in
 * turned legs and seam detail nobody sees from across a dining room.
 *
 * `bar_bar.glb` is still not here. 1349 meshes does not decimate into
 * something sensible; it needs rebuilding, not simplifying.
 */
const MODELS = {
  dining: "/models/restaurant/dining-set.glb",
  bar: "/models/restaurant/bar.glb",
  monstera: "/models/restaurant/monstera.glb",
} as const;

/**
 * Load a model and scale it to a size in metres.
 *
 * These arrive in centimetres with node transforms on top, so what a scale of
 * 1 means differs per file and is not worth hand-solving. Measuring the
 * bounding box after load and fitting to a stated footprint makes the call
 * site say what it wants - "this bar is 8.6 m long" - instead of carrying a
 * magic number that breaks if the asset is ever re-exported.
 *
 * Cloned per placement: `useGLTF` caches one scene graph per URL, so twelve
 * covers sharing it would be twelve references to one object and only the
 * last transform would survive.
 */
function FittedModel({
  url,
  position,
  fitMetres,
  axis = "xz",
  rotY = 0,
}: {
  url: string;
  position: [number, number, number];
  /** Target size in metres of the axis named by `axis`. */
  fitMetres: number;
  /** "xz" fits the larger horizontal extent; "y" fits height. */
  axis?: "xz" | "y";
  rotY?: number;
}) {
  const { scene } = useGLTF(url);
  const fitted = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3();
    box.getSize(size);
    const current = axis === "y" ? size.y : Math.max(size.x, size.z);
    const k = current > 0.0001 ? fitMetres / current : 1;
    c.scale.setScalar(k);
    // Re-measure after scaling and sit the model on the floor, so a call site
    // never has to know how far below its own origin a model's feet are.
    const after = new THREE.Box3().setFromObject(c);
    c.position.y = -after.min.y;
    return c;
  }, [scene, fitMetres, axis]);
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <primitive object={fitted} />
    </group>
  );
}

/**
 * The one downloaded model that earns its place.
 *
 * Of the six in that folder this is the only one cheap enough to use as-is:
 * 9,310 triangles across four meshes. For comparison the dining sets are
 * 195k-229k triangles each, which at twelve covers is two and a quarter
 * million triangles of furniture before the room is built, and `bar_bar.glb`
 * is 1349 separate meshes - more draw calls from one prop than this entire
 * scene spends. Those are decimation jobs, not drop-ins.
 *
 * Cloned per placement because `useGLTF` caches one scene graph per URL, so
 * three planters sharing it would be three references to one object and only
 * the last transform would survive.
 */
function Planting() {
  // Placed where the camera can see them. The first pass put five of these at
  // the far end and one behind the lens, which is the same as not having them.
  const at: { p: [number, number, number]; h: number; r: number }[] = [
    { p: [1.15, 0, 11.4], h: 1.9, r: 0.4 },
    { p: [13.85, 0, 8.4], h: 1.7, r: 2.1 },
    { p: [12.6, 0, 19.3], h: 2.05, r: -0.8 },
    { p: [4.6, 0, 2.0], h: 1.75, r: 1.3 },
  ];
  return (
    <group>
      {at.map((m, i) => (
        <FittedModel key={i} url={MODELS.monstera} position={m.p} fitMetres={m.h} axis="y" rotY={m.r} />
      ))}
    </group>
  );
}

Object.values(MODELS).forEach((u) => useGLTF.preload(u));

/* ------------------------------------------------------------------ */

export function Restaurant3D({ skyStep }: { skyStep: number }) {
  return (
    <group>
      <Surfaces />
      <CityBackdrop skyStep={skyStep} />
      <Shell />
      <TimberFins />
      <Glazing />
      <StoneColumns />
      <Bar />
      <WineWall />
      <DiningFloor />
      <Planting />
    </group>
  );
}
