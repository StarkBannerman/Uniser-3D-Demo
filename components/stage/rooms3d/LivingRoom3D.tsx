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
import {
  makeArtTexture,
  makeCurtainGeometry,
  makeFabricNormal,
  makeMarbleTexture,
  makeRugTexture,
  makeScreenTexture,
} from "./geometry";

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
/**
 * The middle of the glazed opening — which is not the middle of the room.
 *
 * The opening runs from z = 0.5 to z = 6.2 in a room ten metres deep, so its
 * centre is at 3.35. The glass, the sill, the mullions, the track and the
 * daylight area light were all being placed at `LR.d / 2`, which put every one
 * of them 1.65 m toward the camera of the hole they belong in: the near end of
 * the "window" sat in front of solid wall, and the far end of the opening had
 * no glass in it at all. It never showed because the curtains covered the
 * discrepancy and the view behind it was black for an unrelated reason.
 */
export const LR_WINDOW_CZ = (LR_WINDOW.z0 + LR_WINDOW.z1) / 2;
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
  /**
   * Fluted timber, flanking the slab on both sides.
   *
   * The wall was one narrow band of slats at the far left and then five metres
   * of pale stone, which is a wall with a feature stuck on the end of it. A
   * feature wall is symmetrical about the thing it features: timber, slab,
   * timber, with the screen centred in the slab.
   */
  slats: { x0: 2.05, x1: 3.95 },
  slatsRight: { x0: 7.45, x1: LR.w },
  /** The dark slab, carrying the television. */
  stone: { x0: 3.95, x1: 7.45 },
  /** Shelving niches recessed into the slat panel, lit from inside. */
  niche: { x0: 2.2, x1: 3.15, y0: 0.45, y1: 2.45, bays: 3 },
  /** Floorstanders either side of the television. */
  speakers: [{ x: LR_TV.x - 2.0 }, { x: LR_TV.x + 2.0 }],
  /** Pendant cluster, hung over the dining table. */
  /**
   * Pendant cluster, hung at the mouth of the dining bay.
   *
   * Inside the bay it was hidden behind the jamb, which loses the Decorative
   * device entirely from the frame. Here it reads through the opening and does
   * the other job a light in a doorway does: it pulls the eye through.
   *
   * `ceiling` because the bay's ceiling is lower than the room's, and cords
   * dropped from the living room's slab would pass straight through it.
   */
  pendants: { x: 1.1, z: -0.85, ceiling: 2.55 },
  /** Ceiling fan hub, over the seating. */
  fan: { x: 4.1, z: 4.2, y: 2.72 },
  /** Dining table in the middle distance, under the pendants. */
  dining: { x: 1.1, z: -2.2 },
  /** Recessed air-conditioning cassette in the ceiling. */
  ac: { x: 4.4, z: 3.2 },
  /**
   * Feature artwork on the long left wall.
   *
   * Shared with the light rig, because the sheet's "Accent Lighting — highlight
   * artwork, textures and feature elements" callout points at exactly this, and
   * an accent head aimed at bare plaster is not accent lighting.
   */
  art: { z: 4.7, y: 1.72, w: 3.0, h: 1.7 },
  /**
   * Cased opening at the left end of the media wall, and the passage beyond.
   *
   * A living room is never a sealed box — it opens onto a hall, a kitchen, the
   * rest of the plan. Closing all four walls is what made this read as a
   * showroom cube, so the far wall is cut and the space carries on behind it.
   */
  opening: { x0: 0.15, x1: 2.05, head: 2.55, depth: 4.6 },
} as const;

/** Globe positions within the pendant cluster, relative to `LR_PLAN.pendants`. */
/**
 * Five globes rather than seven, hung at five different heights.
 *
 * Seven in a cluster this size read as a bunch of grapes: the globes touched,
 * the drops crossed, and the staggering — which is the entire idea of a
 * cluster pendant — was lost in the crowd. Five, spread wider and separated by
 * at least 180 mm of vertical, lets each one be seen as its own fitting, which
 * is what makes the Decorative channel worth having a button for.
 */
export const LR_PENDANT_GLOBES: { dx: number; dz: number; y: number; r: number }[] = [
  { dx: -0.3, dz: -0.36, y: 1.5, r: 0.125 },
  { dx: 0.26, dz: -0.18, y: 1.88, r: 0.1 },
  { dx: -0.06, dz: 0.06, y: 1.69, r: 0.115 },
  { dx: 0.33, dz: 0.4, y: 2.06, r: 0.09 },
  { dx: -0.26, dz: 0.44, y: 1.32, r: 0.105 },
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
    /**
     * Lighter and a good deal less orange.
     *
     * At #6b5647 this was a saturated mid-brown that pulled every warm scene
     * toward amber and left the room looking varnished rather than finished.
     * A pale European oak reflects about twice as much, which is what lets the
     * cove and the niches read against it.
     */
    color: "#a08a72",
    roughness: 0.3,
    metalness: 0.03,
  }),
  plank: new THREE.MeshStandardMaterial({ color: "#8d7963", roughness: 0.45 }),
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
  /**
   * Dark timber, where it used to be cream.
   *
   * The console's drawer fronts were nearly white, which in a room whose hero
   * is a dark wall-mounted screen put the brightest object in the frame
   * directly under the darkest one. It read as a kitchen run. Handle-less
   * fronts in the same walnut as the carcass let the console sit under the
   * screen instead of competing with it.
   */
  consoleBody: new THREE.MeshStandardMaterial({ color: "#4a382a", roughness: 0.52 }),
  consoleWood: new THREE.MeshStandardMaterial({ color: "#6a482c", roughness: 0.48 }),
  tv: new THREE.MeshStandardMaterial({ color: "#0b0c0e", roughness: 0.22 }),
  /**
   * The slab behind the television: dark stone, not pale.
   *
   * It was a light warm limestone, which put the brightest large surface in the
   * room directly around the darkest object in it — the screen read as a hole
   * punched in a wall. Dark stone does the opposite: the screen melts into it
   * when it is off, and the niches and the cove have something to read against.
   *
   * Low roughness because polished stone is the only thing on this wall that
   * returns a highlight, and that highlight is most of what says "stone".
   */
  stone: new THREE.MeshStandardMaterial({
    color: "#8e8880",
    roughness: 0.17,
    metalness: 0.06,
  }),
  slatBack: new THREE.MeshStandardMaterial({ color: "#3a2a1c", roughness: 0.88 }),
  nicheBack: new THREE.MeshStandardMaterial({ color: "#372a1e", roughness: 0.82 }),
  speaker: new THREE.MeshStandardMaterial({ color: "#191a1d", roughness: 0.5 }),
  /** Brushed aluminium, on the speaker towers and the console's shadow gap. */
  brushed: new THREE.MeshStandardMaterial({
    color: "#b6bcc2",
    roughness: 0.38,
    /**
     * Not 0.9, which is what the datasheet for aluminium would say.
     *
     * A fully metallic surface has *no* diffuse term — everything it shows is
     * reflected environment. The room's environment is a small procedural rig
     * of soft lightformers, so at 0.88 the speaker towers came out as black
     * columns with a rim: physically right and visually useless. Dropping to
     * 0.55 and raising `envMapIntensity` keeps the anisotropic sheen that says
     * brushed aluminium while leaving a diffuse base for the room's own lights
     * to land on.
     */
    metalness: 0.55,
    envMapIntensity: 1.7,
  }),
  /** Acoustic cloth: matte and black, so the driver array stays legible. */
  grille: new THREE.MeshStandardMaterial({ color: "#131417", roughness: 0.95 }),
  cone: new THREE.MeshStandardMaterial({ color: "#2e3034", roughness: 0.7 }),
  /** Graphite, not timber: the fan is meant to disappear, not to be furniture. */
  fanBlade: new THREE.MeshStandardMaterial({
    color: "#2a2b2e",
    roughness: 0.33,
    metalness: 0.25,
  }),
  /** The inside of the curtain pocket: dark, so the tracks vanish into it. */
  pocket: new THREE.MeshStandardMaterial({ color: "#14130f", roughness: 0.95 }),
  drape: new THREE.MeshPhysicalMaterial({
    color: "#a2988a",
    roughness: 0.86,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.3,
    sheenColor: new THREE.Color("#ded2bf"),
    side: THREE.DoubleSide,
  }),
  /**
   * Voile, as plain alpha rather than `transmission`.
   *
   * `transmission` is physically the right answer and the wrong engineering
   * one: it makes three.js render the entire scene a second time into a
   * transmission buffer, every frame, for a curtain. Opacity plus sheen is
   * indistinguishable here and costs one blend.
   */
  sheer: new THREE.MeshPhysicalMaterial({
    color: "#d9d6d0",
    roughness: 0.68,
    transparent: true,
    opacity: 0.42,
    sheen: 0.8,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color("#ffffff"),
    side: THREE.DoubleSide,
  }),
  glass: new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: 0.05,
    transparent: true,
    opacity: 0.07,
    side: THREE.DoubleSide,
  }),
  /** Greige chunky knit, for the cushions that are not velvet. */
  knit: new THREE.MeshPhysicalMaterial({
    color: "#b4ab9c",
    roughness: 0.98,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.9,
    sheenColor: new THREE.Color("#efe8da"),
  }),
  /** Olive velvet, on the pouf and the curved armchair. Sheen does the work. */
  velvet: new THREE.MeshPhysicalMaterial({
    color: "#5d6342",
    roughness: 0.74,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.32,
    sheenColor: new THREE.Color("#b9c08c"),
  }),
  /** The slab behind the screen: dark, so the screen is not the only dark thing. */
  slab: new THREE.MeshStandardMaterial({
    color: "#3b3732",
    roughness: 0.34,
    metalness: 0.05,
  }),
  foliage: new THREE.MeshStandardMaterial({ color: "#46603f", roughness: 0.82 }),
  /** White flowers. Off-white, because pure white blows out under the cove. */
  bloom: new THREE.MeshStandardMaterial({ color: "#eae4d8", roughness: 0.78 }),
  foliageDark: new THREE.MeshStandardMaterial({ color: "#324a2d", roughness: 0.86 }),
  pot: new THREE.MeshStandardMaterial({ color: "#d9d3c8", roughness: 0.7 }),
};

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

/**
 * One leaf, pointed at both ends, built once and shared.
 *
 * The plants in here were stacked spheres, which is the single piece of
 * geometry in the room that reads as a placeholder — a plant is recognised by
 * its leaves, and specifically by their taper. Same construction the cabin,
 * the workspace and the den use, so the project has one answer to this rather
 * than four.
 */
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
    tilt: 1.32 - t * 0.98 + (j - 0.5) * 0.22,
    roll: (j - 0.5) * 1.1,
    len: (0.44 - t * 0.15) * (0.85 + j * 0.3),
    y: 0.52 + t * 0.95,
    dark: i % 3 === 0,
  };
});

/**
 * A leafed specimen, scaled to whatever planter it stands in.
 *
 * One instanced mesh, not thirty-four separate ones.
 *
 * The den and the cabin draw each leaf as its own mesh, which is fine when a
 * room has two plants. This room has eight — floor, corner, shelf and balcony
 * — and at thirty-five meshes apiece that is 280 draw calls for foliage alone,
 * measured as roughly a third of the room's total. Every leaf is the same
 * geometry under a different transform, which is the exact shape of problem
 * instancing exists for: one call, thirty-four matrices.
 *
 * The two greens survive as per-instance colours rather than two materials,
 * because two materials would be two shader programs and two draws again.
 */
function Foliage({ scale = 1 }: { scale?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);

  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.82,
        // A leaf is a flat sheet; from behind, a single-sided one is a hole.
        side: THREE.DoubleSide,
      }),
    [],
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const light = new THREE.Color("#46603f");
    const dark = new THREE.Color("#324a2d");

    LEAVES.forEach((l, i) => {
      // turn about Y, then tilt about Z, then roll about Y again — the same
      // composition the nested groups expressed, flattened into one matrix.
      e.set(0, l.turn, 0, "YZX");
      q.setFromEuler(e);
      const tilt = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        -l.tilt,
      );
      const roll = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        l.roll,
      );
      q.multiply(tilt).multiply(roll);
      pos.set(0, l.y, 0);
      sc.set(l.len * 0.7, l.len, 1);
      m.compose(pos, q, sc);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, l.dark ? dark : light);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  return (
    <group scale={scale}>
      <instancedMesh
        ref={ref}
        args={[LEAF_GEOM, mat, LEAF_COUNT]}
        castShadow
        receiveShadow
      />
      <mesh position={[0, 0.86, 0]}>
        <cylinderGeometry args={[0.013, 0.017, 0.74, 10]} />
        <primitive object={M.foliageDark} attach="material" />
      </mesh>
    </group>
  );
}

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
function SlatPanel({
  x0,
  x1,
  niche = false,
}: {
  x0: number;
  x1: number;
  /** Only the left panel is cut for shelving; the right one runs full height. */
  niche?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
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
      const overNiche = niche && x > n.x0 - 0.04 && x < n.x1 + 0.04;
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
  }, [count, pitch, x0, height, niche, n.x0, n.x1, n.y1]);

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
  const slabMat = useMemo(() => {
    const map = makeMarbleTexture("#5a544c", "#c3b6a4", 4211);
    return new THREE.MeshStandardMaterial({
      map,
      color: "#ffffff",
      roughness: 0.17,
      metalness: 0.06,
    });
  }, []);
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
      {/*
        The slab, floor to soffit, in two book-matched halves.

        Real stone of this size arrives as consecutive slices off one block and
        is hung mirrored, so the veining meets at the centre line. It is the
        detail that separates a stone wall from a wall with a stone photograph
        on it, and here it costs a negative scale on the second plane.

        It stands 70 mm proud, so the graze heads in the soffit have an edge to
        find. A flush panel takes the same light and shows nothing for it.
      */}
      <mesh position={[(st.x0 + st.x1) / 2, (LR.h - LR.soffit.drop) / 2, 0.035]} receiveShadow>
        <boxGeometry args={[st.x1 - st.x0, LR.h - LR.soffit.drop, 0.07]} />
        <primitive object={M.slab} attach="material" />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={`slab-${side}`}
          position={[(st.x0 + st.x1) / 2 + (side * (st.x1 - st.x0)) / 4, (LR.h - LR.soffit.drop) / 2, 0.0705]}
          scale={[side, 1, 1]}
          receiveShadow
        >
          <planeGeometry args={[(st.x1 - st.x0) / 2, LR.h - LR.soffit.drop]} />
          <primitive object={slabMat} attach="material" />
        </mesh>
      ))}

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
            {/*
              What goes on a lit shelf.

              Three white cylinders on each bay looked like a crockery
              cupboard. The rule a stylist works to is one tall, one low, one
              horizontal, in three different materials — and crucially not the
              same three on every shelf, because repetition is what made the
              old arrangement read as stock.
            */}
            {i !== 2 && (
              <mesh position={[n.x0 + 0.2, base + 0.14, 0.14]} castShadow>
                <cylinderGeometry args={[0.05, 0.07, 0.26, 20]} />
                <primitive object={M.marble} attach="material" />
              </mesh>
            )}
            {/* A leaning stack of books — flat, so the shelf has a baseline. */}
            <mesh
              position={[n.x0 + (i === 1 ? 0.22 : 0.52), base + 0.045, 0.15]}
              rotation={[0, i * 0.3 - 0.2, 0]}
              castShadow
            >
              <boxGeometry args={[0.26, 0.07, 0.17]} />
              <primitive object={M.slab} attach="material" />
            </mesh>
            {i === 1 && (
              <mesh position={[n.x0 + 0.55, base + 0.17, 0.14]} castShadow>
                <boxGeometry args={[0.09, 0.18, 0.12]} />
                <primitive object={M.brass} attach="material" />
              </mesh>
            )}
            {i !== 1 && (
              <group position={[n.x1 - 0.3, base + 0.07, 0.14]}>
                <mesh castShadow>
                  <cylinderGeometry args={[0.07, 0.055, 0.14, 20]} />
                  <primitive object={M.pot} attach="material" />
                </mesh>
                <Foliage scale={0.32} />
              </group>
            )}
          </group>
        );
      })}

      {/*
        The console, lifted off the floor.

        It sat on the slab with its base in the floorboards, which is what a
        sideboard does; a media wall's console is cantilevered off the wall so
        the floor runs on underneath it. The 270 mm gap is there to be lit —
        the accent channel runs a strip along its underside, and that wash on
        the boards is most of what sells the thing as floating.
      */}
      <mesh position={[LR_TV.x, 0.44, 0.3]} castShadow receiveShadow>
        <boxGeometry args={[3.9, 0.34, 0.46]} />
        <primitive object={M.consoleWood} attach="material" />
      </mesh>
      {[-1.4, -0.47, 0.47, 1.4].map((dx) => (
        <mesh key={`door-${dx}`} position={[LR_TV.x + dx, 0.44, 0.532]}>
          <boxGeometry args={[0.86, 0.3, 0.014]} />
          <primitive object={M.consoleBody} attach="material" />
        </mesh>
      ))}
      {/* Shadow gap: a bright reveal under a dark box reads as a thickness. */}
      <mesh position={[LR_TV.x, 0.275, 0.3]}>
        <boxGeometry args={[3.9, 0.012, 0.44]} />
        <primitive object={M.brushed} attach="material" />
      </mesh>

      {/*
        Television, nearly flush and nearly frameless.

        The bezel was 25 mm of black all the way round on top of a 60 mm box,
        which is a 2014 television. A current panel is 8 mm of frame on a
        45 mm chassis and sits almost on the wall, so that is what this is —
        the depth here is the difference between a screen hung on a slab and a
        screen floating 40 mm in front of one.
      */}
      <mesh position={[LR_TV.x, LR_TV.y, 0.093]} castShadow>
        <boxGeometry args={[LR_TV.w + 0.016, LR_TV.h + 0.016, 0.045]} />
        <primitive object={M.tv} attach="material" />
      </mesh>
      {tvOn && (
        <mesh position={[LR_TV.x, LR_TV.y, 0.1165]}>
          <planeGeometry args={[LR_TV.w - 0.01, LR_TV.h - 0.01]} />
          <primitive object={screenMat} attach="material" />
        </mesh>
      )}

      {/* Soundbar, on the console rather than hung under the screen. */}
      <mesh position={[LR_TV.x, 0.655, 0.3]} castShadow>
        <boxGeometry args={[1.6, 0.075, 0.095]} />
        <primitive object={M.grille} attach="material" />
      </mesh>
      <mesh position={[LR_TV.x, 0.695, 0.3]}>
        <boxGeometry args={[1.6, 0.01, 0.095]} />
        <primitive object={M.brushed} attach="material" />
      </mesh>

      {/* Floorstanders. The cones move on the volume — a still speaker is a
          prop, and the requirement document asks for speaker animation by
          name. The excursion is exaggerated; the point is that it is alive. */}
      {LR_PLAN.speakers.map((sp, i) => (
        <group key={`spk-${i}`} position={[sp.x, 0, 0.34]}>
          {/* Brushed aluminium cabinet. Slimmer and taller than the box it
              replaces: a tower is a tower because of its proportion. */}
          <mesh position={[0, 0.76, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.22, 1.42, 0.26]} />
            <primitive object={M.brushed} attach="material" />
          </mesh>
          {/* Cloth down the front, with the drivers set into it. */}
          <mesh position={[0, 0.76, 0.129]}>
            <boxGeometry args={[0.15, 1.3, 0.006]} />
            <primitive object={M.grille} attach="material" />
          </mesh>
          <mesh position={[0, 0.04, 0]}>
            <boxGeometry args={[0.3, 0.025, 0.32]} />
            <primitive object={M.metal} attach="material" />
          </mesh>
          {[0.42, 0.82, 1.14, 1.34].map((y, j) => (
            <mesh
              key={`drv-${j}`}
              position={[0, y, 0.137 + audioLevel * (0.014 - j * 0.003)]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.075 - j * 0.015, 0.075 - j * 0.015, 0.014, 24]} />
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

/**
 * Pleated curtain geometry, cached by how far it is drawn.
 *
 * A curtain takes nine seconds to travel and the mesh is rebuilt on every
 * frame of it — eight panels, two layers, sixty times a second. Quantising the
 * gather to fiftieths makes the travel reuse fifty geometries instead of
 * building five hundred, and nobody can see a fiftieth of a curtain.
 */
const CURTAIN_CACHE = new Map<string, THREE.BufferGeometry>();

function curtainGeometry(gather: number, length: number, height: number) {
  const step = Math.round(gather * 50) / 50;
  const key = `${step}|${length.toFixed(3)}|${height.toFixed(3)}`;
  let geo = CURTAIN_CACHE.get(key);
  if (!geo) {
    geo = makeCurtainGeometry({
      length,
      height,
      // Deep, frequent pleats. Five shallow ones read as a shower curtain;
      // what says "lined drape" is the count and the depth of the folds.
      //
      // 90 mm rather than the den's 140: `makeCurtainGeometry` deepens the
      // folds by 3.6x as a panel gathers, so 140 becomes a half-metre bulge
      // when the curtain is open — which here sat right beside the camera and
      // swallowed the window it was supposed to be uncovering.
      folds: 10,
      foldDepth: 0.09,
      gather: step,
    });
    CURTAIN_CACHE.set(key, geo);
  }
  return geo;
}

function Glazing({
  sheer,
  blackout,
  daylight,
  view,
}: LivingCurtains & { daylight: number; view: THREE.Texture }) {
  const span = LR_WINDOW.z1 - LR_WINDOW.z0;
  const height = LR_WINDOW.y1 - LR_WINDOW.y0;
  const seg = span / PANELS;
  /**
   * Floor to pocket, not window to window.
   *
   * These ran the glazed opening exactly, so they hung six centimetres clear
   * of the floor and stopped half a metre below the ceiling — a blind's
   * proportions on a curtain's fabric. Hems touch the floor and the heading
   * disappears into the pocket, which is the whole look.
   */
  const drop = LR.h - LR.soffit.drop - 0.04;

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
      {/*
        The view, placed where the sightline actually goes.
 
        This was a 26 m plane seven metres beyond the glass, centred on the
        middle of the *room*. From a camera on the room's axis the line of
        sight through a window in the side wall leaves at a very shallow angle:
        measured, the rays through the visible part of the glazing land at
        z = -9 to -14, and the plane ended at z = -8. So the window showed
        nothing at all — not a dark city, no city, the plane was simply not
        there. A magenta test material returned zero pixels, which is how this
        was found rather than guessed at.
 
        It now sits 18 m out and 88 m wide, centred on where those rays go. The
        distance is also what sets the apparent size of the towers: close in,
        a 2048 px skyline reads as a painted backdrop a few metres away, which
        is the other half of why this never looked like a view.
      */}
      <mesh
        position={[LR.w + 18, -3.0, LR_WINDOW_CZ - 35]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[88, 44]} />
        <primitive object={viewMat} attach="material" />
      </mesh>

      <mesh
        position={[LR.w - 0.03, (LR_WINDOW.y0 + LR_WINDOW.y1) / 2, LR_WINDOW_CZ]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[span, height]} />
        <primitive object={M.glass} attach="material" />
      </mesh>

      {/* Sill and mullions. */}
      <mesh position={[LR.w - 0.04, LR_WINDOW.y0, LR_WINDOW_CZ]}>
        <boxGeometry args={[0.12, 0.12, span + 0.2]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      {[LR_WINDOW.z0, LR_WINDOW_CZ, LR_WINDOW.z1].map((z, i) => (
        <mesh
          key={`mull-${i}`}
          position={[LR.w - 0.04, (LR_WINDOW.y0 + LR_WINDOW.y1) / 2, z]}
        >
          <boxGeometry args={[0.09, height, 0.07]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}

      {/*
        A recessed pocket, not a rail on a bracket.

        Exposed track is the detail that says "curtains were added later". In
        joinery of this grade they run inside a plastered recess, and the
        curtain appears out of a dark slot in the ceiling. Three faces and a
        black lining is all it takes.
      */}
      <mesh position={[LR.w - 0.27, LR.h - LR.soffit.drop + 0.09, LR_WINDOW_CZ]}>
        <boxGeometry args={[0.3, 0.18, span + 0.5]} />
        <primitive object={M.soffit} attach="material" />
      </mesh>
      <mesh position={[LR.w - 0.27, LR.h - LR.soffit.drop - 0.005, LR_WINDOW_CZ]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.26, span + 0.46]} />
        <primitive object={M.pocket} attach="material" />
      </mesh>

      {layers.map((layer) => {
        const gather = 1 - Math.max(0, Math.min(1, layer.pos / 100));
        /**
         * Where a panel sits, which is not where it was being drawn.
         *
         * Each panel was pinned to its closed position and merely shrank in
         * place, so opening the curtains produced four separate bunches spread
         * evenly across the glass — the middle two standing in the middle of
         * the window with daylight either side of them. A curtain does not
         * dissolve where it stands; it travels to its end of the track and
         * stacks against the panel already there.
         *
         * So the anchor is interpolated too: closed, panels divide the track
         * between them; open, they are shouldered up against the jambs, two at
         * each end, in the 18% of the span that `makeCurtainGeometry` leaves a
         * fully gathered panel occupying.
         */
        const stack = (seg + PANEL_OVERLAP) * 0.18;
        return Array.from({ length: PANELS }, (_, i) => {
          const geo = curtainGeometry(gather, seg + PANEL_OVERLAP, drop);
          const toStart = i < PANELS / 2;
          const closed = toStart
            ? LR_WINDOW.z0 + i * seg - PANEL_OVERLAP / 2
            : LR_WINDOW.z0 + (i + 1) * seg + PANEL_OVERLAP / 2;
          const open = toStart
            ? LR_WINDOW.z0 + i * stack - PANEL_OVERLAP / 2
            : LR_WINDOW.z1 - (PANELS - 1 - i) * stack + PANEL_OVERLAP / 2;
          const z = closed + (open - closed) * gather;
          return (
            <mesh
              key={`${layer.key}-${i}`}
              geometry={geo}
              material={layer.mat}
              position={[layer.x, 0.01, z]}
              scale={[1, 1, toStart ? 1 : -1]}
              castShadow={layer.key === "blackout"}
            />
          );
        });
      })}

      {/*
        A balcony, with something standing on it.

        The glazing looked onto a photograph of a city six metres away and
        nothing in between, so the glass read as a lightbox. A ledge and two
        planters immediately outside give the eye something at a known distance
        to judge the skyline against — which is what turns a backdrop into a
        view. They are outside the room, so they take its light only at a
        grazing angle and sit in silhouette, exactly as they would at dusk.
      */}
      <mesh position={[LR.w + 0.75, LR_WINDOW.y0 - 0.02, LR_WINDOW_CZ]} receiveShadow>
        <boxGeometry args={[1.5, 0.08, span + 0.4]} />
        <primitive object={M.slab} attach="material" />
      </mesh>
      {/*
        A glass balustrade with a slim handrail, not a solid parapet.

        The first version was a metre of sheet metal standing directly in
        front of the glazing, which is a perfectly good way to build a balcony
        and a perfectly good way to delete the view: from a camera at eye
        height it blanked the entire lower half of the window. Glass is also
        simply what goes on a balcony of this grade.
      */}
      <mesh position={[LR.w + 1.46, LR_WINDOW.y0 + 0.52, LR_WINDOW_CZ]}>
        <boxGeometry args={[0.02, 1.0, span + 0.4]} />
        <primitive object={M.glass} attach="material" />
      </mesh>
      <mesh position={[LR.w + 1.46, LR_WINDOW.y0 + 1.04, LR_WINDOW_CZ]}>
        <boxGeometry args={[0.055, 0.045, span + 0.44]} />
        <primitive object={M.brushed} attach="material" />
      </mesh>
      {[LR_WINDOW_CZ - 2.7, LR_WINDOW_CZ, LR_WINDOW_CZ + 2.7].map((z, i) => (
        <mesh key={`post-${i}`} position={[LR.w + 1.46, LR_WINDOW.y0 + 0.52, z]}>
          <boxGeometry args={[0.05, 1.04, 0.05]} />
          <primitive object={M.brushed} attach="material" />
        </mesh>
      ))}
      {[LR_WINDOW_CZ - 2.2, LR_WINDOW_CZ + 2.1].map((z, i) => (
        <group key={`balc-${i}`} position={[LR.w + 0.9, LR_WINDOW.y0 + 0.02, z]}>
          <mesh position={[0, 0.32, 0]} castShadow>
            <boxGeometry args={[0.42, 0.64, 0.42]} />
            <primitive object={M.slab} attach="material" />
          </mesh>
          <group position={[0, 0.44, 0]}>
            <Foliage scale={i === 0 ? 1.15 : 0.95} />
          </group>
        </group>
      ))}

      {/* A faint bloom on the glass in daylight, so the window reads as
          brighter than the room rather than as a picture hung on the wall. */}
      {daylight > 0.02 && (
        <mesh
          position={[LR.w - 0.05, (LR_WINDOW.y0 + LR_WINDOW.y1) / 2, LR_WINDOW_CZ]}
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
    <group position={[4.5, 0, 4.92]} rotation={[0, 0.258, 0]}>
      {/* Rug, turned with the furniture standing on it. */}
      {/* Big enough for every front leg to stand on it.

          A rug that stops short of the furniture divides the zone instead of
          holding it together — the classic showroom-floor mistake. At 6.4 by
          5.2 the sofa, the chair, the pouf and the table are all on it, which
          is what makes the group read as one object seen from across a room. */}
      <mesh position={[0.25, 0.006, 0.1]} receiveShadow>
        <boxGeometry args={[6.4, 0.012, 5.2]} />
        <primitive object={M.rug} attach="material" />
      </mesh>

      {/* Sofa, facing +x across the group toward the media wall. Straight
          rather than an L: on the client's sheet the chaise end falls outside
          the frame, so a return would sit behind the camera and only cost
          frame space.

          Every upholstered part is a rounded box. A 4-6 cm radius is what real
          foam-and-fabric has, and sharp corners are the single strongest signal
          that something is a primitive rather than a sofa. */}
      <group position={[-1.75, 0, 0]}>
        <mesh position={[0, 0.05, 0]} receiveShadow>
          <boxGeometry args={[1.02, 0.1, 3.66]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
        <RoundedBox
          args={[1.15, 0.32, 3.8]}
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
          position={[-0.5, 0.6, 0]}
          rotation={[0, 0, 0.05]}
          castShadow
          receiveShadow
        >
          <primitive object={M.sofa} attach="material" />
        </RoundedBox>
        {[-1.26, 0, 1.26].map((z) => (
          <group key={`seat-${z}`}>
            <RoundedBox
              args={[1.0, 0.19, 1.18]}
              radius={0.075}
              smoothness={3}
              position={[0.08, 0.51, z]}
              castShadow
              receiveShadow
            >
              <primitive object={M.sofaSeat} attach="material" />
            </RoundedBox>
            <RoundedBox
              args={[0.2, 0.44, 1.16]}
              radius={0.08}
              smoothness={3}
              position={[-0.32, 0.72, z]}
              rotation={[0, 0, -0.14]}
              castShadow
            >
              <primitive object={M.sofaSeat} attach="material" />
            </RoundedBox>
          </group>
        ))}
        {/*
          Scatter cushions: three materials, three sizes, none square to
          anything.

          They were three identical olive squares at even spacing, which is how
          a furniture catalogue photographs a sofa and not how anyone has ever
          left one. Mixing the cloth is the whole trick — olive velvet against
          greige knit against one patterned — and the sizes differ because a
          real pile has a big one at the back leaning on the arm and a small one
          in front of it.
        */}
        {[
          { p: [-0.24, 0.8, -1.52], r: [0.18, 0.33, 0.28], s: 0.46, m: M.velvet },
          { p: [-0.18, 0.72, -1.18], r: [0.3, -0.2, -0.5], s: 0.38, m: M.knit },
          { p: [-0.24, 0.79, -0.6], r: [0.15, -0.3, -0.24], s: 0.44, m: M.knit },
          { p: [-0.24, 0.81, 1.06], r: [0.17, 0.27, 0.22], s: 0.47, m: M.velvet },
          { p: [-0.17, 0.71, 1.4], r: [0.34, 0.22, 0.46], s: 0.36, m: M.cushion },
        ].map((c, i) => (
          <RoundedBox
            key={`cu-${i}`}
            args={[c.s, c.s, 0.15]}
            radius={0.07}
            smoothness={3}
            position={c.p as [number, number, number]}
            rotation={c.r as [number, number, number]}
            castShadow
          >
            <primitive object={c.m} attach="material" />
          </RoundedBox>
        ))}
      </group>

      {/* Round marble coffee table, square to the group and centred on the
          sofa's middle seat. */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.6, 0.6, 0.09, 64]} />
          <primitive object={M.marble} attach="material" />
        </mesh>
        <mesh position={[0, 0.17, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.38, 0.34, 48]} />
          <primitive object={M.marble} attach="material" />
        </mesh>
        {/*
          Styled, rather than decorated.

          A coffee table with one object on it reads as a table with something
          left on it. Three groups at different heights — tall vase, flat tray,
          low stack — is what a stylist actually does, and the height difference
          is the part that matters: it gives the accent lighting something to
          cast a shadow with.
        */}
        <group position={[0.2, 0.405, 0.1]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.055, 0.075, 0.2, 20]} />
            <primitive object={M.marble} attach="material" />
          </mesh>
          {[0, 1, 2, 3, 4].map((j) => {
            const a = j * 1.4;
            return (
              <group key={`stem-${j}`} rotation={[0, a, 0.12 + (j % 3) * 0.07]}>
                <mesh position={[0, 0.17, 0]} castShadow>
                  <cylinderGeometry args={[0.004, 0.005, 0.22, 10]} />
                  <primitive object={M.foliageDark} attach="material" />
                </mesh>
                <mesh position={[0, 0.28, 0]} scale={[1, 0.8, 1]} castShadow>
                  <sphereGeometry args={[0.03, 20, 8]} />
                  <primitive object={M.bloom} attach="material" />
                </mesh>
              </group>
            );
          })}
        </group>
        {/* Brass tray with a candle on it. */}
        <group position={[-0.24, 0.425, -0.14]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.19, 0.19, 0.022, 32]} />
            <primitive object={M.brass} attach="material" />
          </mesh>
          <mesh position={[0.05, 0.07, 0.02]} castShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.11, 20]} />
            <primitive object={M.pot} attach="material" />
          </mesh>
        </group>
        {/* Two books, offset — a stack is never square. */}
        <mesh position={[-0.1, 0.42, 0.3]} rotation={[0, 0.2, 0]} castShadow>
          <boxGeometry args={[0.3, 0.035, 0.22]} />
          <primitive object={M.consoleWood} attach="material" />
        </mesh>
        <mesh position={[-0.08, 0.452, 0.31]} rotation={[0, 0.05, 0]} castShadow>
          <boxGeometry args={[0.27, 0.03, 0.2]} />
          <primitive object={M.slab} attach="material" />
        </mesh>
      </group>

      {/**
       * One round pouf, where there were two square ottomans.
       *
       * Two of anything identical on a line reads as a showroom pair rather
       * than as something somebody put there, and square upholstery beside a
       * round table fights it. A single drum in olive velvet does the job both
       * were doing and leaves the floor its space back — which is most of what
       * "premium" means in a room this size.
       */}
      <group position={[1.45, 0, 0.1]}>
        <mesh position={[0, 0.21, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.42, 0.44, 0.42, 48]} />
          <primitive object={M.velvet} attach="material" />
        </mesh>
        {/* A seam round the crown, so it reads as upholstery not a drum. */}
        <mesh position={[0, 0.415, 0]} castShadow>
          <cylinderGeometry args={[0.395, 0.42, 0.05, 48]} />
          <primitive object={M.velvet} attach="material" />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.36, 0.36, 0.04, 48]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      </group>

      {/* Curved armchair in the same olive velvet as the pouf, turned back toward
          the sofa so the group closes. */}
      <group position={[2.45, 0, 1.4]} rotation={[0, -2.6, 0]}>
        <RoundedBox
          args={[0.8, 0.2, 0.76]}
          radius={0.075}
          smoothness={3}
          position={[0, 0.43, 0.02]}
          castShadow
          receiveShadow
        >
          <primitive object={M.velvet} attach="material" />
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
          <primitive object={M.velvet} attach="material" />
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
            <primitive object={M.velvet} attach="material" />
          </RoundedBox>
        ))}
        <mesh position={[0, 0.17, 0]} castShadow>
          <cylinderGeometry args={[0.19, 0.26, 0.32, 32]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      </group>

      {/* Side table beside the armchair.

          A chair with nowhere to put a cup is a chair nobody sits in, and the
          eye knows it even when it cannot say why. Marble top on a slim brass
          stem, with a book and a candle, so the chair reads as occupied. */}
      <group position={[2.5, 0, 0.42]}>
        <mesh position={[0, 0.54, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.24, 0.24, 0.045, 48]} />
          <primitive object={M.marble} attach="material" />
        </mesh>
        <mesh position={[0, 0.28, 0]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, 0.48, 12]} />
          <primitive object={M.brass} attach="material" />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.17, 0.19, 0.03, 32]} />
          <primitive object={M.brass} attach="material" />
        </mesh>
        <mesh position={[-0.04, 0.578, 0.03]} rotation={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[0.22, 0.03, 0.16]} />
          <primitive object={M.slab} attach="material" />
        </mesh>
        <mesh position={[0.09, 0.625, -0.04]} castShadow>
          <cylinderGeometry args={[0.038, 0.038, 0.11, 20]} />
          <primitive object={M.pot} attach="material" />
        </mesh>
      </group>
    </group>
  );
}

/** Dining zone, console and plants — everything outside the seating group. */
function RoomFurniture() {
  return (
    <group>
      {/* Dining zone, beyond the opening rather than inside the living room.
          That is the arrangement on the sheet — the second zone is through the
          gap, not squeezed in beside the sofa — and it is what tells the eye
          the plan carries on. Round, because the bay is not wide enough for a
          rectangular table with chairs down both sides. */}
      <group position={[LR_PLAN.dining.x, 0, LR_PLAN.dining.z]}>
        <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.62, 0.62, 0.06, 64]} />
          <primitive object={M.consoleWood} attach="material" />
        </mesh>
        <mesh position={[0, 0.36, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.14, 0.72, 32]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.36, 0.4, 0.04, 48]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
        {[0, 1, 2, 3].map((i) => {
          const a = (i * Math.PI) / 2 + Math.PI / 4;
          return (
            <group
              key={`dch-${i}`}
              position={[Math.sin(a) * 0.86, 0, Math.cos(a) * 0.86]}
              rotation={[0, a + Math.PI, 0]}
            >
              <RoundedBox
                args={[0.42, 0.08, 0.42]}
                radius={0.03}
                smoothness={3}
                position={[0, 0.45, 0]}
                castShadow
                receiveShadow
              >
                <primitive object={M.cushion} attach="material" />
              </RoundedBox>
              <RoundedBox
                args={[0.42, 0.46, 0.08]}
                radius={0.03}
                smoothness={3}
                position={[0, 0.68, 0.18]}
                rotation={[0.12, 0, 0]}
                castShadow
              >
                <primitive object={M.cushion} attach="material" />
              </RoundedBox>
              {[-0.16, 0.16].map((lx) =>
                [-0.16, 0.16].map((lz) => (
                  <mesh key={`l-${lx}-${lz}`} position={[lx, 0.22, lz]}>
                    <boxGeometry args={[0.035, 0.44, 0.035]} />
                    <primitive object={M.metal} attach="material" />
                  </mesh>
                )),
              )}
            </group>
          );
        })}
        <mesh position={[0, 0.84, 0]} castShadow>
          <cylinderGeometry args={[0.12, 0.09, 0.14, 32]} />
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
            <cylinderGeometry args={[0.2, 0.15, 0.32, 48]} />
            <primitive object={M.pot} attach="material" />
          </mesh>
          <Foliage scale={1.2} />
        </group>
      ))}
    </group>
  );
}

/**
 * The opening in the media wall, and the passage it leads to.
 *
 * Built as a real volume rather than a dark rectangle: floor, two side walls, a
 * lower ceiling and a return at the end, with its own warm light. A painted-on
 * "doorway" reads as a poster of a doorway the moment the camera has any angle
 * on it, and from here it has plenty.
 *
 * The passage turns at its end rather than running to a flat back wall, so the
 * eye is told the plan continues instead of being shown where it stops.
 */
/**
 * How bright the room next door is, 0..1.
 *
 * The passage carried a fixed point light, so in Movie — the whole room down
 * to six per cent — the open doorway was the brightest thing in the frame
 * after the television, and the eye went to it instead of the screen. A hall
 * does not switch itself off when you start a film, but a house running
 * scenes does take it down, and leaving it blazing undoes the scene.
 */
function Passage({ level }: { level: number }) {
  const o = LR_PLAN.opening;
  const w = o.x1 - o.x0;
  const cx = (o.x0 + o.x1) / 2;
  const ceil = o.head + 0.06;

  return (
    <group>
      {/* Reveal around the opening: head and both jambs. */}
      <mesh position={[cx, (o.head + LR.h - LR.soffit.drop) / 2, 0.01]} receiveShadow>
        <planeGeometry args={[w, LR.h - LR.soffit.drop - o.head]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      {[o.x0, o.x1].map((x, i) => (
        <mesh
          key={`jamb-${i}`}
          position={[x, o.head / 2, -0.14]}
          rotation={[0, i === 0 ? Math.PI / 2 : -Math.PI / 2, 0]}
          receiveShadow
        >
          <planeGeometry args={[0.3, o.head]} />
          <primitive object={M.wall} attach="material" />
        </mesh>
      ))}

      {/* The passage. */}
      <mesh position={[cx, 0, -o.depth / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, o.depth]} />
        <primitive object={M.floor} attach="material" />
      </mesh>
      <mesh position={[cx, ceil, -o.depth / 2]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, o.depth]} />
        <primitive object={M.ceiling} attach="material" />
      </mesh>
      <mesh
        position={[o.x0, ceil / 2, -o.depth / 2]}
        rotation={[0, Math.PI / 2, 0]}
        receiveShadow
      >
        <planeGeometry args={[o.depth, ceil]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      {/* Right-hand side stops short, so the passage turns rather than ending
          in a wall you can read the end of. */}
      <mesh
        position={[o.x1, ceil / 2, -o.depth / 2 + 0.55]}
        rotation={[0, -Math.PI / 2, 0]}
        receiveShadow
      >
        <planeGeometry args={[o.depth - 1.1, ceil]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      <mesh position={[cx + 0.35, ceil / 2, -o.depth]} receiveShadow>
        <planeGeometry args={[w + 0.7, ceil]} />
        <primitive object={M.wall} attach="material" />
      </mesh>

      {/* A sideboard against the far side of the bay. */}
      <mesh position={[o.x0 + 0.3, 0.4, -o.depth + 0.32]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.8, 0.5]} />
        <primitive object={M.consoleWood} attach="material" />
      </mesh>

      {/* Its own light, warm and low. Somewhere beyond that is lit is what
          makes the plan feel like it continues; a dark hole reads as a cupboard. */}
      <pointLight
        position={[cx, ceil - 0.35, -o.depth + 1.1]}
        intensity={0.5 + 3.0 * level}
        distance={5.5}
        decay={1.8}
        color={new THREE.Color("#ffd9a8")}
      />
      <mesh position={[cx, ceil - 0.02, -o.depth + 1.1]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.07, 20]} />
        <meshStandardMaterial
          color="#000000"
          emissive={new THREE.Color("#ffd9a8")}
          emissiveIntensity={0.7 + 3.6 * level}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/**
 * The long left wall.
 *
 * It was a bare plaster plane, which is what made the room read as a hall
 * rather than a living room — a big blank face with nothing on it and no edge
 * to stop the eye. The sheet closes that side with a panelled wall, a large
 * relief artwork and tall planting, so this does too.
 */
function FeatureWallLeft() {
  const a = LR_PLAN.art;
  const art = useMemo(() => makeArtTexture(), []);
  const artMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({ map: art, roughness: 0.82, metalness: 0 }),
    [art],
  );

  return (
    <group>
      {/* Shallow vertical panelling across the wall, so it catches the cove
          wash in bands instead of returning one flat value. */}
      {Array.from({ length: 11 }, (_, i) => (
        <mesh key={`rev-${i}`} position={[0.012, (LR.h - LR.soffit.drop) / 2, 0.7 + i * 0.86]}>
          <boxGeometry args={[0.024, LR.h - LR.soffit.drop, 0.02]} />
          <primitive object={M.slatBack} attach="material" />
        </mesh>
      ))}

      {/* Frame, mount and canvas. */}
      <mesh position={[0.03, a.y, a.z]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[a.w + 0.12, a.h + 0.12]} />
        <primitive object={M.consoleWood} attach="material" />
      </mesh>
      <mesh position={[0.05, a.y, a.z]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[a.w, a.h]} />
        <primitive object={artMat} attach="material" />
      </mesh>

      {/*
        Picture light over the frame.

        The accent channel already aims two heads at this canvas from the
        soffit, which lights it correctly — but a lit painting with no visible
        source reads as a painting that happens to be bright. The fitting is
        the thing that explains the light, and the shade also stops the lamp
        itself being a glare source from the sofa.
      */}
      <group position={[0.33, a.y + a.h / 2 + 0.2, a.z]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, a.w * 0.52, 20, 1, false, 0, Math.PI]} />
          <primitive object={M.brass} attach="material" />
        </mesh>
        <mesh position={[-0.14, -0.1, 0]} rotation={[0, 0, 0.5]}>
          <cylinderGeometry args={[0.012, 0.012, 0.3, 10]} />
          <primitive object={M.brass} attach="material" />
        </mesh>
      </group>

      {/* Low console beneath it. */}
      <mesh position={[0.28, 0.24, a.z]} castShadow receiveShadow>
        <boxGeometry args={[0.52, 0.36, 2.4]} />
        <primitive object={M.consoleWood} attach="material" />
      </mesh>
      {[-0.7, 0.7].map((dz) => (
        <mesh key={`cd-${dz}`} position={[0.545, 0.24, a.z + dz]}>
          <boxGeometry args={[0.02, 0.28, 1.1]} />
          <primitive object={M.consoleBody} attach="material" />
        </mesh>
      ))}
      {/* A vase and a stack of books, so the console is not a bare plinth. */}
      <mesh position={[0.28, 0.58, a.z - 0.75]} castShadow>
        <cylinderGeometry args={[0.1, 0.13, 0.32, 32]} />
        <primitive object={M.pot} attach="material" />
      </mesh>
      <mesh position={[0.28, 0.46, a.z + 0.72]} castShadow>
        <boxGeometry args={[0.3, 0.08, 0.24]} />
        <primitive object={M.marble} attach="material" />
      </mesh>

      {/* Tall planting either side, as the sheet uses to close the corner. */}
      {[a.z - 1.95, a.z + 2.05].map((z, i) => (
        <group key={`tall-${i}`} position={[0.45, 0, z]}>
          <mesh position={[0, 0.24, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.24, 0.19, 0.48, 48]} />
            <primitive object={M.pot} attach="material" />
          </mesh>
          <Foliage scale={i === 0 ? 1.45 : 1.25} />
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
      {/*
        A cassette, rather than a rectangle drawn on the ceiling.

        It was two flat planes and a pair of flaps. What a real recessed unit
        actually shows from below is a shallow white bezel standing a centimetre
        proud of the plasterboard, a dark return inside it, and a grille of fine
        fins over the intake in the middle — the bezel's own shadow line is most
        of what makes it read as a thing set into a ceiling rather than a
        texture painted on one.
      */}
      <mesh position={[0, y - 0.006, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.022, 0.62]} />
        <primitive object={M.soffit} attach="material" />
      </mesh>
      <mesh position={[0, y - 0.024, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.3, 0.44]} />
        <primitive object={M.slatBack} attach="material" />
      </mesh>
      {/* Intake grille: fine fins over the centre panel. */}
      {Array.from({ length: 15 }, (_, i) => (
        <mesh key={`grille-${i}`} position={[-0.42 + i * 0.06, y - 0.03, 0]}>
          <boxGeometry args={[0.022, 0.006, 0.3]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
      {/*
        Status light.

        Every cassette on the market has one, and here it does a second job:
        the AC is the one device in the room whose state is otherwise invisible
        in a still frame. Green when it is running, dark when it is not.
      */}
      <mesh position={[0.6, y - 0.03, 0.22]}>
        <circleGeometry args={[0.018, 12]} />
        <meshStandardMaterial
          color="#0d1a12"
          emissive={new THREE.Color(on ? "#4ade80" : "#101010")}
          emissiveIntensity={on ? 1.6 : 0}
          toneMapped={false}
        />
      </mesh>
      {[-0.19, 0.19].map((dz, i) => (
        <mesh
          key={`louvre-${i}`}
          position={[0, y - 0.03, dz]}
          rotation={[i === 0 ? tilt : -tilt, 0, 0]}
          castShadow
        >
          <boxGeometry args={[1.28, 0.012, 0.15]} />
          <primitive object={M.soffit} attach="material" />
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
  const { x, z, ceiling } = LR_PLAN.pendants;
  return (
    <group>
      <mesh position={[x, ceiling - 0.015, z]}>
        <cylinderGeometry args={[0.17, 0.17, 0.03, 32]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      {LR_PENDANT_GLOBES.map((g, i) => (
        <mesh key={`cord-${i}`} position={[x + g.dx, (ceiling + g.y + g.r) / 2, z + g.dz]}>
          <cylinderGeometry args={[0.004, 0.004, ceiling - g.y - g.r, 10]} />
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
        <cylinderGeometry args={[0.085, 0.065, 0.05, 32]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      {/*
        A designer fan, not a utility one.

        The blades were 150 mm wide planks in mid-brown timber on a 360 mm arm —
        a ceiling fan from a government office, and the single most agricultural
        object left in the frame. A current architectural fan is three long,
        narrow, nearly-black blades on a slim machined hub: the span goes up,
        the chord comes down, and the whole thing stops announcing itself.

        Each blade is a shallow aerofoil rather than a flat board — a root
        section and a thinner tip at a slightly greater pitch, which is both
        what a real blade does and what gives the edge a highlight to run along
        as it turns.
      */}
      <group ref={blades} name="lr-fan-blades" position={[0, y, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.1, 0.075, 0.07, 32]} />
          <primitive object={M.slab} attach="material" />
        </mesh>
        <mesh position={[0, -0.045, 0]} castShadow>
          <cylinderGeometry args={[0.055, 0.045, 0.03, 24]} />
          <primitive object={M.brushed} attach="material" />
        </mesh>
        {[0, 1, 2].map((i) => (
          <group key={`bl-${i}`} rotation={[0, (i * Math.PI * 2) / 3, 0]}>
            <mesh position={[0.26, 0.004, 0]} rotation={[0.1, 0, 0]} castShadow>
              <boxGeometry args={[0.34, 0.016, 0.105]} />
              <primitive object={M.fanBlade} attach="material" />
            </mesh>
            <mesh position={[0.62, 0.014, 0]} rotation={[0.17, 0, 0]} castShadow>
              <boxGeometry args={[0.42, 0.011, 0.085]} />
              <primitive object={M.fanBlade} attach="material" />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/**
 * Maps applied to the shared materials, once, on mount.
 *
 * Canvas textures cannot be built at module scope — the materials object is
 * evaluated during the server render, where there is no `document`. So the
 * materials are declared bare and the maps are written onto them here, which
 * also keeps every mesh using a given material on one shader program.
 */
function Surfaces() {
  useLayoutEffect(() => {
    // Three physical scales off one weave: a tight chenille on the sofa, a
    // coarser loop on the cushions, and the finest on velvet, where the pile
    // is short enough that it mostly just takes the shine off.
    const fine = makeFabricNormal(6, 0.45, 1777);
    const coarse = makeFabricNormal(11, 0.8, 4021);

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

    apply(M.sofa, fine, 7, 0.65);
    apply(M.sofaSeat, fine, 7, 0.6);
    apply(M.cushion, coarse, 3, 0.9);
    apply(M.knit, coarse, 2.4, 1.15);
    apply(M.velvet, fine, 9, 0.3);

    // Pale wool, lightly mottled, tiled twice across so the blotches read as
    // pile rather than as spills. Full contrast on a six-metre rug put the
    // darkest thing in the room on the floor in the middle of the frame.
    const rug = makeRugTexture(8821, "#bdb4a4", 0.42);
    rug.repeat.set(2.2, 1.8);
    rug.wrapS = THREE.RepeatWrapping;
    rug.wrapT = THREE.RepeatWrapping;
    M.rug.map = rug;
    M.rug.color.set("#ffffff");
    M.rug.needsUpdate = true;
  }, []);
  return null;
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
  houseLevel = 1,
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
  /** 0..1 how lit the room's own general layers are; the hall follows it. */
  houseLevel?: number;
}) {
  return (
    <group>
      <Surfaces />
      <Shell />
      <SlatPanel x0={LR_PLAN.slats.x0} x1={LR_PLAN.slats.x1} niche />
      <SlatPanel x0={LR_PLAN.slatsRight.x0} x1={LR_PLAN.slatsRight.x1} />
      <Passage level={houseLevel} />
      <FeatureWallLeft />
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
