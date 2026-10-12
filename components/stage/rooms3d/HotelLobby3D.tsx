"use client";

/**
 * Hotel Lobby — geometry.
 *
 * The largest room in the project by a wide margin: 17 by 24 metres, seven
 * metres to the top of the coffer, against a bedroom at 4 by 5. Everything in
 * here is written with that in mind, and two rules follow from it.
 *
 * **Anything that appears more than about six times is instanced.** The
 * chandelier is fifty-four globes, the coffer cove is a hundred and ten metres
 * of strip, the façade is forty mullions, the panelled wall is ninety flutes
 * and the planting is nine specimens of thirty-four leaves. Drawn
 * individually that is well over a thousand draw calls before a single piece
 * of furniture, and the living room already demonstrated what that costs.
 *
 * **The light count is the budget, not the triangle count.** three.js bakes
 * the number of each kind of light into every material's shader, so a room
 * with sixty lights pays for sixty at every pixel whether they reach it or
 * not. A lobby wants to look like it has two hundred fittings in it; this one
 * has thirty-three actual lights and about three hundred emissive apertures,
 * which is the only way a room this size runs at all. See `HotelLobbyLightRig`.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { ShadeState } from "@/lib/sim/types";
import { RoundedBox } from "@react-three/drei";
import {
  makeArtTexture,
  makeFabricNormal,
  makeLogoTexture,
  makeMarbleTexture,
  makeRugTexture,
} from "./geometry";
import { useContinuousMotion } from "../Stage3D";

/* ------------------------------------------------------------------ */
/* Dimensions                                                          */
/* ------------------------------------------------------------------ */

/**
 * The shell.
 *
 * `x` runs from the panelled reception wall (0) to the façade (w); `z` runs
 * from the water feature (0) to the entrance behind the camera (d).
 */
export const HL = {
  w: 17,
  d: 24,
  /** To the top of the coffer. The perimeter soffit is lower — see `COFFER`. */
  h: 7.2,
} as const;

/**
 * The stepped ceiling, outside in.
 *
 * Three planes at three heights, each step carrying a continuous cove. The
 * steps are what give a seven-metre ceiling a scale a person can read: an
 * unbroken slab at that height reads as a car park, and the thing that fixes
 * it is a horizontal line at 5.6 m that the eye takes as "the ceiling", with
 * the rest of the volume opening up behind it.
 */
export const COFFER = [
  { y: 5.6, x0: 0, x1: HL.w, z0: 0, z1: HL.d },
  { y: 6.4, x0: 1.9, x1: HL.w - 1.9, z0: 2.4, z1: HL.d - 2.4 },
  { y: 7.2, x0: 3.6, x1: HL.w - 3.6, z0: 4.8, z1: HL.d - 4.8 },
] as const;

/**
 * The height of the ceiling directly above a point.
 *
 * A stepped coffer does not have *a* ceiling height, and anything mounted on
 * the ceiling has to know which plane it is on. Fitted at the perimeter
 * height, the occupancy heads and the ceiling speakers over the lounge hung in
 * the open void of the coffer — four discs floating in mid-air, which is
 * exactly the kind of geometry artefact that reads as a bug rather than as a
 * fitting.
 */
export function ceilingYAt(x: number, z: number): number {
  let y: number = COFFER[0].y;
  for (const c of COFFER) {
    if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) y = c.y;
  }
  return y;
}

/** Where everything in the room stands. Shared with the light rig. */
export const HL_PLAN = {
  /** Reception desk: a long run against the panelled wall. */
  desk: { x: 2.55, z0: 5.6, z1: 12.6, h: 1.12, d: 0.95 },
  /** The feature wall behind it, carrying the hotel's mark. */
  /**
   * The wall behind it, pushed back down the room.
   *
   * It sat opposite the camera's own x, which on a wall you are standing
   * beside means edge-on: measured, the whole of it fell outside the left
   * edge of the frame and the hotel's name was not visible in its own lobby.
   * Moved four metres toward the far end, the viewing angle opens to about
   * twenty degrees and the mark reads.
   */
  deskWall: { x: 0.12, z0: 4.8, z1: 13.4, y0: 0.9, y1: 4.6 },
  /** Artwork on the panelled wall, between reception and the water feature. */
  /**
   * On the back wall beside the water feature, not on the panelled wall.
   *
   * A canvas on the wall the camera stands beside is a bright sliver at the
   * frame edge — and with an accent head on it, a blown white sliver. On the
   * back wall it is nearly face-on to the lens, which is the only orientation
   * in which "original abstract artwork with picture lighting" means anything
   * to someone looking at the picture.
   */
  art: { x: 3.9, z: 0.16, y: 2.4, w: 2.9, h: 2.1 },
  /** Cascading water wall at the far end. */
  water: { x0: 7.2, x1: 11.9, y0: 0.35, y1: 5.3, z: 0.22 },
  /** Sculpture and plinth, standing in front of it. */
  sculpture: { x: 9.55, z: 2.3 },
  /** Chandelier cluster, hung from the inner coffer. */
  chandelier: { x: 8.4, z: 9.2 },
  /** Main lounge group, between the camera and the chandelier. */
  lounge: { x: 7.6, z: 15.2 },
  /** Second cluster, further back toward the water feature. */
  lounge2: { x: 12.4, z: 7.4 },
  /** Columns down the façade line. */
  columns: [3.2, 8.0, 12.8, 17.6, 22.4] as const,
  columnX: 14.35,
  /** The glazed façade itself. */
  facade: { x: HL.w, z0: 1.4, z1: HL.d - 0.6, y0: 0.05, y1: 5.45 },
} as const;

/**
 * Table and floor lamps, with their kind.
 *
 * They were one undifferentiated list, and `Lamps` drew a floor stem under
 * every one of them — so a 0.86 m table lamp got a 0.86 m pole and ended up
 * standing in the middle of the rug like a bollard. A table lamp sits on
 * something; a floor lamp is the something. The distinction has to be in the
 * data or the geometry cannot know.
 */
export const LAMPS: { x: number; z: number; y: number; kind: "table" | "floor" }[] = [
  // On the reception desk, whose top is at 1.17.
  { x: 2.3, z: 11.4, y: 1.52, kind: "table" },
  { x: 2.3, z: 17.0, y: 1.52, kind: "table" },
  // Floor lamps at the outer corners of the main group, out of the sightline
  // to the water wall.
  { x: 11.9, z: 18.6, y: 1.48, kind: "floor" },
  { x: 13.4, z: 19.4, y: 1.48, kind: "floor" },
  // On the side table in the main cluster, and on the second cluster's table.
  { x: 10.56, z: 16.33, y: 0.86, kind: "table" },
  { x: 13.6, z: 5.6, y: 1.44, kind: "floor" },
  { x: 13.6, z: 9.9, y: 1.44, kind: "floor" },
];

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

/**
 * Warm dark timber and pale stone, which is the whole palette of the sheet.
 *
 * Reflectances are solved rather than picked. The floor is the largest surface
 * in the frame by a factor of three, so its value sets the room's exposure:
 * at the stone's real reflectance of about 0.35 the lobby came out a stop
 * brighter than the reference everywhere, because the reference floor is
 * polished and dark-veined and returns most of its light as a *highlight*
 * rather than as diffuse. Hence a darker albedo and a much lower roughness —
 * the same total light back, concentrated where polished stone actually puts
 * it.
 */
const M = {
  /** Polished large-format marble. */
  floor: new THREE.MeshPhysicalMaterial({
    color: "#b3a494",
    roughness: 0.11,
    metalness: 0.02,
    clearcoat: 0.85,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.5,
  }),
  ceiling: new THREE.MeshStandardMaterial({ color: "#efe9df", roughness: 0.95 }),
  soffit: new THREE.MeshStandardMaterial({ color: "#e7e0d4", roughness: 0.92 }),
  /** The reveal inside each coffer step, where the cove sits. */
  reveal: new THREE.MeshStandardMaterial({ color: "#d9d0c2", roughness: 0.9 }),
  wall: new THREE.MeshStandardMaterial({ color: "#cfc6b8", roughness: 0.93 }),
  /** Dark fluted wood on the reception wall. */
  wood: new THREE.MeshStandardMaterial({ color: "#5a4026", roughness: 0.55 }),
  woodDark: new THREE.MeshStandardMaterial({ color: "#2e2117", roughness: 0.8 }),
  /** Book-matched stone on the columns and the desk front. */
  stone: new THREE.MeshStandardMaterial({
    color: "#8e867a",
    roughness: 0.2,
    metalness: 0.04,
  }),
  marble: new THREE.MeshStandardMaterial({
    color: "#2e2a26",
    roughness: 0.13,
    metalness: 0.06,
  }),
  brass: new THREE.MeshStandardMaterial({
    color: "#b89258",
    roughness: 0.28,
    metalness: 0.86,
    envMapIntensity: 1.5,
  }),
  metal: new THREE.MeshStandardMaterial({
    color: "#2a2c30",
    roughness: 0.4,
    metalness: 0.65,
    envMapIntensity: 1.3,
  }),
  glass: new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: 0.04,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
  }),

  /* Upholstery. Three cloths, because a lounge with one is a waiting room. */
  boucle: new THREE.MeshPhysicalMaterial({
    color: "#b9b1a1",
    roughness: 0.97,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color("#ebe4d4"),
  }),
  boucleSeat: new THREE.MeshPhysicalMaterial({
    color: "#c3bbaa",
    roughness: 0.96,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color("#f0eade"),
  }),
  leather: new THREE.MeshPhysicalMaterial({
    color: "#8a5a32",
    roughness: 0.52,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.45,
  }),
  velvet: new THREE.MeshPhysicalMaterial({
    color: "#4e5a3c",
    roughness: 0.74,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.3,
    sheenColor: new THREE.Color("#aab483"),
  }),
  caramel: new THREE.MeshPhysicalMaterial({
    color: "#9c6a35",
    roughness: 0.9,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color("#e0b07a"),
  }),
  /** Deep navy-teal rug under the main group. */
  rug: new THREE.MeshStandardMaterial({ color: "#1d3240", roughness: 1 }),

  planter: new THREE.MeshStandardMaterial({ color: "#3a3630", roughness: 0.68 }),
  planterPale: new THREE.MeshStandardMaterial({ color: "#c9c1b2", roughness: 0.72 }),
  /**
   * Lighter than a leaf actually is, and with the environment turned up.
   *
   * Planting in a lobby stands in the places nothing is aimed at — beside a
   * column, against the glazing, in front of a lit water wall — so it is lit
   * almost entirely by bounce. At a real leaf's reflectance every specimen
   * came out as a black silhouette against whatever was behind it, which is
   * how the first pass produced a row of Christmas trees. Raising the albedo
   * and the environment term is what a renderer does instead of putting a
   * light on every pot.
   */
  foliage: new THREE.MeshStandardMaterial({
    color: "#587a49",
    roughness: 0.78,
    envMapIntensity: 1.5,
    side: THREE.DoubleSide,
  }),
  foliageDark: new THREE.MeshStandardMaterial({
    color: "#3d5a35",
    roughness: 0.84,
    envMapIntensity: 1.3,
  }),
  bloom: new THREE.MeshStandardMaterial({ color: "#e8e1d4", roughness: 0.78 }),

  /** Smoked amber glass, on the chandelier globes when they are dark. */
  smoked: new THREE.MeshStandardMaterial({
    color: "#4e3a22",
    roughness: 0.22,
    metalness: 0,
    transparent: true,
    opacity: 0.84,
  }),
  /** Outside: tarmac, planting beds, the car. */
  tarmac: new THREE.MeshStandardMaterial({ color: "#1b1c1e", roughness: 0.78 }),
  car: new THREE.MeshPhysicalMaterial({
    color: "#15171b",
    roughness: 0.22,
    metalness: 0.55,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  }),
};

/* ------------------------------------------------------------------ */
/* Leaves                                                              */
/* ------------------------------------------------------------------ */

const LEAF_GEOM = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.38, 0.2, 0.32, 0.76, 0, 1);
  shape.bezierCurveTo(-0.32, 0.76, -0.38, 0.2, 0, 0);
  return new THREE.ShapeGeometry(shape, 12);
})();

/**
 * A frond: a central rib with leaflets off it, for the palms.
 *
 * A palm is not a bush, and giving one the same radial leaf arrangement as a
 * rubber plant is how you get a topiary ball with a trunk. The leaflets are
 * drawn along a drooping arc, which is the whole silhouette.
 */
const FROND_GEOM = (() => {
  const geoms: THREE.BufferGeometry[] = [];
  const n = 13;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // A quadratic droop — flat at the stem, falling away at the tip.
    const x = t * 1.0;
    const y = -0.42 * t * t;
    const len = 0.34 * Math.sin(Math.PI * (0.15 + t * 0.8));
    for (const side of [-1, 1]) {
      const g = LEAF_GEOM.clone();
      g.scale(len * 0.22, len, 1);
      g.rotateZ(side * (0.95 - t * 0.35) - Math.PI / 2);
      g.rotateY(side * 0.3);
      g.translate(x, y, 0);
      geoms.push(g);
    }
  }
  // One merged buffer, so a frond is a single draw rather than twenty-six.
  const merged = mergeGeometries(geoms);
  return merged;
})();

/** Minimal merge: three-stdlib is not a dependency, and this needs no options. */
function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  let vertexCount = 0;
  let indexCount = 0;
  for (const g of list) {
    vertexCount += g.attributes.position.count;
    indexCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const index = new Uint32Array(indexCount);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const p = g.attributes.position.array as ArrayLike<number>;
    const nAttr = g.attributes.normal?.array as ArrayLike<number> | undefined;
    const count = g.attributes.position.count;
    for (let i = 0; i < count * 3; i++) {
      position[vo * 3 + i] = p[i];
      normal[vo * 3 + i] = nAttr ? nAttr[i] : 0;
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) index[io + i] = g.index.array[i] + vo;
      io += g.index.count;
    } else {
      for (let i = 0; i < count; i++) index[io + i] = i + vo;
      io += count;
    }
    vo += count;
  }
  out.setAttribute("position", new THREE.BufferAttribute(position, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeVertexNormals();
  return out;
}

const LEAF_COUNT = 34;
const LEAVES = Array.from({ length: LEAF_COUNT }, (_, i) => {
  const t = i / (LEAF_COUNT - 1);
  const n = Math.sin(i * 12.9898) * 43758.5453;
  const j = n - Math.floor(n);
  return {
    // 137.5 degrees: what real stems do, and why a plant is never in rows.
    turn: i * 2.39996,
    /**
     * Out and down, not up.
     *
     * The first arrangement ran from 1.32 rad (nearly horizontal) to 0.34
     * (nearly vertical) going up the stem, which is a conifer: narrow, spiky
     * and, lit from behind, a Christmas tree in a pot. A leafy indoor
     * specimen does the opposite — the lower leaves arch outward and the
     * crown opens — so the range now runs past vertical at the base and the
     * leaves are half as long again and much wider.
     */
    tilt: 1.52 - t * 0.78 + (j - 0.5) * 0.3,
    roll: (j - 0.5) * 1.1,
    len: (0.52 - t * 0.14) * (0.85 + j * 0.3),
    y: 0.52 + t * 0.95,
    dark: i % 3 === 0,
  };
});

/** A leafed specimen as one instanced draw. See the living room for the why. */
function Foliage({ scale = 1 }: { scale?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);

  /**
   * White, because the instance colours carry the green.
   *
   * `instanceColor` *multiplies* the material's colour — it does not replace
   * it. Handing this an already-green material and then setting green
   * per-instance applies the albedo twice, and 0.34 squared is 0.12: every
   * specimen came out near-black no matter how far the material was lifted.
   * The same mistake cost this project a day on a floor scan once already.
   */
  const leaf = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.78,
        envMapIntensity: 1.5,
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
    const light = new THREE.Color("#587a49");
    const dark = new THREE.Color("#3d5a35");

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
        <primitive object={M.foliageDark} attach="material" />
      </mesh>
    </group>
  );
}

const FROND_COUNT = 11;
const FRONDS = Array.from({ length: FROND_COUNT }, (_, i) => {
  const n = Math.sin(i * 78.233) * 43758.5453;
  const j = n - Math.floor(n);
  return {
    turn: i * 2.39996,
    lift: 0.72 - (i / FROND_COUNT) * 0.95 + (j - 0.5) * 0.25,
    len: 0.85 + j * 0.45,
  };
});

/** A palm: a ringed trunk with fronds off the crown. */
function Palm({ height = 3.4 }: { height?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const lift = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3();
    FRONDS.forEach((f, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.turn);
      lift.setFromAxisAngle(new THREE.Vector3(0, 0, 1), f.lift);
      q.multiply(lift);
      pos.set(0, height, 0);
      sc.setScalar(f.len);
      m.compose(pos, q, sc);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [height]);

  return (
    <group>
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.15, height, 10]} />
        <primitive object={M.woodDark} attach="material" />
      </mesh>
      <instancedMesh ref={ref} args={[FROND_GEOM, M.foliage, FROND_COUNT]} castShadow />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

/**
 * Floor, walls and the stepped coffer.
 *
 * The coffer is built as three slabs with a vertical reveal between each, not
 * as a solid box with holes: a reveal is the surface the cove actually washes,
 * and without one the strip has nothing to light and reads as a glowing line
 * painted on a flat ceiling.
 */
function Shell() {
  return (
    <group>
      {/* Floor. */}
      <mesh position={[HL.w / 2, 0, HL.d / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[HL.w, HL.d]} />
        <primitive object={M.floor} attach="material" />
      </mesh>
      {/*
        Joint lines, as a grid of thin dark insets.

        Large-format stone is 1.2 m square and the joints are the only thing
        that gives a twenty-four metre floor a sense of scale. Without them a
        polished plane this size reads as water.
      */}
      {Array.from({ length: Math.round(HL.w / 1.2) - 1 }, (_, i) => (
        <mesh key={`jx-${i}`} position={[(i + 1) * 1.2, 0.002, HL.d / 2]}>
          <boxGeometry args={[0.012, 0.002, HL.d]} />
          <primitive object={M.stone} attach="material" />
        </mesh>
      ))}
      {Array.from({ length: Math.round(HL.d / 1.2) - 1 }, (_, i) => (
        <mesh key={`jz-${i}`} position={[HL.w / 2, 0.002, (i + 1) * 1.2]}>
          <boxGeometry args={[HL.w, 0.002, 0.012]} />
          <primitive object={M.stone} attach="material" />
        </mesh>
      ))}

      {/*
        The three ceiling planes — as rings, not as slabs.

        Drawn as full rectangles the lowest one simply covers the two above it
        and the whole coffer disappears: seven metres of stepped ceiling
        rendered as a single flat lid. Each level is therefore the ring between
        its own edge and the edge of the step above, which is what a coffer
        physically is, and only the innermost panel is solid.
      */}
      {COFFER.map((c, i) => {
        const inner = COFFER[i + 1];
        const mat = i === 0 ? M.soffit : M.ceiling;
        if (!inner) {
          return (
            <mesh
              key={`cf-${i}`}
              position={[(c.x0 + c.x1) / 2, c.y, (c.z0 + c.z1) / 2]}
              rotation={[Math.PI / 2, 0, 0]}
              receiveShadow
            >
              <planeGeometry args={[c.x1 - c.x0, c.z1 - c.z0]} />
              <primitive object={mat} attach="material" />
            </mesh>
          );
        }
        const bands = [
          { x: (c.x0 + c.x1) / 2, z: (c.z0 + inner.z0) / 2, w: c.x1 - c.x0, d: inner.z0 - c.z0 },
          { x: (c.x0 + c.x1) / 2, z: (inner.z1 + c.z1) / 2, w: c.x1 - c.x0, d: c.z1 - inner.z1 },
          { x: (c.x0 + inner.x0) / 2, z: (inner.z0 + inner.z1) / 2, w: inner.x0 - c.x0, d: inner.z1 - inner.z0 },
          { x: (inner.x1 + c.x1) / 2, z: (inner.z0 + inner.z1) / 2, w: c.x1 - inner.x1, d: inner.z1 - inner.z0 },
        ];
        return (
          <group key={`cf-${i}`}>
            {bands.map((b, j) => (
              <mesh
                key={j}
                position={[b.x, c.y, b.z]}
                rotation={[Math.PI / 2, 0, 0]}
                receiveShadow
              >
                <planeGeometry args={[b.w, b.d]} />
                <primitive object={mat} attach="material" />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* The reveal at each step: four faces facing inward. */}
      {COFFER.slice(1).map((c, i) => {
        const below = COFFER[i];
        const drop = c.y - below.y;
        const mid = below.y + drop / 2;
        return (
          <group key={`rev-${i}`}>
            {[
              { pos: [(c.x0 + c.x1) / 2, mid, c.z0], rot: 0, len: c.x1 - c.x0 },
              { pos: [(c.x0 + c.x1) / 2, mid, c.z1], rot: Math.PI, len: c.x1 - c.x0 },
              { pos: [c.x0, mid, (c.z0 + c.z1) / 2], rot: -Math.PI / 2, len: c.z1 - c.z0 },
              { pos: [c.x1, mid, (c.z0 + c.z1) / 2], rot: Math.PI / 2, len: c.z1 - c.z0 },
            ].map((f, j) => (
              <mesh
                key={j}
                position={f.pos as [number, number, number]}
                rotation={[0, f.rot, 0]}
                receiveShadow
              >
                <planeGeometry args={[f.len, drop]} />
                <primitive object={M.reveal} attach="material" />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* Back wall, behind the water feature. */}
      <mesh position={[HL.w / 2, COFFER[0].y / 2, 0]} receiveShadow>
        <planeGeometry args={[HL.w, COFFER[0].y]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      {/* Front wall, behind the camera — it exists so the room is a room. */}
      <mesh
        position={[HL.w / 2, COFFER[0].y / 2, HL.d]}
        rotation={[0, Math.PI, 0]}
        receiveShadow
      >
        <planeGeometry args={[HL.w, COFFER[0].y]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Panelled wall                                                       */
/* ------------------------------------------------------------------ */

const FLUTE = { w: 0.085, gap: 0.055, d: 0.07 };

/**
 * The reception wall: dark wood in vertical flutes, with linear grooves.
 *
 * Instanced, because at 140 mm centres a twenty-four metre wall is a hundred
 * and seventy battens. The grooves are left out of the instancing — there are
 * three of them, and they are a different object: a recess the architectural
 * channel lights from inside, which is where this wall gets its edge.
 */
function PanelWall() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const height = COFFER[0].y;
  const pitch = FLUTE.w + FLUTE.gap;
  const count = Math.floor(HL.d / pitch);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const colour = new THREE.Color();
    const a = new THREE.Color("#6a4a2b");
    const b = new THREE.Color("#3f2d1b");
    for (let i = 0; i < count; i++) {
      m.makeTranslation(FLUTE.d / 2, height / 2, FLUTE.w / 2 + i * pitch);
      mesh.setMatrixAt(i, m);
      const t = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
      colour.copy(a).lerp(b, t).multiplyScalar(0.88 + t * 0.22);
      mesh.setColorAt(i, colour);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [count, pitch, height]);

  return (
    <group>
      <mesh position={[0.004, height / 2, HL.d / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[HL.d, height]} />
        <primitive object={M.woodDark} attach="material" />
      </mesh>
      <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow receiveShadow>
        <boxGeometry args={[FLUTE.d, height, FLUTE.w]} />
        <meshStandardMaterial color="#ffffff" roughness={0.55} />
      </instancedMesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Columns                                                             */
/* ------------------------------------------------------------------ */

/** Stone-clad columns down the façade line, each with a recessed uplight slot. */
function Columns() {
  const height = COFFER[0].y;
  return (
    <group>
      {HL_PLAN.columns.map((z, i) => (
        <group key={`col-${i}`} position={[HL_PLAN.columnX, 0, z]}>
          <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.92, height, 0.92]} />
            <primitive object={M.stone} attach="material" />
          </mesh>
          {/* Dark recess down two faces; the uplight strip sits inside it. */}
          {[
            { p: [-0.465, height / 2, 0] as [number, number, number], r: -Math.PI / 2 },
            { p: [0, height / 2, 0.465] as [number, number, number], r: 0 },
          ].map((f, j) => (
            <mesh key={j} position={f.p} rotation={[0, f.r, 0]}>
              <planeGeometry args={[0.14, height - 0.3]} />
              <primitive object={M.woodDark} attach="material" />
            </mesh>
          ))}
          <mesh position={[0, 0.05, 0]}>
            <boxGeometry args={[1.02, 0.1, 1.02]} />
            <primitive object={M.marble} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Reception                                                           */
/* ------------------------------------------------------------------ */

/**
 * The desk, its feature wall and the hotel's mark.
 *
 * Three details carry this and they are the three the sheet points at: a dark
 * marble front so the desk reads as joinery rather than as a counter, an LED
 * line at the floor so it appears to float, and a lit top so the one place in
 * the room with a task on it is the brightest horizontal surface. The lit top
 * and the wall slots belong to the accent channel and live in the light rig —
 * this is the body they are set into.
 */
function Reception() {
  const d = HL_PLAN.desk;
  const w = HL_PLAN.deskWall;
  const len = d.z1 - d.z0;
  const mid = (d.z0 + d.z1) / 2;

  const logoMat = useMemo(() => {
    const map = makeLogoTexture();
    return new THREE.MeshStandardMaterial({ map, roughness: 0.45, metalness: 0.25 });
  }, []);

  return (
    <group>
      {/* The feature wall: a dark inset panel standing proud of the flutes. */}
      <mesh position={[w.x + 0.09, (w.y0 + w.y1) / 2, (w.z0 + w.z1) / 2]} receiveShadow>
        <boxGeometry args={[0.18, w.y1 - w.y0, w.z1 - w.z0]} />
        <primitive object={M.marble} attach="material" />
      </mesh>
      {/* The mark, sized as signage: legible across a lobby, not a billboard. */}
      <mesh
        position={[w.x + 0.185, (w.y0 + w.y1) / 2 + 0.25, (w.z0 + w.z1) / 2]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[3.5, 1.75]} />
        <primitive object={logoMat} attach="material" />
      </mesh>

      {/* Desk body: a marble front under an oversailing stone top. */}
      <mesh position={[d.x, d.h / 2 + 0.07, mid]} castShadow receiveShadow>
        <boxGeometry args={[d.d, d.h - 0.14, len]} />
        <primitive object={M.marble} attach="material" />
      </mesh>
      {/* The shadow line under a worktop is most of what makes it read as
          stone rather than as a painted box. */}
      <mesh position={[d.x + 0.03, d.h + 0.02, mid]} castShadow receiveShadow>
        <boxGeometry args={[d.d + 0.12, 0.05, len + 0.1]} />
        <primitive object={M.stone} attach="material" />
      </mesh>
      {/* Recessed plinth, so the desk floats over its own underglow. */}
      <mesh position={[d.x - 0.04, 0.035, mid]}>
        <boxGeometry args={[d.d - 0.18, 0.07, len - 0.1]} />
        <primitive object={M.woodDark} attach="material" />
      </mesh>
      {/* Brass reveal along the front face. */}
      <mesh position={[d.x + d.d / 2 + 0.002, d.h - 0.2, mid]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[len - 0.2, 0.02]} />
        <primitive object={M.brass} attach="material" />
      </mesh>

    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Seating                                                             */
/* ------------------------------------------------------------------ */

/**
 * A curved sectional, built as segments on an arc.
 *
 * A lobby sofa is curved because a lobby has no walls to put a sofa against —
 * the seating has to make its own room, and an arc is how it does that. Built
 * from straight segments rotated onto the arc rather than from swept geometry:
 * at nine segments over 120 degrees the facets are under 14 degrees apart and
 * the rounded corners hide the joints, which is also how the real thing is
 * upholstered.
 *
 * The arc opens toward the camera, so what is in frame is the seat, the
 * cushions and the inside of the back — never the outside of it. A sofa
 * photographed from behind is the commonest mistake in a rendered lounge, and
 * the brief calls it out by name.
 */
function CurvedSofa({
  radius,
  from,
  to,
  segments = 9,
  seat = M.boucleSeat,
  back = M.boucle,
}: {
  radius: number;
  /** Arc limits in radians, measured from +x in the XZ plane. */
  from: number;
  to: number;
  segments?: number;
  seat?: THREE.Material;
  back?: THREE.Material;
}) {
  const span = (to - from) / segments;
  // Chord of one segment, plus a little so neighbours overlap rather than gap.
  const width = 2 * radius * Math.sin(span / 2) + 0.06;

  return (
    <group>
      {Array.from({ length: segments }, (_, i) => {
        const a = from + span * (i + 0.5);
        const x = Math.cos(a) * radius;
        const z = Math.sin(a) * radius;
        return (
          <group key={i} position={[x, 0, z]} rotation={[0, -a + Math.PI / 2, 0]}>
            <mesh position={[0, 0.07, 0]} receiveShadow>
              <boxGeometry args={[width, 0.14, 0.78]} />
              <primitive object={M.metal} attach="material" />
            </mesh>
            <RoundedBox
              args={[width, 0.3, 0.95]}
              radius={0.05}
              smoothness={3}
              position={[0, 0.3, 0]}
              castShadow
              receiveShadow
            >
              <primitive object={back} attach="material" />
            </RoundedBox>
            <RoundedBox
              args={[width - 0.04, 0.2, 0.86]}
              radius={0.075}
              smoothness={3}
              position={[0, 0.54, 0.03]}
              castShadow
              receiveShadow
            >
              <primitive object={seat} attach="material" />
            </RoundedBox>
            <RoundedBox
              args={[width - 0.04, 0.46, 0.22]}
              radius={0.085}
              smoothness={3}
              position={[0, 0.82, -0.33]}
              rotation={[0.12, 0, 0]}
              castShadow
            >
              <primitive object={back} attach="material" />
            </RoundedBox>
          </group>
        );
      })}
    </group>
  );
}

/** A barrel armchair: a drum back over a seat on a turned plinth. */
function BarrelChair({ mat }: { mat: THREE.Material }) {
  return (
    <group>
      <mesh position={[0, 0.5, -0.06]} castShadow receiveShadow>
        <cylinderGeometry
          args={[0.46, 0.44, 0.78, 28, 1, false, Math.PI * 0.18, Math.PI * 1.34]}
        />
        <primitive object={mat} attach="material" />
      </mesh>
      <RoundedBox
        args={[0.78, 0.2, 0.72]}
        radius={0.08}
        smoothness={3}
        position={[0, 0.49, 0.06]}
        castShadow
        receiveShadow
      >
        <primitive object={mat} attach="material" />
      </RoundedBox>
      <mesh position={[0, 0.17, -0.02]} castShadow>
        <cylinderGeometry args={[0.3, 0.36, 0.34, 24]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
    </group>
  );
}

/** Round marble table, styled at three heights. */
function CoffeeTable({
  r = 0.62,
  h = 0.4,
  styled = true,
}: {
  r?: number;
  h?: number;
  styled?: boolean;
}) {
  return (
    <group>
      <mesh position={[0, h, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r, 0.08, 36]} />
        <primitive object={M.marble} attach="material" />
      </mesh>
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[r * 0.46, r * 0.6, h - 0.04, 28]} />
        <primitive object={M.marble} attach="material" />
      </mesh>
      {styled && (
        <group position={[0, h + 0.04, 0]}>
          <group position={[r * 0.26, 0, -r * 0.1]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.06, 0.08, 0.22, 18]} />
              <primitive object={M.brass} attach="material" />
            </mesh>
            {[0, 1, 2, 3, 4, 5].map((j) => (
              <group key={j} rotation={[0, j * 1.2, 0.14 + (j % 3) * 0.08]}>
                <mesh position={[0, 0.2, 0]} castShadow>
                  <cylinderGeometry args={[0.004, 0.005, 0.26, 6]} />
                  <primitive object={M.foliageDark} attach="material" />
                </mesh>
                <mesh position={[0, 0.33, 0]} scale={[1, 0.8, 1]} castShadow>
                  <sphereGeometry args={[0.035, 10, 8]} />
                  <primitive object={M.bloom} attach="material" />
                </mesh>
              </group>
            ))}
          </group>
          <mesh position={[-r * 0.34, 0.012, r * 0.16]} castShadow>
            <cylinderGeometry args={[0.2, 0.2, 0.024, 28]} />
            <primitive object={M.brass} attach="material" />
          </mesh>
          <mesh position={[-r * 0.3, 0.048, r * 0.18]} rotation={[0, 0.3, 0]} castShadow>
            <boxGeometry args={[0.26, 0.035, 0.19]} />
            <primitive object={M.woodDark} attach="material" />
          </mesh>
          <mesh position={[-r * 0.28, 0.08, r * 0.2]} rotation={[0, 0.1, 0]} castShadow>
            <boxGeometry args={[0.23, 0.03, 0.17]} />
            <primitive object={M.leather} attach="material" />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** Side table on a slim brass stem. */
function SideTable({ h = 0.56 }: { h?: number }) {
  return (
    <group>
      <mesh position={[0, h, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.26, 0.26, 0.05, 28]} />
        <primitive object={M.marble} attach="material" />
      </mesh>
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, h, 12]} />
        <primitive object={M.brass} attach="material" />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.19, 0.21, 0.035, 22]} />
        <primitive object={M.brass} attach="material" />
      </mesh>
    </group>
  );
}

/**
 * The main lounge group.
 *
 * Laid out inside one rotated group, with the rug turned with it. Everything
 * in a zone sharing one axis is what makes furniture read as arranged rather
 * than as pushed aside for cleaning.
 */
function Lounge() {
  const { x, z } = HL_PLAN.lounge;
  const pillows = [
    { a: 0.28, m: M.velvet, s: 0.5 },
    { a: 0.4, m: M.caramel, s: 0.42 },
    { a: 0.52, m: M.velvet, s: 0.46 },
    { a: 0.64, m: M.caramel, s: 0.44 },
    { a: 0.76, m: M.velvet, s: 0.48 },
  ];

  return (
    <group position={[x, 0, z]} rotation={[0, 0.22, 0]}>
      <mesh position={[0, 0.008, 0.2]} receiveShadow>
        <boxGeometry args={[8.6, 0.016, 6.8]} />
        <primitive object={M.rug} attach="material" />
      </mesh>

      {/*
        The sectional, on the far side of the group facing the camera.

        The arc is centred 2.9 m beyond the sofa and opens toward +z, so the
        frame gets seats and cushions. Put the other way round it would be a
        wall of upholstered backs across the middle of the picture.
      */}
      <group position={[-0.6, 0, -2.5]}>
        <CurvedSofa radius={2.9} from={Math.PI * 0.2} to={Math.PI * 0.8} segments={9} />
        {pillows.map((p, i) => {
          const a = Math.PI * p.a;
          const r = 2.58;
          return (
            <group
              key={`pw-${i}`}
              position={[Math.cos(a) * r, 0.85, Math.sin(a) * r]}
              rotation={[0.2, -a + Math.PI / 2, 0.22 * (i % 2 ? 1 : -1)]}
            >
              <RoundedBox args={[p.s, p.s, 0.18]} radius={0.08} smoothness={3} castShadow>
                <primitive object={p.m} attach="material" />
              </RoundedBox>
            </group>
          );
        })}
      </group>

      {/*
        There was a second sweep here, closing the group on the left, and it
        had to go.

        At 4.5 m from the lens it filled the bottom-left quarter of the frame
        with the *outside* of a sofa back — the exact fault the brief lists
        first. A lounge does not need a piece of furniture in every direction;
        it needs the camera to have somewhere to stand.
      */}

      <group position={[0.1, 0, 0.9]}>
        <CoffeeTable r={0.68} />
      </group>
      <group position={[1.5, 0, 1.95]}>
        <CoffeeTable r={0.5} h={0.36} styled={false} />
      </group>

      {/*
        Barrel chairs on the near side, turned back into the group.

        Seen from three-quarter behind, which is correct: a drum back in tan
        leather is sculptural from any angle, and turning them to face the
        camera would have them facing away from the sofa — a conversational
        cluster nobody could hold a conversation in.
      */}
      <group position={[3.5, 0, 1.9]} rotation={[0, -2.3, 0]}>
        <BarrelChair mat={M.leather} />
      </group>
      <group position={[4.0, 0, 0.1]} rotation={[0, -1.75, 0]}>
        <BarrelChair mat={M.leather} />
      </group>
      <group position={[2.9, 0, -1.9]} rotation={[0, -1.1, 0]}>
        <BarrelChair mat={M.velvet} />
      </group>

      <group position={[4.05, 0, 1.0]}>
        <SideTable />
      </group>
    </group>
  );
}

/** The second cluster, further back toward the water feature. */
function Lounge2() {
  const { x, z } = HL_PLAN.lounge2;
  return (
    <group position={[x, 0, z]} rotation={[0, -0.5, 0]}>
      <mesh position={[0, 0.008, 0]} receiveShadow>
        <boxGeometry args={[4.8, 0.016, 4.4]} />
        <primitive object={M.rug} attach="material" />
      </mesh>
      <group position={[0, 0, -1.7]}>
        <CurvedSofa radius={2.2} from={Math.PI * 0.22} to={Math.PI * 0.78} segments={6} />
      </group>
      <group position={[0.1, 0, 0.5]}>
        <CoffeeTable r={0.46} h={0.36} />
      </group>
      <group position={[1.4, 0, 1.4]} rotation={[0, -2.4, 0]}>
        <BarrelChair mat={M.caramel} />
      </group>
      <group position={[-1.5, 0, 1.3]} rotation={[0, 2.5, 0]}>
        <BarrelChair mat={M.leather} />
      </group>
    </group>
  );
}

/** Bodies for the decoratives the light rig lights. */
function Lamps() {
  return (
    <group>
      {LAMPS.map((l, i) => (
        <group key={`lamp-${i}`} position={[l.x, 0, l.z]}>
          {l.kind === "floor" ? (
            <>
              <mesh position={[0, l.y / 2, 0]} castShadow>
                <cylinderGeometry args={[0.019, 0.026, l.y - 0.16, 12]} />
                <primitive object={M.brass} attach="material" />
              </mesh>
              <mesh position={[0, 0.02, 0]} castShadow>
                <cylinderGeometry args={[0.15, 0.19, 0.035, 22]} />
                <primitive object={M.brass} attach="material" />
              </mesh>
            </>
          ) : (
            <>
              <mesh position={[0, l.y - 0.26, 0]} castShadow>
                <cylinderGeometry args={[0.019, 0.019, 0.3, 10]} />
                <primitive object={M.brass} attach="material" />
              </mesh>
              <mesh position={[0, l.y - 0.42, 0]} castShadow>
                <cylinderGeometry args={[0.08, 0.095, 0.04, 18]} />
                <primitive object={M.brass} attach="material" />
              </mesh>
            </>
          )}
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Water feature                                                       */
/* ------------------------------------------------------------------ */

/**
 * A cascading water wall, as a shader.
 *
 * Water falling down a wall is not a texture that scrolls; it is many columns
 * falling at *different* speeds, each with a bright leading edge where the
 * sheet is thinnest, over a shimmer that is faster than any of them. That is
 * three frequencies, and the only cheap way to get all three onto a five-metre
 * surface is to compute them per fragment.
 *
 * The columns are hashed off their own index, so no two fall together and the
 * whole wall never repeats — which is the single thing that separates running
 * water from an animated stripe. The leading-edge term is what reads as a
 * droplet front, and the vertical gradient is the real behaviour of a weir:
 * thin and bright at the lip, thick and dark in the basin.
 */
const WATER_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const WATER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uLevel;
  varying vec2 vUv;

  float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }

  void main() {
    float cols = 84.0;
    float col = floor(vUv.x * cols);
    float speed = 0.5 + hash(col) * 1.1;
    float phase = hash(col + 17.0) * 10.0;

    // Falling: a feature at constant phase satisfies y = const - t.
    // Long, soft streaks — 1.3 cycles over the wall rather than 2.4. Short
    // ones tile visibly and the whole surface reads as a barcode, which is
    // exactly what the first version did.
    float y = fract(vUv.y * 1.3 + uTime * speed + phase);
    float streak = smoothstep(0.0, 0.42, y) * (1.0 - smoothstep(0.45, 1.0, y));

    // The ribs of the weir itself, which stay put while the water moves. Kept
    // shallow: at full contrast they stop being a texture and become blinds.
    float rib = 0.82 + 0.18 * abs(sin(vUv.x * cols * 3.14159));
    float shimmer = 0.84 + 0.16 * sin(uTime * 4.0 + vUv.y * 46.0 + col * 2.1);

    float v = (0.42 + streak * 0.85) * rib * shimmer;
    // Thin and bright at the lip, thick and dark into the basin.
    v *= mix(0.55, 1.2, vUv.y);

    gl_FragColor = vec4(uColor * v * uLevel, 1.0);
  }
`;

export function WaterWall({
  colour,
  level,
}: {
  colour: THREE.Color;
  /** 0..1 aperture brightness from the feature channel. */
  level: number;
}) {
  const w = HL_PLAN.water;
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color("#2e8fd0") },
          uLevel: { value: 1 },
        },
        vertexShader: WATER_VERT,
        fragmentShader: WATER_FRAG,
        // The wall is a light source in its own right; the composer tone maps
        // it along with everything else at the end of the pipeline.
        toneMapped: false,
      }),
    [],
  );

  useLayoutEffect(() => {
    (mat.uniforms.uColor.value as THREE.Color).copy(colour);
    /**
     * Never quite zero.
     *
     * With the feature channel off the wall went to pure black, and a
     * five-metre black rectangle in the middle of the back wall reads as a
     * hole in the building rather than as an unlit feature. Water that is not
     * backlit is still wet stone catching the room's own light, so the floor
     * is what that looks like — and it is what makes Cleaning read as a scene
     * rather than as a rendering failure.
     */
    mat.uniforms.uLevel.value = Math.max(level, 0.05);
  });

  // Only while it is actually lit: a dark water wall has nothing to animate,
  // and registering motion would hold the whole room at the reduced frame rate
  // for no visible reason.
  useContinuousMotion("hl-water", level > 0.02);
  useFrame((_, dt) => {
    if (level > 0.02) mat.uniforms.uTime.value += dt * 0.42;
  });

  return (
    <group>
      {/* Stone reveal around the opening, so the water sits in a recess. */}
      <mesh position={[(w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2 + 0.35, w.z - 0.14]} receiveShadow>
        <boxGeometry args={[w.x1 - w.x0 + 1.5, w.y1 - w.y0 + 1.3, 0.28]} />
        <primitive object={M.stone} attach="material" />
      </mesh>
      <mesh position={[(w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2, w.z + 0.02]}>
        <planeGeometry args={[w.x1 - w.x0, w.y1 - w.y0]} />
        <primitive object={mat} attach="material" />
      </mesh>

      {/* The basin, and the dark reveal that stops it reading as a screen. */}
      <mesh position={[(w.x0 + w.x1) / 2, 0.16, w.z + 0.42]} receiveShadow>
        <boxGeometry args={[w.x1 - w.x0 + 1.1, 0.32, 0.95]} />
        <primitive object={M.marble} attach="material" />
      </mesh>
      <mesh
        position={[(w.x0 + w.x1) / 2, 0.3, w.z + 0.42]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[w.x1 - w.x0 + 0.7, 0.7]} />
        <meshStandardMaterial
          color="#09131a"
          roughness={0.03}
          metalness={0.4}
          envMapIntensity={2}
        />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Sculpture and artwork                                               */
/* ------------------------------------------------------------------ */

/**
 * An original abstract piece on a plinth, in front of the water.
 *
 * Built as a stack of rotated, tapering slabs — a form that reads as carved
 * from any angle without being a recognisable object. The reference has a
 * bronze torso here; a torso modelled badly is far worse than no torso, and
 * the sheet's point is that the *accent head on it* is what makes it a focal
 * element.
 */
function Sculpture() {
  const { x, z } = HL_PLAN.sculpture;
  const bronze = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#7a5a33",
        roughness: 0.35,
        metalness: 0.75,
        envMapIntensity: 1.4,
      }),
    [],
  );

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.46, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.95, 0.92, 0.95]} />
        <primitive object={M.marble} attach="material" />
      </mesh>
      <mesh position={[0, 0.94, 0]}>
        <boxGeometry args={[1.02, 0.04, 1.02]} />
        <primitive object={M.brass} attach="material" />
      </mesh>
      <group position={[0, 0.96, 0]}>
        {Array.from({ length: 9 }, (_, i) => {
          const t = i / 8;
          const w = 0.52 - t * 0.3;
          return (
            <mesh
              key={i}
              position={[Math.sin(t * 3.1) * 0.12, 0.09 + t * 1.26, Math.cos(t * 2.3) * 0.08]}
              rotation={[0, t * 2.2, Math.sin(t * 4.0) * 0.22]}
              castShadow
            >
              <boxGeometry args={[w, 0.2, w * 0.42]} />
              <primitive object={bronze} attach="material" />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

/** Large original abstract canvas on the panelled wall, in a thin frame. */
function Artwork() {
  const a = HL_PLAN.art;
  const art = useMemo(() => makeArtTexture(47), []);
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: art,
        // Knocked back, because this canvas has a narrow beam on it. The same
        // texture hangs in the den under ambient light and reads correctly
        // there; under an accent head at full it goes to paper white and the
        // painting disappears into its own highlight.
        color: "#b9b2a6",
        roughness: 0.86,
      }),
    [art],
  );

  return (
    <group>
      {/* Frame: thin, and barely proud of the canvas. A wide moulding on an
          abstract is the quickest way to make a lobby look like a hotel from
          1994. */}
      <mesh position={[a.x, a.y, a.z + 0.05]} castShadow>
        <boxGeometry args={[a.w + 0.07, a.h + 0.07, 0.1]} />
        <primitive object={M.brass} attach="material" />
      </mesh>
      <mesh position={[a.x, a.y, a.z + 0.105]}>
        <planeGeometry args={[a.w, a.h]} />
        <primitive object={mat} attach="material" />
      </mesh>
      {/* Picture light over the frame: the fitting that explains the beam. */}
      <mesh position={[a.x, a.y + a.h / 2 + 0.24, a.z + 0.3]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, a.w * 0.5, 14, 1, false, 0, Math.PI]} />
        <primitive object={M.brass} attach="material" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Façade and exterior                                                 */
/* ------------------------------------------------------------------ */

/**
 * A dusk sky with depth, drawn to a canvas.
 *
 * The brief's first named mistake is a blown-out white window, and the cause
 * is almost always the same: an exterior rendered as one flat bright value.
 * A real sky is a gradient with a warm band at the horizon, and what gives it
 * *depth* is what sits in front of it — a tree line, then a far skyline, then
 * the planting on the driveway. Three bands at three values, not one.
 *
 * `daylight` is 0..1 from the simulation, so dusk is a real state between day
 * and night rather than a switch. Cached by step, because this is a 2048 px
 * canvas and rebuilding it on every tick of the clock would be a stall a
 * second — the cabin already learned that one.
 */
const SKY_CACHE = new Map<number, HTMLCanvasElement>();

function skyCanvas(step: number): HTMLCanvasElement {
  const hit = SKY_CACHE.get(step);
  if (hit) return hit;

  const w = 2048;
  const h = 1024;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  let s = 7919;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const d = Math.min(Math.max(step, 0), 1);
  const mix = (a: number[], b: number[], t: number) =>
    `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;

  // Night -> dusk by 0.18, dusk -> day above it. The horizon warms long
  // before the zenith does, which is what makes a dusk sky read as dusk.
  const duskT = Math.min(d / 0.18, 1);
  const dayT = Math.max(0, (d - 0.18) / 0.82);
  const zenith = mix([10, 15, 34], duskT < 1 ? [30, 40, 86] : [112, 160, 216], duskT < 1 ? duskT : dayT);
  const horizon = mix([34, 28, 46], duskT < 1 ? [226, 132, 72] : [196, 214, 234], duskT < 1 ? duskT : dayT);

  const sky = g.createLinearGradient(0, 0, 0, h * 0.74);
  sky.addColorStop(0, zenith);
  sky.addColorStop(1, horizon);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  const night = 1 - Math.min(d / 0.3, 1);
  // Stars, before anything stands in front of them.
  if (night > 0.2) {
    g.fillStyle = `rgba(255,255,240,${0.5 * night})`;
    for (let i = 0; i < 260; i++) {
      const r = rnd() * 1.5 + 0.4;
      g.beginPath();
      g.arc(rnd() * w, rnd() * h * 0.5, r, 0, Math.PI * 2);
      g.fill();
    }
  }

  const skyline = h * 0.7;

  // A far skyline, hazed back toward the sky. Aerial perspective is the whole
  // trick: distant buildings are not smaller, they are paler.
  g.globalAlpha = 0.55;
  g.fillStyle = mix([58, 66, 92], [150, 170, 196], Math.max(duskT, dayT) * 0.8);
  for (let x = -60; x < w; ) {
    const bw = 40 + rnd() * 110;
    const bh = 60 + rnd() * 190;
    g.fillRect(x, skyline - bh, bw, bh);
    x += bw + rnd() * 26;
  }
  g.globalAlpha = 1;

  // Lit windows on the far towers, at night only.
  if (night > 0.15) {
    g.fillStyle = `rgba(255,226,170,${0.65 * night})`;
    for (let i = 0; i < 520; i++) {
      const x = rnd() * w;
      const y = skyline - rnd() * 180;
      g.fillRect(x, y, 4, 7);
    }
  }

  // Palm crowns along the driveway edge — the nearest band, and the darkest.
  const crown = `rgba(14,24,18,${0.78 + night * 0.2})`;
  for (let i = 0; i < 26; i++) {
    const cx = rnd() * w;
    const cy = skyline - 30 - rnd() * 110;
    const trunkH = 120 + rnd() * 150;
    g.strokeStyle = crown;
    g.lineWidth = 7 + rnd() * 5;
    g.beginPath();
    g.moveTo(cx, cy + trunkH);
    g.quadraticCurveTo(cx + 14, cy + trunkH / 2, cx, cy);
    g.stroke();
    for (let f = 0; f < 9; f++) {
      const a = (f / 9) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx, cy);
      g.quadraticCurveTo(
        cx + Math.cos(a) * 56,
        cy + Math.sin(a) * 40 - 26,
        cx + Math.cos(a) * 92,
        cy + Math.sin(a) * 64 + 16,
      );
      g.lineWidth = 4;
      g.stroke();
    }
  }

  // Ground.
  g.fillStyle = `rgb(${Math.round(16 + 26 * d)},${Math.round(17 + 26 * d)},${Math.round(19 + 24 * d)})`;
  g.fillRect(0, skyline, w, h - skyline);

  SKY_CACHE.set(step, c);
  return c;
}

/**
 * Glazing, mullions, blinds, and the driveway beyond.
 *
 * The mullions are instanced — forty of them at 1.2 m centres over
 * twenty-two metres — and deliberately slim and dark, because the thickness
 * of a mullion is most of what dates a curtain wall.
 */
function Facade({
  skyStep,
  blinds,
}: {
  skyStep: number;
  blinds: ShadeState;
}) {
  const f = HL_PLAN.facade;
  const span = f.z1 - f.z0;
  const height = f.y1 - f.y0;
  const mullions = useRef<THREE.InstancedMesh>(null);
  const count = Math.round(span / 1.35) + 1;

  const viewMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(skyCanvas(skyStep)),
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    [skyStep],
  );
  useLayoutEffect(() => {
    const tex = new THREE.CanvasTexture(skyCanvas(skyStep));
    tex.colorSpace = THREE.SRGBColorSpace;
    const old = viewMat.map;
    viewMat.map = tex;
    viewMat.needsUpdate = true;
    old?.dispose();
  }, [skyStep, viewMat]);

  useLayoutEffect(() => {
    const mesh = mullions.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      m.makeTranslation(f.x - 0.06, (f.y0 + f.y1) / 2, f.z0 + (span / (count - 1)) * i);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [count, span, f.x, f.y0, f.y1, f.z0]);

  /**
   * Blinds, as roller fabric unrolling from the head.
   *
   * A roller is not a curtain: it does not gather, it descends. So the
   * geometry is a plane whose height and centre both follow the position,
   * which is also the cheapest possible shading device — one scaled quad per
   * layer rather than eight pleated meshes travelling on a track.
   */
  const layers = [
    { key: "sheer", pos: blinds.sheer, x: f.x - 0.16, colour: "#b8b2a6", opacity: 0.42 },
    { key: "blackout", pos: blinds.blackout, x: f.x - 0.3, colour: "#2b2822", opacity: 0.96 },
  ] as const;

  return (
    <group>
      {/* The view, set well back so the mullions have something to move
          against. 34 m out, which is where the driveway planting sits. */}
      <mesh position={[f.x + 34, 7, (f.z0 + f.z1) / 2]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[132, 66]} />
        <primitive object={viewMat} attach="material" />
      </mesh>

      {/* Driveway, canopy soffit and the kerb. */}
      <mesh position={[f.x + 7, -0.02, (f.z0 + f.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[14, span + 10]} />
        <primitive object={M.tarmac} attach="material" />
      </mesh>
      <mesh position={[f.x + 2.6, 5.9, (f.z0 + f.z1) / 2]} castShadow>
        <boxGeometry args={[5.2, 0.3, span + 2]} />
        <primitive object={M.soffit} attach="material" />
      </mesh>
      {[0.25, 0.55, 0.85].map((t, i) => (
        <mesh key={`cc-${i}`} position={[f.x + 4.6, 2.95, f.z0 + span * t]} castShadow>
          <cylinderGeometry args={[0.26, 0.3, 5.9, 16]} />
          <primitive object={M.stone} attach="material" />
        </mesh>
      ))}

      {/* Glass. */}
      <mesh position={[f.x - 0.02, (f.y0 + f.y1) / 2, (f.z0 + f.z1) / 2]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[span, height]} />
        <primitive object={M.glass} attach="material" />
      </mesh>

      {/* Slim dark mullions, head and cill. */}
      <instancedMesh ref={mullions} args={[undefined, undefined, count]} castShadow>
        <boxGeometry args={[0.1, height, 0.075]} />
        <primitive object={M.metal} attach="material" />
      </instancedMesh>
      <mesh position={[f.x - 0.06, f.y1, (f.z0 + f.z1) / 2]}>
        <boxGeometry args={[0.14, 0.16, span]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      <mesh position={[f.x - 0.06, f.y0, (f.z0 + f.z1) / 2]}>
        <boxGeometry args={[0.16, 0.1, span]} />
        <primitive object={M.metal} attach="material" />
      </mesh>

      {layers.map((l) => {
        const drop = Math.max(0, Math.min(1, l.pos / 100));
        if (drop <= 0.002) return null;
        const h = height * drop;
        return (
          <mesh
            key={l.key}
            position={[l.x, f.y1 - h / 2, (f.z0 + f.z1) / 2]}
            rotation={[0, -Math.PI / 2, 0]}
          >
            <planeGeometry args={[span - 0.1, h]} />
            <meshStandardMaterial
              color={l.colour}
              roughness={0.85}
              transparent
              opacity={l.opacity}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/** A generic dark sedan at the entrance. No badge, no recognisable make. */
function Car() {
  // Far enough forward to be inside the frame: at 0.62 of the façade it sat
  // at 70 degrees off the camera axis, which is thirty degrees outside the
  // picture. A car nobody can see is not an arrival.
  const z = HL_PLAN.facade.z0 + (HL_PLAN.facade.z1 - HL_PLAN.facade.z0) * 0.24;
  return (
    <group position={[HL.w + 6.4, 0, z]} rotation={[0, 0.06, 0]}>
      <mesh position={[0, 0.62, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.92, 0.62, 4.86]} />
        <primitive object={M.car} attach="material" />
      </mesh>
      <mesh position={[0, 1.08, -0.18]} castShadow>
        <boxGeometry args={[1.72, 0.52, 2.65]} />
        <primitive object={M.car} attach="material" />
      </mesh>
      {/* Glazing band, which is what actually makes a box read as a car. */}
      <mesh position={[0, 1.12, -0.18]}>
        <boxGeometry args={[1.76, 0.34, 2.5]} />
        <meshPhysicalMaterial color="#0a0d12" roughness={0.08} metalness={0.3} />
      </mesh>
      {[-0.78, 0.78].map((dx) =>
        [-1.62, 1.62].map((dz) => (
          <mesh
            key={`wh-${dx}-${dz}`}
            position={[dx, 0.33, dz]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.33, 0.33, 0.24, 18]} />
            <meshStandardMaterial color="#0c0d0f" roughness={0.85} />
          </mesh>
        )),
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Planting                                                            */
/* ------------------------------------------------------------------ */

/**
 * Specimens in stone planters, inside and out.
 *
 * Every one is a real plant — leaves on stems, or fronds on a trunk — and
 * every one is a single instanced draw. The reference leans on planting
 * heavily for warmth and it is the one thing in a lobby that cannot be faked
 * with a sphere: a topiary ball in a pot reads as a placeholder from across a
 * room, which is the second mistake the brief names.
 */
const PLANTING = [
  // Inside: flanking the reception run and the water feature. Kept clear of
  // the panelled wall — a specimen whose fronds pass through joinery is worse
  // than no specimen.
  { x: 2.2, z: 7.0, r: 0.52, h: 0.6, palm: true, scale: 0.8, pale: false },
  { x: 2.2, z: 17.6, r: 0.52, h: 0.6, palm: true, scale: 0.72, pale: false },
  { x: 4.5, z: 2.6, r: 0.46, h: 0.52, palm: false, scale: 1.15, pale: true },
  { x: 14.2, z: 2.6, r: 0.46, h: 0.52, palm: false, scale: 1.1, pale: true },
  { x: 15.8, z: 12.2, r: 0.5, h: 0.58, palm: true, scale: 0.85, pale: false },
  { x: 15.8, z: 20.4, r: 0.5, h: 0.58, palm: false, scale: 1.25, pale: false },
  { x: 11.0, z: 20.9, r: 0.44, h: 0.5, palm: false, scale: 1.05, pale: true },
  // Outside, on the driveway.
  { x: HL.w + 2.1, z: 4.0, r: 0.58, h: 0.66, palm: true, scale: 1.0, pale: false },
  { x: HL.w + 2.1, z: 19.6, r: 0.58, h: 0.66, palm: true, scale: 0.95, pale: false },
] as const;

function Planting() {
  return (
    <group>
      {PLANTING.map((p, i) => (
        <group key={`pl-${i}`} position={[p.x, 0, p.z]}>
          <mesh position={[0, p.h / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[p.r, p.r * 0.84, p.h, 24]} />
            <primitive object={p.pale ? M.planterPale : M.planter} attach="material" />
          </mesh>
          <mesh position={[0, p.h + 0.01, 0]}>
            <cylinderGeometry args={[p.r * 0.92, p.r * 0.92, 0.03, 24]} />
            <primitive object={M.woodDark} attach="material" />
          </mesh>
          <group position={[0, p.h, 0]}>
            {p.palm ? (
              <Palm height={2.5 * p.scale} />
            ) : (
              <Foliage scale={p.scale} />
            )}
          </group>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Automation tells                                                    */
/* ------------------------------------------------------------------ */

/**
 * The two automations you can see from inside the room.
 *
 * Every other automation in this project is argued for by its effect — the
 * lights change, so something must have decided they should. These two are
 * different: occupancy and music are the ones a client asks "how does it
 * know?" and "is that on?" about, and the honest answer is a sensor on the
 * ceiling and a speaker with a light on it. Showing the hardware is what turns
 * a claim into a demonstration.
 *
 * The sensor's ring goes green when the lounge reads occupied and amber when
 * it does not, so the Controls toggle has somewhere in the room to land.
 */
function AutomationTells({
  occupied,
  musicOn,
  audioLevel,
}: {
  occupied: boolean;
  musicOn: boolean;
  audioLevel: number;
}) {
  const sensorMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#101214",
        emissive: new THREE.Color("#000000"),
        emissiveIntensity: 0,
        roughness: 0.4,
        toneMapped: false,
      }),
    [],
  );
  useLayoutEffect(() => {
    sensorMat.emissive.set(occupied ? "#43d17a" : "#d19a3a");
    sensorMat.emissiveIntensity = 2.4;
  });

  const musicMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#0d0f12",
        emissive: new THREE.Color("#7fc4ff"),
        emissiveIntensity: 0,
        roughness: 0.4,
        toneMapped: false,
      }),
    [],
  );
  useLayoutEffect(() => {
    // Brightness tracks the volume, so "music up" is visible and not just
    // audible in a demo that has no sound.
    musicMat.emissiveIntensity = musicOn ? 0.9 + audioLevel * 3.4 : 0;
  });

  return (
    <group>
      {/* Occupancy heads over the two lounge clusters. */}
      {[HL_PLAN.lounge, HL_PLAN.lounge2].map((p, i) => (
        <group key={`occ-${i}`} position={[p.x, ceilingYAt(p.x, p.z) - 0.03, p.z]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.085, 0.085, 0.05, 20]} />
            <primitive object={M.soffit} attach="material" />
          </mesh>
          <mesh position={[0, -0.028, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.045, 0.072, 20]} />
            <primitive object={sensorMat} attach="material" />
          </mesh>
        </group>
      ))}

      {/* Ceiling speakers, on the circulation route where they would be. */}
      {[
        { x: 6.0, z: 6.4 },
        { x: 11.6, z: 11.8 },
        { x: 6.4, z: 18.2 },
        { x: 13.2, z: 16.4 },
      ].map((p, i) => (
        <group key={`spk-${i}`} position={[p.x, ceilingYAt(p.x, p.z) - 0.03, p.z]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.11, 0.11, 0.04, 20]} />
            <primitive object={M.soffit} attach="material" />
          </mesh>
          <mesh position={[0, -0.024, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.018, 12]} />
            <primitive object={musicMat} attach="material" />
          </mesh>
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
     * Low contrast, and one tile per slab.
     *
     * At the den's vein colour the strokes read as scratches across a polished
     * floor rather than as mineral — on a surface this large and this glossy,
     * anything with a hard edge in it becomes damage. Large-format stone is
     * also 1.2 m, so two tiles of the texture per slab keeps the veining from
     * repeating visibly down a twenty-four metre run.
     */
    const floor = makeMarbleTexture("#b7a897", "#cbbda8", 9173);
    floor.repeat.set(HL.w / 2.4, HL.d / 2.4);
    M.floor.map = floor;
    M.floor.color.set("#ffffff");
    M.floor.needsUpdate = true;

    const slab = makeMarbleTexture("#2f2b27", "#6f6457", 3301);
    M.marble.map = slab;
    M.marble.color.set("#ffffff");
    M.marble.needsUpdate = true;

    const col = makeMarbleTexture("#8f877b", "#cfc6b6", 5521);
    col.repeat.set(1, 2.4);
    M.stone.map = col;
    M.stone.color.set("#ffffff");
    M.stone.needsUpdate = true;

    const fine = makeFabricNormal(6, 0.5, 1777);
    const coarse = makeFabricNormal(11, 0.82, 4021);
    const apply = (
      mat: THREE.MeshStandardMaterial,
      map: THREE.Texture,
      repeat: number,
      scale: number,
    ) => {
      const t = map.clone();
      t.needsUpdate = true;
      t.repeat.set(repeat, repeat);
      mat.normalMap = t;
      mat.normalScale = new THREE.Vector2(scale, scale);
      mat.needsUpdate = true;
    };
    apply(M.boucle, coarse, 5, 1.0);
    apply(M.boucleSeat, coarse, 5, 0.9);
    apply(M.velvet, fine, 9, 0.3);
    apply(M.caramel, coarse, 3, 0.9);
    apply(M.leather, fine, 8, 0.45);

    // Deep navy wool with an abstract pattern, tiled so the blotches read as
    // pile rather than as spills.
    const rug = makeRugTexture(4409, "#1f3a4a", 0.75);
    rug.repeat.set(2, 1.6);
    rug.wrapS = THREE.RepeatWrapping;
    rug.wrapT = THREE.RepeatWrapping;
    M.rug.map = rug;
    M.rug.color.set("#ffffff");
    M.rug.needsUpdate = true;
  }, []);
  return null;
}

/* ------------------------------------------------------------------ */

export function HotelLobby3D({
  daylight,
  skyStep,
  blinds,
  audioLevel = 0,
  musicOn = false,
  occupied = true,
}: {
  /** 0..1 exterior brightness, so the façade tracks the simulated clock. */
  daylight: number;
  /** The same figure quantised, for anything that rebuilds a canvas. */
  skyStep: number;
  blinds: ShadeState;
  /** 0..1 music volume, which drives the ceiling speakers' indicator. */
  audioLevel?: number;
  musicOn?: boolean;
  /** Whether the lounge occupancy sensor is reading presence. */
  occupied?: boolean;
}) {
  void daylight;
  return (
    <group>
      <Surfaces />
      <Shell />
      <PanelWall />
      <Columns />
      <Facade skyStep={skyStep} blinds={blinds} />
      <AutomationTells occupied={occupied} musicOn={musicOn} audioLevel={audioLevel} />
      <Car />
      <Planting />
      <Reception />
      <Sculpture />
      <Artwork />
      <Lounge />
      <Lounge2 />
      <Lamps />
    </group>
  );
}

