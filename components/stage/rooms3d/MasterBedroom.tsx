"use client";

/**
 * Master Bedroom — geometry only.
 *
 * Deliberately carries no lights and no device state. Geometry is stable; the
 * lighting rig is what reads the simulation and changes 60 times a second, so
 * keeping them apart means a dimmer move re-renders a handful of light objects
 * instead of rebuilding a room's worth of meshes.
 *
 * Built to Section 4 of the requirement document, which asks for general, cove,
 * bedside, reading, wardrobe and night/path lighting in one room. Every one of
 * those needs somewhere to live, so the furniture here is not decoration — the
 * nightstands, the glass wardrobe and the bed base are the fixtures' hosts.
 *
 * Coordinates in metres:
 *   z = 0      headboard wall — wardrobe run, then slats and the bed
 *   x = ROOM.w glazing wall with the dual-track curtains
 *   z = ROOM.d behind the camera
 *
 * Left and right are named as the camera sees them (low x = left), not as
 * someone lying in the bed would. The presenter is looking at the screen.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { COVE_Y, PALETTE, ROOM, materials } from "./materials";
import { makeCurtainGeometry, makeCityTexture } from "./geometry";
import { applySet, useTextureSet } from "./pbr";
import { MAX_BLADE_STEP_RAD } from "@/lib/sim/fan";

/* ------------------------------------------------------------------ */
/* Plan                                                                */
/* ------------------------------------------------------------------ */

/**
 * The room's plan, in one place.
 *
 * Both this file and the light rig position things against these numbers, and
 * a reading light that misses its pillow by 15cm is the kind of error that is
 * obvious in a render and invisible in a diff.
 */
export const PLAN = {
  /** Wardrobe run along the headboard wall, left of the bed. */
  wardrobe: { x0: 0.0, x1: 2.95, depth: 0.62, height: 2.62 },
  /** Bed centreline and the head of the mattress. */
  bed: { x: 4.85, headZ: 0.22, width: 1.9, length: 2.12 },
  /** Nightstand centres, both at the same depth. */
  nightstand: { left: 3.42, right: 6.28, z: 0.62, top: 0.52 },
  /**
   * Articulated reading lights.
   *
   * Above the headboard and just outboard of each pillow, not above the
   * nightstands. Mounted over the nightstand the arm has to reach more than a
   * metre sideways to land on a pillow, and the beam crosses the lamp on the
   * way — which is exactly the mistake the first pass made.
   */
  /**
   * Wall sconces, moved out over the nightstands.
   *
   * They used to sit at 3.98 and 5.72, which is inboard of the headboard's
   * edges — so each one was mounted *on* the panel and broke the one surface
   * the headboard is supposed to be. Out here they flank it instead, and the
   * arms still swing in far enough to put a pool on the pillow rather than on
   * the wall, which was the original reason for keeping them close.
   */
  reading: { left: 3.42, right: 6.28, y: 1.5, z: 0.1 },
  /** Ceiling fan hub. */
  fan: { x: 4.6, z: 2.85, y: 2.56 },
  /** Bench at the foot of the bed. */
  bench: { x: 4.85, z: 2.72 },
  /** Armchair and side table by the glazing. */
  armchair: { x: 6.05, z: 4.15 },
} as const;

/* ------------------------------------------------------------------ */
/* Timber slat wall                                                    */
/* ------------------------------------------------------------------ */

const SLAT = { w: 0.055, d: 0.02, gap: 0.024, top: ROOM.h - 0.2 };
/** The slats start where the wardrobe run ends. */
const SLAT_X0 = PLAN.wardrobe.x1 + 0.06;

/**
 * The room's signature surface, as an instanced mesh.
 *
 * Roughly seventy real boxes rather than a normal-mapped plane, because the
 * slats need to self-shadow and catch the cove wash edge-on — that grazing
 * highlight down one side of every slat is most of why the reference room looks
 * expensive, and a normal map does not reproduce it under a light this oblique.
 * Instancing makes the cost of doing it properly negligible.
 */
function SlatWall() {
  const ref = useRef<THREE.InstancedMesh>(null);

  const { count, pitch, span } = useMemo(() => {
    const p = SLAT.w + SLAT.gap;
    const s = ROOM.w - SLAT_X0;
    return { count: Math.floor(s / p), pitch: p, span: s };
  }, []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;

    const m = new THREE.Matrix4();
    const colour = new THREE.Color();
    const a = new THREE.Color(PALETTE.woodSlat);
    const b = new THREE.Color(PALETTE.woodSlatAlt);

    for (let i = 0; i < count; i++) {
      m.makeTranslation(SLAT_X0 + SLAT.w / 2 + i * pitch, SLAT.top / 2, SLAT.d / 2);
      mesh.setMatrixAt(i, m);

      // Slight per-slat variation so the wall reads as timber rather than as a
      // repeated extrusion. Deterministic, so it never shimmers between frames.
      const t = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
      colour.copy(a).lerp(b, t).multiplyScalar(0.92 + t * 0.15);
      mesh.setColorAt(i, colour);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [count, pitch]);

  return (
    <group>
      {/* Dark recess behind the slats, so the gaps read as shadow. */}
      <mesh position={[SLAT_X0 + span / 2, ROOM.h / 2, 0.003]} receiveShadow>
        <planeGeometry args={[span, ROOM.h]} />
        <primitive object={materials.woodBack} attach="material" />
      </mesh>
      <instancedMesh
        ref={ref}
        args={[undefined, undefined, count]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[SLAT.w, SLAT.top, SLAT.d]} />
        <meshStandardMaterial color="#ffffff" roughness={0.52} metalness={0} />
      </instancedMesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

function Shell() {
  const { w, d, h, soffit } = ROOM;
  const soffitY = h - soffit.drop / 2;

  /**
   * Tile joints, drawn as thin dark strips on top of the floor.
   *
   * 1.2 m large-format tile. Without the joints the floor is one enormous
   * untextured plane and the eye has nothing to judge the room's size by —
   * which is exactly the scale cue an architect is looking for.
   */
  const joints = useMemo(() => {
    const out: { pos: [number, number, number]; size: [number, number] }[] = [];
    const tile = 1.2;
    for (let x = tile; x < w; x += tile) {
      out.push({ pos: [x, 0.001, d / 2], size: [0.012, d] });
    }
    for (let z = tile; z < d; z += tile) {
      out.push({ pos: [w / 2, 0.001, z], size: [w, 0.012] });
    }
    return out;
  }, [w, d]);

  return (
    <group>
      {/* Floor */}
      <mesh position={[w / 2, 0, d / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <primitive object={materials.floor} attach="material" />
      </mesh>
      {joints.map((j, i) => (
        <mesh key={`joint-${i}`} position={j.pos} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={j.size} />
          <meshStandardMaterial
            color={PALETTE.floorGrout}
            roughness={0.85}
            metalness={0}
          />
        </mesh>
      ))}

      {/* Ceiling */}
      <mesh position={[w / 2, h, d / 2]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <primitive object={materials.ceiling} attach="material" />
      </mesh>

      {/* Left wall, and the wall behind the camera. */}
      <mesh position={[0, h / 2, d / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <primitive object={materials.plaster} attach="material" />
      </mesh>
      <mesh position={[w / 2, h / 2, d]} rotation={[0, Math.PI, 0]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <primitive object={materials.plaster} attach="material" />
      </mesh>

      {/* Perimeter soffit. The cove sits on top of this and washes the ceiling,
          which is what produces the soft warm ceiling in the reference. */}
      {[
        { pos: [w / 2, soffitY, soffit.depth / 2], size: [w, soffit.drop, soffit.depth] },
        {
          pos: [w - soffit.depth / 2, soffitY, d / 2],
          size: [soffit.depth, soffit.drop, d],
        },
        {
          pos: [w / 2, soffitY, d - soffit.depth / 2],
          size: [w, soffit.drop, soffit.depth],
        },
        { pos: [soffit.depth / 2, soffitY, d / 2], size: [soffit.depth, soffit.drop, d] },
      ].map((s, i) => (
        <mesh
          key={`soffit-${i}`}
          position={s.pos as [number, number, number]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={s.size as [number, number, number]} />
          <primitive object={materials.soffit} attach="material" />
        </mesh>
      ))}

      {/* Skirting. Cheap, and its absence is one of those things nobody can
          name but everybody registers as "this is a 3D model". */}
      {[
        { pos: [w / 2, 0.05, 0.012], size: [w, 0.1, 0.024] },
        { pos: [0.012, 0.05, d / 2], size: [0.024, 0.1, d] },
      ].map((s, i) => (
        <mesh key={`skirt-${i}`} position={s.pos as [number, number, number]}>
          <boxGeometry args={s.size as [number, number, number]} />
          <primitive object={materials.wardrobeCarcass} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Wardrobe                                                            */
/* ------------------------------------------------------------------ */

/**
 * Glass-fronted wardrobe with lit interior shelving.
 *
 * The shelves and the hanging rail are modelled rather than faked, because the
 * whole value of wardrobe lighting is what it reveals: with the strips off this
 * is a dark reflective slab, and with them on you see into it. Nothing to see
 * inside would make the demo's most quotable moment do nothing.
 */
function Wardrobe() {
  const { x0, x1, depth, height } = PLAN.wardrobe;
  const w = x1 - x0;
  const bays = 3;
  const bayW = w / bays;

  return (
    <group>
      {/* Carcass: back, top, base and the vertical dividers. */}
      <mesh position={[x0 + w / 2, height / 2, 0.02]} receiveShadow>
        <boxGeometry args={[w, height, 0.04]} />
        <primitive object={materials.wardrobeBack} attach="material" />
      </mesh>
      <mesh position={[x0 + w / 2, height - 0.03, depth / 2]} castShadow>
        <boxGeometry args={[w, 0.06, depth]} />
        <primitive object={materials.wardrobeCarcass} attach="material" />
      </mesh>
      <mesh position={[x0 + w / 2, 0.06, depth / 2]} receiveShadow>
        <boxGeometry args={[w, 0.12, depth]} />
        <primitive object={materials.wardrobeCarcass} attach="material" />
      </mesh>
      {Array.from({ length: bays + 1 }, (_, i) => (
        <mesh
          key={`div-${i}`}
          position={[x0 + i * bayW, height / 2, depth / 2]}
          castShadow
        >
          <boxGeometry args={[0.035, height, depth]} />
          <primitive object={materials.wardrobeCarcass} attach="material" />
        </mesh>
      ))}

      {/* Contents: a hanging rail with garments in the outer bays, shelves in
          the middle one. Blocks, but blocks of varied width and colour, which
          at this distance is all a wardrobe interior is. */}
      {Array.from({ length: bays }, (_, bay) => {
        const cx = x0 + bay * bayW + bayW / 2;
        if (bay === 1) {
          return (
            <group key={`bay-${bay}`}>
              {[0.55, 1.0, 1.45, 1.9].map((y, i) => (
                <mesh key={`shelf-${i}`} position={[cx, y, depth / 2]} receiveShadow>
                  <boxGeometry args={[bayW - 0.05, 0.022, depth - 0.07]} />
                  <primitive object={materials.wardrobeCarcass} attach="material" />
                </mesh>
              ))}
              {/* Folded stacks. */}
              {[0.62, 1.07, 1.52].map((y, i) => (
                <mesh key={`stack-${i}`} position={[cx, y, depth / 2]} castShadow>
                  <boxGeometry args={[bayW - 0.22, 0.1, depth - 0.2]} />
                  <meshStandardMaterial
                    color={["#cfc6b6", "#9aa3ab", "#bfa88c"][i]}
                    roughness={0.9}
                  />
                </mesh>
              ))}
            </group>
          );
        }
        const rail = 1.92;
        return (
          <group key={`bay-${bay}`}>
            <mesh
              position={[cx, rail, depth / 2]}
              rotation={[0, 0, Math.PI / 2]}
              castShadow
            >
              <cylinderGeometry args={[0.012, 0.012, bayW - 0.06, 10]} />
              <primitive object={materials.brass} attach="material" />
            </mesh>
            {Array.from({ length: 7 }, (_, i) => {
              const gx = cx - bayW / 2 + 0.08 + i * ((bayW - 0.16) / 6);
              // Deterministic variation — a wardrobe of identical garments
              // reads as a texture, not as clothes.
              const t = ((Math.sin(bay * 31.7 + i * 12.9898) * 43758.5453) % 1 + 1) % 1;
              const len = 0.72 + t * 0.42;
              return (
                <mesh
                  key={`garment-${i}`}
                  position={[gx, rail - 0.04 - len / 2, depth / 2]}
                  castShadow
                >
                  <boxGeometry args={[0.055, len, depth - 0.24]} />
                  <meshStandardMaterial
                    color={
                      ["#4a4e55", "#8a7f6e", "#2f333a", "#b8ac97", "#5d5446"][
                        Math.floor(t * 5)
                      ]
                    }
                    roughness={0.92}
                  />
                </mesh>
              );
            })}
          </group>
        );
      })}

      {/* Glass fronts, one sliding panel per bay, set forward of the carcass. */}
      {Array.from({ length: bays }, (_, bay) => (
        <mesh
          key={`glass-${bay}`}
          position={[x0 + bay * bayW + bayW / 2, height / 2, depth - 0.015]}
        >
          <planeGeometry args={[bayW - 0.05, height - 0.14]} />
          <primitive object={materials.wardrobeGlass} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Bed                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Headboard geometry, shared by the bed and the rig.
 *
 * One panel, and that is the whole specification. An earlier version ran lower
 * wings on behind both nightstands with a second brass trim, which is a real
 * detail and was the wrong one here: three upholstered planes at two heights
 * plus two trims is a composition, and what this bed needed was a surface.
 *
 * The wash light behind it reads these numbers too — body and light live in
 * different modules, and the only thing keeping them honest is that both come
 * from here.
 */
export const HEADBOARD = {
  /**
   * Centre of the panel, in front of the slat wall.
   *
   * The slats occupy z 0 to 0.02, so this leaves a 65 mm reveal behind the
   * upholstery — enough for the concealed strip to actually be concealed in,
   * and enough that the gap itself reads. Dark when the strip is off, a line
   * of light when it is on; either way the panel stands off the wall instead
   * of being glued to it.
   */
  z: PLAN.bed.headZ - 0.075,
  /** Where the hidden strip sits: 15 mm off the slat faces, grazing up them. */
  stripZ: 0.035,
  depth: 0.12,
  w: PLAN.bed.width + 0.4,
  h: 1.2,
  /** Wide and shallow. Six, not thirteen. */
  channels: 6,
} as const;

function Bed() {
  const { x, headZ, width, length } = PLAN.bed;
  const midZ = headZ + length / 2;
  const H = HEADBOARD;

  /** Plinth 0.10, platform to 0.32, mattress to 0.62. One tier, not three. */
  const PLATFORM_TOP = 0.32;
  const SLEEP = 0.62;

  const duvetZ0 = headZ + 0.62;
  const duvetZ1 = headZ + length + 0.06;
  const duvetLen = duvetZ1 - duvetZ0;

  return (
    <group>
      {/* One upholstered panel, 1.2 m, with six wide shallow channels and a
          brass line along the top. Shallow is the operative word: at 100 mm
          proud the ribs were objects in their own right, and the panel stopped
          being a surface. */}
      <RoundedBox
        args={[H.w, H.h, H.depth]}
        radius={0.04}
        smoothness={3}
        position={[x, H.h / 2, H.z]}
        castShadow
        receiveShadow
      >
        <primitive object={materials.velvet} attach="material" />
      </RoundedBox>
      {Array.from({ length: H.channels }, (_, i) => {
        const pitch = (H.w - 0.1) / H.channels;
        return (
          <RoundedBox
            key={`ch-${i}`}
            args={[pitch - 0.03, H.h - 0.11, 0.05]}
            radius={0.024}
            smoothness={3}
            position={[
              x - (H.w - 0.1) / 2 + (i + 0.5) * pitch,
              H.h / 2,
              H.z + H.depth / 2 + 0.005,
            ]}
            castShadow
          >
            <primitive object={materials.velvet} attach="material" />
          </RoundedBox>
        );
      })}
      <mesh position={[x, H.h + 0.011, H.z + 0.012]} castShadow>
        <boxGeometry args={[H.w + 0.016, 0.022, H.depth + 0.03]} />
        <primitive object={materials.brass} attach="material" />
      </mesh>

      {/**
       * One slim platform, recessed and dark, on a plinth you never see.
       *
       * Two things make a bed float, and neither is the plinth. The first is
       * that the thing above overhangs it — the duvet now drapes to within
       * 20 mm of this platform and is 260 mm wider, so from any standing angle
       * the platform is in its shadow. The second is tone: at the headboard's
       * own oatmeal this read as a second bright slab under a bright duvet, so
       * it is the dark taupe instead, a third of the reflectance of the thing
       * resting on it.
       *
       * The plinth under it is inset half a metre on every side, which is far
       * enough in to be invisible, and the 60 mm it leaves is where `bd-night`
       * throws its path light.
       */}
      <mesh position={[x, 0.03, midZ]} castShadow>
        <boxGeometry args={[width - 0.5, 0.06, length - 0.5]} />
        <primitive object={materials.bedBase} attach="material" />
      </mesh>
      <RoundedBox
        args={[width - 0.06, 0.26, length - 0.06]}
        radius={0.022}
        smoothness={3}
        position={[x, 0.19, midZ]}
        castShadow
        receiveShadow
      >
        <primitive object={materials.throw} attach="material" />
      </RoundedBox>

      {/* Mattress in its fitted sheet. The piping went with this pass: the
          duvet now drapes past it on three sides, so a welt along the seam was
          detail nobody could see. */}
      <RoundedBox
        args={[width, SLEEP - PLATFORM_TOP, length]}
        radius={0.04}
        smoothness={3}
        position={[x, (PLATFORM_TOP + SLEEP) / 2, midZ]}
        castShadow
        receiveShadow
      >
        <primitive object={materials.sheet} attach="material" />
      </RoundedBox>

      {/**
       * One smooth duvet, draping to the platform on both sides and the foot.
       *
       * It used to stop at 0.54 and leave 220 mm of mattress showing below it,
       * so the bed read as a stack — platform, mattress, duvet, three slabs of
       * three tones. A made bed does not look like that, because the duvet
       * falls over the edge and what you see is one soft white form sitting on
       * a base. This now comes down to 0.34, which is 20 mm off the platform.
       */}
      <RoundedBox
        args={[width + 0.26, 0.42, duvetLen]}
        radius={0.17}
        smoothness={4}
        position={[x, SLEEP - 0.03, (duvetZ0 + duvetZ1) / 2]}
        castShadow
        receiveShadow
      >
        <primitive object={materials.duvet} attach="material" />
      </RoundedBox>
      {Array.from({ length: 4 }, (_, i) => {
        const seg = duvetLen / 4;
        const z = duvetZ0 + (i + 0.5) * seg;
        const wave = Math.sin(i * 1.7) * 0.006;
        return (
          <RoundedBox
            key={`fold-${i}`}
            args={[width + 0.11, 0.04 + wave, seg * 0.78]}
            radius={0.019}
            smoothness={3}
            position={[x, SLEEP + 0.155 + wave, z]}
            castShadow
          >
            <primitive object={materials.duvet} attach="material" />
          </RoundedBox>
        );
      })}

      {/**
       * Five pillows: two sleeping, two smaller in front, one lumbar.
       *
       * These were cylinders, and the reason is arithmetic rather than taste.
       * A `RoundedBox` whose corner radius reaches half its smallest dimension
       * has no flat left in that axis — 0.1 of radius on 0.21 of height is a
       * capsule, which is to say a bolster. Keeping the radius near a quarter
       * of the height leaves a flat face on top with a soft roll round the
       * edge, which is what a plump pillow actually is.
       *
       * The crease along each sleeping pillow is the second half of it. Nobody
       * owns a pillow with an unbroken surface; a single soft fold where it
       * has been plumped is the difference between upholstery and bedding.
       */}
      {([-1, 1] as const).map((sgn) => (
        <group key={`sleep-${sgn}`} position={[x + sgn * 0.44, 0.83, headZ + 0.31]} rotation={[-0.15, sgn * 0.045, 0]}>
          <RoundedBox args={[0.84, 0.3, 0.54]} radius={0.06} smoothness={4} castShadow>
            <primitive object={materials.pillow} attach="material" />
          </RoundedBox>
          <RoundedBox
            args={[0.78, 0.05, 0.13]}
            radius={0.024}
            smoothness={3}
            position={[0, 0.133, -0.02]}
            castShadow
          >
            <primitive object={materials.pillow} attach="material" />
          </RoundedBox>
        </group>
      ))}
      {([-1, 1] as const).map((sgn) => (
        <RoundedBox
          key={`front-${sgn}`}
          args={[0.6, 0.23, 0.42]}
          radius={0.05}
          smoothness={4}
          position={[x + sgn * 0.42, 0.765, headZ + 0.64]}
          rotation={[-0.09, sgn * -0.06, 0]}
          castShadow
        >
          <primitive object={materials.pillow} attach="material" />
        </RoundedBox>
      ))}
      <RoundedBox
        args={[0.76, 0.21, 0.27]}
        radius={0.048}
        smoothness={4}
        position={[x, 0.765, headZ + 0.73]}
        rotation={[-0.09, 0, 0]}
        castShadow
      >
        <primitive object={materials.velvet} attach="material" />
      </RoundedBox>

      {/* One plain caramel runner across the lower third. Square to the bed,
          not on the diagonal, and with no second layer on it — the bouclé
          throw this replaces read as three stripes however it was built. */}
      <RoundedBox
        args={[width + 0.29, 0.07, 0.56]}
        radius={0.03}
        smoothness={4}
        position={[x, SLEEP + 0.19, headZ + length - 0.42]}
        castShadow
        receiveShadow
      >
        <primitive object={materials.caramel} attach="material" />
      </RoundedBox>
    </group>
  );
}

/**
 * Nightstands, and the table lamp bodies that sit on them.
 *
 * Bodies only: the shades glow in the rig, because their brightness is device
 * state. A lamp that disappears when it is off would be a giveaway.
 */
function Nightstands() {
  const { left, right, z, top } = PLAN.nightstand;

  return (
    <group>
      {[left, right].map((x, i) => (
        <group key={`ns-${i}`}>
          <mesh position={[x, top / 2 + 0.08, z]} castShadow receiveShadow>
            <boxGeometry args={[0.52, top - 0.16, 0.44]} />
            <primitive object={materials.nightstand} attach="material" />
          </mesh>
          {/* Stone top, proud of the carcass on every side. */}
          <mesh position={[x, top + 0.015, z]} castShadow receiveShadow>
            <boxGeometry args={[0.58, 0.03, 0.48]} />
            <primitive object={materials.nightstandTop} attach="material" />
          </mesh>
          {/* Drawer line and a slim pull. */}
          <mesh position={[x, 0.36, z + 0.222]}>
            <boxGeometry args={[0.46, 0.008, 0.006]} />
            <primitive object={materials.brass} attach="material" />
          </mesh>
          {/* Lamp base and stem. */}
          <mesh position={[x, top + 0.06, z - 0.02]} castShadow>
            <cylinderGeometry args={[0.075, 0.09, 0.06, 20]} />
            <primitive object={materials.brass} attach="material" />
          </mesh>
          <mesh position={[x, top + 0.2, z - 0.02]} castShadow>
            <cylinderGeometry args={[0.014, 0.014, 0.24, 12]} />
            <primitive object={materials.brass} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Bench at the foot of the bed, and the armchair by the glazing. */
function Furniture() {
  const bench = PLAN.bench;
  const chair = PLAN.armchair;

  return (
    <group>
      <RoundedBox
        args={[1.62, 0.18, 0.46]}
        radius={0.06}
        smoothness={3}
        position={[bench.x, 0.44, bench.z]}
        castShadow
        receiveShadow
      >
        <primitive object={materials.bench} attach="material" />
      </RoundedBox>
      {[-0.7, 0.7].map((dx, i) =>
        [-0.17, 0.17].map((dz, j) => (
          <mesh
            key={`leg-${i}-${j}`}
            position={[bench.x + dx, 0.18, bench.z + dz]}
            castShadow
          >
            <boxGeometry args={[0.05, 0.36, 0.05]} />
            <primitive object={materials.brass} attach="material" />
          </mesh>
        )),
      )}

      {/* Armchair: seat, a back that leans, and two low arms, turned toward
          the bed. Rounded throughout — the arms especially, since they are the
          part nearest the camera. */}
      <group position={[chair.x, 0, chair.z]} rotation={[0, -0.75, 0]}>
        <RoundedBox
          args={[0.78, 0.22, 0.74]}
          radius={0.075}
          smoothness={3}
          position={[0, 0.38, 0]}
          castShadow
          receiveShadow
        >
          <primitive object={materials.armchair} attach="material" />
        </RoundedBox>
        <RoundedBox
          args={[0.78, 0.62, 0.16]}
          radius={0.075}
          smoothness={3}
          position={[0, 0.66, -0.32]}
          rotation={[-0.14, 0, 0]}
          castShadow
          receiveShadow
        >
          <primitive object={materials.armchair} attach="material" />
        </RoundedBox>
        {[-0.35, 0.35].map((dx) => (
          <RoundedBox
            key={`arm-${dx}`}
            args={[0.12, 0.14, 0.72]}
            radius={0.055}
            smoothness={3}
            position={[dx, 0.53, 0]}
            castShadow
          >
            <primitive object={materials.armchair} attach="material" />
          </RoundedBox>
        ))}
        {[-0.3, 0.3].map((dx) =>
          [-0.3, 0.3].map((dz, j) => (
            <mesh key={`cleg-${dx}-${j}`} position={[dx, 0.14, dz]} castShadow>
              <cylinderGeometry args={[0.022, 0.022, 0.28, 10]} />
              <primitive object={materials.brass} attach="material" />
            </mesh>
          )),
        )}
      </group>

      {/* Side table. */}
      <mesh position={[chair.x - 0.78, 0.46, chair.z + 0.42]} castShadow receiveShadow>
        <cylinderGeometry args={[0.24, 0.24, 0.035, 48]} />
        <primitive object={materials.nightstandTop} attach="material" />
      </mesh>
      <mesh position={[chair.x - 0.78, 0.22, chair.z + 0.42]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.44, 20]} />
        <primitive object={materials.brass} attach="material" />
      </mesh>
    </group>
  );
}

function Rug() {
  const { x, headZ, length } = PLAN.bed;
  return (
    <mesh position={[x, 0.005, headZ + length * 0.72]} receiveShadow>
      <boxGeometry args={[3.5, 0.01, 3.0]} />
      <primitive object={materials.rug} attach="material" />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Ceiling fan                                                         */
/* ------------------------------------------------------------------ */

/**
 * Three-blade ceiling fan.
 *
 * Rotation is driven from the device's speed rather than animated at a constant
 * rate, because "off" has to be unmistakable from across a room and the whole
 * point of a fan control is that you can see it working. Speed is a prop so the
 * geometry itself stays state-free; only the spin lives in `useFrame`.
 */
function CeilingFan({ radiansPerSecond }: { radiansPerSecond: number }) {
  const blades = useRef<THREE.Group>(null);
  const { x, z, y } = PLAN.fan;

  useFrame((_, dt) => {
    if (!blades.current) return;
    // See MAX_BLADE_STEP_RAD: a late frame under-turns rather than aliasing.
    blades.current.rotation.y += Math.min(radiansPerSecond * dt, MAX_BLADE_STEP_RAD);
  });

  return (
    <group position={[x, 0, z]}>
      {/* Downrod and canopy. */}
      <mesh position={[0, (ROOM.h + y) / 2 + 0.06, 0]}>
        <cylinderGeometry args={[0.022, 0.022, ROOM.h - y - 0.12, 10]} />
        <primitive object={materials.metal} attach="material" />
      </mesh>
      <mesh position={[0, ROOM.h - 0.03, 0]}>
        <cylinderGeometry args={[0.09, 0.07, 0.06, 32]} />
        <primitive object={materials.metal} attach="material" />
      </mesh>

      {/* Named so the rotation can be read back out of the scene graph when
          checking that speed actually reaches the blades. */}
      <group ref={blades} name="fan-blades" position={[0, y, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.085, 0.1, 0.1, 32]} />
          <primitive object={materials.metal} attach="material" />
        </mesh>
        {/* 1.25 m sweep — a 48" fan, which is what actually hangs in a room
            this size. The first pass was drawn at nearly two metres and
            dominated the frame like a helicopter. */}
        {[0, 1, 2].map((i) => {
          const a = (i * Math.PI * 2) / 3;
          return (
            <group key={`blade-${i}`} rotation={[0, a, 0]}>
              <mesh position={[0.36, 0.01, 0]} rotation={[0.12, 0, 0]} castShadow>
                <boxGeometry args={[0.56, 0.014, 0.16]} />
                <primitive object={materials.fanBlade} attach="material" />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Glazing, curtains and the view                                      */
/* ------------------------------------------------------------------ */

/** Glazed opening in the x = ROOM.w wall. Exported: the rig puts the daylight
    area light on exactly this plane. */
export const WINDOW = { z0: 0.35, z1: ROOM.d - 0.35, y0: 0.06, y1: ROOM.h - 0.34 };

/**
 * Curtain panels per layer, and how much adjacent panels overlap.
 *
 * Overlap, not gap: real curtain panels are cut wide and lap over each other,
 * and modelling them butt-jointed left 70mm slots of city light showing through
 * a "closed" blackout. A blackout curtain that visibly leaks is not a detail —
 * it is the product failing to do the one thing it is named after.
 */
const PANELS = 4;
const PANEL_OVERLAP = 0.05;

export interface CurtainPositions {
  /** 0 = fully open (bunched), 100 = fully closed. */
  sheer: number;
  blackout: number;
}

function Curtains({ sheer, blackout }: CurtainPositions) {
  const span = WINDOW.z1 - WINDOW.z0;
  const height = WINDOW.y1 - WINDOW.y0;
  const seg = span / PANELS;

  const layers = [
    { key: "blackout", pos: blackout, mat: materials.curtainBlackout, x: ROOM.w - 0.19 },
    { key: "sheer", pos: sheer, mat: materials.curtainSheer, x: ROOM.w - 0.33 },
  ];

  return (
    <group>
      {/* Track, boxed into the soffit edge. */}
      <mesh position={[ROOM.w - 0.26, WINDOW.y1 + 0.03, ROOM.d / 2]}>
        <boxGeometry args={[0.22, 0.04, span + 0.2]} />
        <primitive object={materials.metal} attach="material" />
      </mesh>

      {layers.map((layer) => {
        const gather = 1 - Math.max(0, Math.min(1, layer.pos / 100));
        return Array.from({ length: PANELS }, (_, i) => {
          const geo = makeCurtainGeometry({
            length: seg + PANEL_OVERLAP,
            height,
            folds: 5,
            foldDepth: 0.045,
            gather,
          });
          // Panels bunch outward in pairs, so an opening curtain clears the
          // middle of the glazing rather than sliding off one end.
          const toStart = i < PANELS / 2;
          const z = toStart
            ? WINDOW.z0 + i * seg - PANEL_OVERLAP / 2
            : WINDOW.z0 + (i + 1) * seg + PANEL_OVERLAP / 2;
          return (
            <mesh
              key={`${layer.key}-${i}`}
              geometry={geo}
              material={layer.mat}
              position={[layer.x, WINDOW.y0, z]}
              scale={[1, 1, toStart ? 1 : -1]}
              castShadow={layer.key === "blackout"}
            />
          );
        });
      })}
    </group>
  );
}

function Glazing({ night }: { night: boolean }) {
  /**
   * The skyline takes a daylight level now rather than a night flag, so dusk is
   * a real state. This room only has the boolean to hand and is not what the
   * brief is about, so it passes a representative daytime value rather than
   * growing a new prop for the sake of it.
   */
  const cityTex = useMemo(() => makeCityTexture(night ? 0 : 0.8), [night]);
  const cityMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: cityTex,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    [cityTex],
  );

  const mullionZ = [WINDOW.z0, ROOM.d / 2, WINDOW.z1];

  return (
    <group>
      {/* The view, set back beyond the glass so it has some parallax. */}
      <mesh
        position={[ROOM.w + 6, ROOM.h / 2 + 0.6, ROOM.d / 2]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[24, 12]} />
        <primitive object={cityMat} attach="material" />
      </mesh>

      {/* Glass */}
      <mesh
        position={[ROOM.w - 0.02, (WINDOW.y0 + WINDOW.y1) / 2, ROOM.d / 2]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[WINDOW.z1 - WINDOW.z0, WINDOW.y1 - WINDOW.y0]} />
        <primitive object={materials.glass} attach="material" />
      </mesh>

      {/* Solid wall around the opening.
          Without these the x = ROOM.w wall exists only where the glass is, and
          the city plane behind it is visible straight through the gaps at each
          end — which showed up as a bright sliver beside a fully closed
          blackout curtain. */}
      {[
        { pos: [ROOM.w, ROOM.h / 2, WINDOW.z0 / 2], size: [WINDOW.z0, ROOM.h] },
        {
          pos: [ROOM.w, ROOM.h / 2, (WINDOW.z1 + ROOM.d) / 2],
          size: [ROOM.d - WINDOW.z1, ROOM.h],
        },
        {
          pos: [ROOM.w, (WINDOW.y1 + ROOM.h) / 2, ROOM.d / 2],
          size: [ROOM.d, ROOM.h - WINDOW.y1],
        },
      ].map((p, i) => (
        <mesh
          key={`reveal-${i}`}
          position={p.pos as [number, number, number]}
          rotation={[0, -Math.PI / 2, 0]}
          receiveShadow
        >
          <planeGeometry args={p.size as [number, number]} />
          <primitive object={materials.plaster} attach="material" />
        </mesh>
      ))}

      {/* Frame: sill and mullions. */}
      <mesh position={[ROOM.w - 0.03, WINDOW.y0, ROOM.d / 2]}>
        <boxGeometry args={[0.1, 0.12, ROOM.d]} />
        <primitive object={materials.metal} attach="material" />
      </mesh>
      {mullionZ.map((z, i) => (
        <mesh
          key={`mullion-${i}`}
          position={[ROOM.w - 0.03, (WINDOW.y0 + WINDOW.y1) / 2, z]}
        >
          <boxGeometry args={[0.08, WINDOW.y1 - WINDOW.y0, 0.06]} />
          <primitive object={materials.metal} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Fixture bodies                                                      */
/* ------------------------------------------------------------------ */

/**
 * Where every fixture is, shared with the rig.
 *
 * The visible hardware is drawn here; the emissive faces and the actual lights
 * live in the rig, so that a fixture switched off still has a physical presence
 * in the room. A downlight that vanishes when it is off is a giveaway.
 */
export const FIXTURES = {
  cove: { y: COVE_Y },
  /** Four heads: two over the bed, one on the walkway, one at the wardrobe. */
  downlights: [
    { x: 3.9, z: 1.55 },
    { x: 5.8, z: 1.55 },
    { x: 4.85, z: 3.6 },
    { x: 1.5, z: 1.5 },
  ],
} as const;

function FixtureBodies() {
  return (
    <group>
      {FIXTURES.downlights.map((d, i) => (
        <mesh key={`dl-body-${i}`} position={[d.x, ROOM.h - 0.012, d.z]}>
          <cylinderGeometry args={[0.058, 0.058, 0.024, 20]} />
          <primitive object={materials.metal} attach="material" />
        </mesh>
      ))}

      {/* Articulated reading lights: a wall plate, an arm angled down and in,
          and a small conical head over the pillow. The arm is what identifies
          these as reading lights rather than more wall washers, so it is drawn
          thick enough to be legible from the camera. */}
      {[PLAN.reading.left, PLAN.reading.right].map((x, i) => {
        // Both arms swing inward, toward the pillow they serve.
        const dir = i === 0 ? 1 : -1;
        return (
          <group key={`rl-${i}`} position={[x, PLAN.reading.y, PLAN.reading.z]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.055, 0.055, 0.045, 20]} />
              <primitive object={materials.brass} attach="material" />
            </mesh>
            <mesh
              position={[dir * 0.1, -0.09, 0.14]}
              rotation={[-0.55, 0, dir * -0.75]}
              castShadow
            >
              <cylinderGeometry args={[0.02, 0.02, 0.32, 12]} />
              <primitive object={materials.brass} attach="material" />
            </mesh>
            <mesh
              position={[dir * 0.2, -0.19, 0.28]}
              rotation={[1.05, 0, 0]}
              castShadow
            >
              <cylinderGeometry args={[0.058, 0.04, 0.11, 20]} />
              <primitive object={materials.brass} attach="material" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Scanned surfaces                                                    */
/* ------------------------------------------------------------------ */

/**
 * Scanned PBR maps, written onto the shared materials in place.
 *
 * Every material in `materials.ts` was already a `MeshStandardMaterial` or a
 * `MeshPhysicalMaterial` with sheen on the fabrics, so the room was already
 * physically shaded. What it had no answer for was grain: a roughness number
 * cannot do a linen weave, a marble vein or the figure in a timber slat, and
 * that absence is most of what made this read as a blockout of a nice room
 * rather than as the room.
 *
 * Two things this pass has to get right, both learned the expensive way in the
 * executive cabin:
 *
 *  - **Colour and map multiply.** Every colour in `PALETTE` was chosen when it
 *    was the whole answer. Laying an albedo underneath one and calling it a
 *    tint applies the tone twice: the cabin's joinery ended up returning half
 *    a per cent of the light that reached it against eight to twelve for real
 *    walnut, and the compensation all went into the fixtures. The colours have
 *    been re-solved so that `colour x albedo` lands on a real reflectance.
 *  - **One scan, one `repeat`.** `useTexture` caches by URL and `repeat` lives
 *    on the texture, so marble at floor-tile scale and marble at nightstand
 *    scale need separate clones or the last one mounted wins on both.
 *
 * Mutated in place rather than rebuilt: these materials are module singletons
 * on purpose, and constructing new ones recompiles shaders during a fade.
 */
function Surfaces() {
  const stone = useTextureSet("stone", [5, 4.3]);
  const stoneTop = useTextureSet("stone", [2.2, 2.2], { clone: true });
  const oak = useTextureSet("oak", [0.7, 3.2]);
  const walnut = useTextureSet("walnut", [2, 2]);
  const linen = useTextureSet("linen", [7, 6]);
  const linenCoarse = useTextureSet("linen", [3.2, 3], { clone: true });
  const wool = useTextureSet("carpet", [4, 4]);

  useLayoutEffect(() => {
    applySet(materials.floor, stone, { normalScale: 0.28, envMapIntensity: 0.9 });
    applySet(materials.woodSlat, oak, { normalScale: 0.65, envMapIntensity: 0.4 });
    applySet(materials.woodBack, walnut, { normalScale: 0.5, envMapIntensity: 0.2 });

    applySet(materials.headboard, linenCoarse, { normalScale: 0.7 });
    applySet(materials.duvet, linen, { normalScale: 0.55 });
    applySet(materials.sheet, linen, { normalScale: 0.45 });
    applySet(materials.pillow, linen, { normalScale: 0.85 });
    applySet(materials.pillowAccent, linen, { normalScale: 0.6 });
    applySet(materials.throw, linenCoarse, { normalScale: 0.95 });
    applySet(materials.velvet, linenCoarse, { normalScale: 0.4 });
    applySet(materials.sheetTop, linen, { normalScale: 0.5 });
    applySet(materials.caramel, linenCoarse, { normalScale: 0.9 });
    applySet(materials.bench, linenCoarse, { normalScale: 0.7 });
    applySet(materials.armchair, linenCoarse, { normalScale: 0.75 });
    applySet(materials.curtainBlackout, linenCoarse, { normalScale: 0.6 });
    applySet(materials.rug, wool, { normalScale: 0.5, envMapIntensity: 0.15 });

    applySet(materials.nightstand, walnut, { normalScale: 0.45, envMapIntensity: 0.3 });
    applySet(materials.nightstandTop, stoneTop, { normalScale: 0.3, envMapIntensity: 1.0 });
    applySet(materials.wardrobeCarcass, walnut, { normalScale: 0.45, envMapIntensity: 0.3 });
    applySet(materials.wardrobeBack, oak, { normalScale: 0.4, envMapIntensity: 0.2 });
  }, [stone, stoneTop, oak, walnut, linen, linenCoarse, wool]);

  return null;
}

/* ------------------------------------------------------------------ */

export function MasterBedroom({
  curtains,
  night,
  fanRadiansPerSecond = 0,
}: {
  curtains: CurtainPositions;
  night: boolean;
  fanRadiansPerSecond?: number;
}) {
  return (
    <group>
      <Surfaces />
      <Shell />
      <SlatWall />
      <Wardrobe />
      <Bed />
      <Nightstands />
      <Furniture />
      <Rug />
      <Glazing night={night} />
      <Curtains {...curtains} />
      <CeilingFan radiansPerSecond={fanRadiansPerSecond} />
      <FixtureBodies />
    </group>
  );
}
