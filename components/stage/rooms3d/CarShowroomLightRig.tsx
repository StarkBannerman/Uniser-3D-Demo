"use client";

/**
 * Device state -> three.js lights, for the car showroom.
 *
 * Nine groups, matching the requirement document: general, spotlights,
 * high-CRI product, linear, accent, floor, architectural, RGB feature, and
 * the daylight through the frontage.
 *
 * **The light budget is the frame budget**, which this project established the
 * expensive way: the hotel lobby ran at nine frames a second with thirty-six
 * lights in it and at forty with twenty-three, and nothing else in the
 * renderer came within a factor of three of that. three.js evaluates every
 * light at every fragment *and* uploads every light's uniforms on every draw
 * call, so the count is paid for everywhere.
 *
 * The rule, as in the lobby: **a light is for illumination, an emissive mesh
 * is for recognition.** The ceiling carries fifty-four glowing lenses and six
 * actual downlights; the track carries thirty-two heads and four actual
 * spots. From the floor the difference is invisible, because what reads as
 * "that fitting is on" is the aperture, not the cone.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { LightState } from "@/lib/sim/types";
import type { Quality } from "@/lib/device";
import { cctToRgb, lightOutput, rgbToCss } from "@/lib/sim/photometry";
import { useEmissiveMaterial } from "./lightMaterials";
import { Spot } from "./Spot";
import { SH, SH_CARS, SH_PLAN } from "./CarShowroom3D";
import { useQuality } from "../Stage3D";

const GAIN = {
  downlight: 100,
  downlightEmissive: 9,
  /**
   * Fifty-two, not seventy.
   *
   * A head aimed at a car six metres below it delivers, after inverse square,
   * about a third of what the same number gives the hero across the room —
   * so the figure that lit the platform correctly blew the nearest car to
   * white paper. The heads are the sharpest instrument in the room and they
   * were being swung the hardest.
   */
  spot: 52,
  spotEmissive: 5,
  product: 72,
  linear: 30,
  linearEmissive: 3.2,
  accent: 34,
  accentEmissive: 3,
  /**
   * Six, where the cove runs at eighteen.
   *
   * `rectAreaLight` intensity is a luminance and what reaches the room is that
   * figure times the light's *area*. The ring's emitter is 7.8 m square —
   * sixty square metres, fifteen times a cove strip — so matching the cove's
   * number put a sheet of light across the whole floor and the bottom half of
   * the frame came back as one orange plane. The ratio is the setting, not
   * the number.
   */
  floor: 4,
  floorEmissive: 2.4,
  arch: 12,
  archEmissive: 3.0,
  rgb: 24,
  rgbEmissive: 4.4,
};

/**
 * Lights stay mounted and are driven to zero rather than removed.
 *
 * three.js bakes the count of each kind into every material's shader, so
 * adding or removing one recompiles every material in the scene. During a
 * scene fade the nine channels cross zero at different moments, which would
 * make the count change several times per transition — each combination a
 * variant the driver has not seen. Measured on the bedroom before this rule
 * existed: one press compiled 38 programs and froze the worst frame for
 * 2,684 ms.
 */
const MOUNTED = true;

/**
 * How many lights each tier is allowed to switch on.
 *
 * Measured on this room: twenty-two lights cost about 60 ms a frame. Hiding
 * the five rect-area lights took that to 28.8 ms; hiding the fourteen spots
 * took it to the 16.7 ms rAF floor. So a rect-area light is worth roughly
 * 6 ms and a spot roughly 3 ms, and *light count is the entire frame budget*
 * — the floor reflector, the ambient occlusion, the multisampling and the
 * shadow maps together were worth about 10 ms of the 60.
 *
 * Which is why the old low tier barely helped: it dropped all the cheap
 * things and none of the expensive one. It took a frame from 61.8 ms to
 * 51.8 ms, 16 per cent, on exactly the machines that needed four times that.
 *
 * What gets cut is chosen so the room still *reads* the same. Every fitting
 * stays mounted and every lens, strip and panel keeps its emissive material,
 * so the ceiling looks identical — what thins out is how many of them cast
 * light into the room. A showroom lit by three downlights instead of six is
 * a slightly flatter showroom; a showroom at nine frames a second is a
 * broken demo.
 */
const BUDGET: Record<Quality, {
  downlights: number;
  heads: number;
  washers: number;
  linear: number;
  accentWall: boolean;
  rgb: boolean;
  /**
   * How many lights may cast a shadow.
   *
   * Each one re-renders all 84 shadow-casting meshes into its own map, and
   * the three together are 6.3 megapixels of depth a frame — more pixels than
   * the picture itself. That was 10 per cent of a 60 ms frame and barely
   * worth chasing; it is a third of a 18 ms one, which is what the low tier
   * now runs at. The one that stays is the head over the hero platform,
   * because the shadow under the car on the turntable is the only one anybody
   * looks at.
   */
  shadows: number;
}> = {
  high: { downlights: 6, heads: 4, washers: 2, linear: 2, accentWall: true, rgb: true, shadows: 3 },
  low: { downlights: 3, heads: 2, washers: 0, linear: 1, accentWall: false, rgb: false, shadows: 1 },
} as const;


/**
 * How far each light is pulled toward white. 0 is the raw illuminant.
 *
 * A 3400 K source really is (1.00, 0.51, 0.24) in linear light: full red,
 * a quarter of the blue. That is correct physics and it renders wrong,
 * because six circuits of it stack red to saturation while blue never gets
 * near it, and ACES then compresses the top of a frame whose red is already
 * clipped. Measured here: the floor came back at roughly 2000 K in a room
 * whose warmest circuit was set to 3400.
 *
 * What is missing is not the illuminant, it is the observer. An eye in that
 * room — and the camera that took the client's reference photograph —
 * chromatically adapts, so a warm room reads *warm* rather than orange. The
 * renderer has no model of that, so it gets one here: every light is mixed
 * part of the way to white, which keeps the ordering between scenes intact
 * (3400 K is still visibly warmer than 4600 K) and takes the saturation out.
 *
 * Deliberately local to this room. The residential rooms and the hotel lobby
 * were tuned by eye against the unadapted colours and signed off that way;
 * changing the constant under them would shift seven approved scenes apiece.
 */
/*
 * Reduced from 0.45 against the reference.
 *
 * 0.45 did take the saturation out, and it took the room's colour with it:
 * sampled at matching points the photograph holds B/R ≈ 0.76 on its ceiling,
 * its wall and its floor alike — one warm source, everywhere — where ours
 * came back at 1.03, a cool room. Adaptation is meant to stop a warm room
 * reading *orange*, not to stop it reading warm.
 */
const ADAPT = 0.26;

function colourOf(state: LightState): THREE.Color {
  const adapt = (c: THREE.Color) => c.lerp(new THREE.Color(1, 1, 1), ADAPT);
  if (state.sat > 0) {
    const c = new THREE.Color(rgbToCss(cctToRgb(state.cct)));
    return adapt(c.lerp(new THREE.Color().setHSL(state.hue / 360, 1, 0.5), state.sat / 100));
  }
  const [r, g, b] = cctToRgb(state.cct);
  return adapt(new THREE.Color(r / 255, g / 255, b / 255).convertSRGBToLinear());
}

const output = (s: LightState) => (s.on ? lightOutput(s.level) : 0);
/** Aperture brightness is compressed far less than luminous output — a dimmed
 *  fitting still looks like a lit object. */
const aperture = (s: LightState) => (s.on ? Math.pow(s.level / 100, 0.42) : 0);

/* ------------------------------------------------------------------ */
/* General downlights                                                  */
/* ------------------------------------------------------------------ */

/** Fifty-four lenses on a 2.6 m grid; six of them carry a light. */
const LENSES: { x: number; z: number }[] = [];
/**
 * Re-gridded for the new shell.
 *
 * The old array ran x 1.6..24.4 and z 1.7..22.3, which was the whole of a
 * 30 x 25 room. This one is 29 x 36 and the lens stands at z = 34, so a third
 * of the floor the camera now takes in had no fitting over it at all. The
 * grid also stops at x = 17: beyond that is the timber slat bay, which gets
 * its own linear runs rather than recessed cans.
 */
for (let i = 0; i < 5; i++) {
  for (let j = 0; j < 8; j++) {
    const x = 1.4 + i * 2.35;
    const z = 1.5 + j * 2.3;
    // Nothing is recessed into the soffit; its own track heads light it.
    const dx = (x - SH_PLAN.hero.x) / (SH_PLAN.coffer.rx + 0.5);
    const dz = (z - SH_PLAN.hero.z) / (SH_PLAN.coffer.rz + 0.5);
    if (dx * dx + dz * dz < 1) continue;
    LENSES.push({ x, z });
  }
}

/**
 * Six positions; the quality budget mounts the first three or all six.
 *
 * Two of them moved when the camera went wide. The lens now stands at z =
 * 23.2 and takes in the whole room, and two thirds of what it added had no
 * fitting over it: the foreground floor runs from z = 23 to z = 16 and the
 * grid stopped at 16.4, while the reception zone at x = 28 had nothing nearer
 * than x = 21.5. Measured, that corner came back at 57 against the
 * photograph's 120.
 *
 * Moved rather than added. This room runs at 11.7 fps on the high tier and a
 * spot costs about three milliseconds a frame, so the count is fixed and the
 * question is only where the six go. The two that gave way were the back-left
 * pair, which were lighting wall the graphics accent already grazes.
 */
const DOWN_EMITTERS: readonly {
  x: number;
  z: number;
  tx?: number;
  ty?: number;
  tz?: number;
}[] = [
  /**
   * Six cans; three light the floor and three are aimed at stock.
   *
   * The aimed three target the silver coupe, the hero SUV and the red coupe
   * at bonnet height, narrowed to 0.5 rad, so the clearcoat finally has a
   * hard source to return - the diagnosis panel's point was that paint
   * without a hotspot reads as clay whatever its material says.
   */
  { x: 4.5, z: 12.5, tx: 4.4, ty: 0.9, tz: 10.8 },
  { x: 8.0, z: 13.8 },
  { x: 6.0, z: 8.0, tx: 6.5, ty: 1.1, tz: 6.0 },
  { x: 11.5, z: 11.0 },
  { x: 14.0, z: 13.5 },
  { x: 13.5, z: 8.0, tx: 10.2, ty: 0.9, tz: 2.4 },
] as const;

function Downlights({ state, gain }: { state: LightState; gain: number }) {
  const budget = BUDGET[useQuality()];
  const ref = useRef<THREE.InstancedMesh>(null);
  const halos = useRef<THREE.InstancedMesh>(null);
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const lens = useEmissiveMaterial(colour, GAIN.downlightEmissive * glow);
  const halo = useGlowMaterial("#ffd9a6", 0.65 * glow);
  const pool = useGlowMaterial("#ffe2bc", 0.3 * out);
  const y = SH.h - 0.015;

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const one = new THREE.Vector3(1, 1, 1);
    for (const [mesh, dy] of [
      [ref.current, 0],
      [halos.current, -0.03],
    ] as const) {
      if (!mesh) continue;
      LENSES.forEach((p, i) => {
        m.compose(new THREE.Vector3(p.x, y + dy, p.z), rot, one);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, [y]);

  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, LENSES.length]}>
        <circleGeometry args={[0.08, 32]} />
        <primitive object={lens} attach="material" />
      </instancedMesh>
      {/*
        A soft halo under every lens - one instanced draw for all of them.
        This is what turns the ceiling from the darkest field in the frame
        into the brightest, which is the reference's value structure: thirty
        warm glowing points on pale plaster.
      */}
      <instancedMesh ref={halos} args={[undefined, undefined, LENSES.length]}>
        <planeGeometry args={[1.05, 1.05]} />
        <primitive object={halo} attach="material" />
      </instancedMesh>
      {DOWN_EMITTERS.slice(0, budget.downlights).map((p, i) => (
        <group key={`dl-${i}`}>
          {/* The pool where this can's light lands. */}
          <mesh
            position={[p.tx ?? p.x, 0.012, p.tz ?? p.z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[2.6, 2.6]} />
            <primitive object={pool} attach="material" />
          </mesh>
          {MOUNTED && (
            <Spot
              position={[p.x, SH.h - 0.05, p.z]}
              target={[p.tx ?? p.x, p.ty ?? 0, p.tz ?? p.z]}
              angle={p.tx !== undefined ? 0.5 : 0.82}
              penumbra={p.tx !== undefined ? 0.4 : 0.86}
              distance={15}
              decay={1.2}
              intensity={GAIN.downlight * out * gain}
              // One shadow caster. More maps cost far more at this scale than
              // the extra shadows contribute.
              castShadow={i === 2 && budget.shadows > 2}
              color={colour}
            />
          )}
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Track and adjustable spotlights                                     */
/* ------------------------------------------------------------------ */

/** Where the track runs, and where its heads sit along it. */
/**
 * The track rails, as free segments rather than constant-z runs.
 *
 * Two things forced the rewrite. The old rails were still in the previous
 * shell's coordinates - one ran at z 11.6, which in the solved room is a row
 * of heads parked directly over the lens and looming across the top of every
 * frame, and another reached x 25 in a room that now ends at 19.5. And the
 * reference's main rail is *diagonal*: it runs from the upper left toward the
 * soffit so its heads converge on the vanishing point, which a structure that
 * only knows "x0 to x1 at one z" cannot say at all.
 */
const TRACKS = [
  /**
   * Both rails run down the room, converging on the vanishing point, which is
   * what the reference's "diagonals" are. The first follows the canopy's
   * right edge between the white panel and the dark band; the second sits
   * over the brand wall on the left. The previous diagonal cut straight
   * across the ring's face, which no fit-out would ever do - track needs a
   * slab to fix to, and the ring is not one.
   */
  { x0: 10.2, z0: 1.0, x1: 10.2, z1: 13.0 },
  { x0: 2.6, z0: 2.0, x1: 2.6, z1: 9.0 },
] as const;

const HEADS: { x: number; z: number }[] = [];
for (const t of TRACKS) {
  const len = Math.hypot(t.x1 - t.x0, t.z1 - t.z0);
  const n = Math.round(len / 1.25);
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    HEADS.push({ x: t.x0 + (t.x1 - t.x0) * f, z: t.z0 + (t.z1 - t.z0) * f });
  }
}

/**
 * Four heads do the lighting; the other twenty-eight are bodies.
 *
 * The four are aimed at cars — which car depends on the focus selection, so
 * the aim is a prop rather than a constant. A spotlight that lands on nothing
 * is a wall washer with better marketing.
 */
function Spotlights({
  state,
  gain,
  aims,
  tint,
}: {
  state: LightState;
  gain: number;
  /** Where the four live heads are pointing, in world space. */
  aims: [number, number, number][];
  /**
   * A colour multiplier for the standard-CRI comparison.
   *
   * Not a separate light: the same fittings, rendering colour badly. See
   * `CarShowroomStage` for why that is the honest way to show it.
   */
  tint: THREE.Color;
}) {
  const budget = BUDGET[useQuality()];
  const ref = useRef<THREE.InstancedMesh>(null);
  const colour = colourOf(state).clone().multiply(tint);
  const out = output(state);
  const glow = aperture(state);
  const lens = useEmissiveMaterial(colour, GAIN.spotEmissive * glow);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    HEADS.forEach((p, i) => {
      m.compose(new THREE.Vector3(p.x, SH.h - 0.34, p.z), q, one);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <group>
      {/* The rails themselves, rotated to their own headings. */}
      {TRACKS.map((t, i) => {
        const len = Math.hypot(t.x1 - t.x0, t.z1 - t.z0);
        const ang = Math.atan2(t.z1 - t.z0, t.x1 - t.x0);
        return (
          <mesh
            key={`tr-${i}`}
            position={[(t.x0 + t.x1) / 2, SH.h - 0.06, (t.z0 + t.z1) / 2]}
            rotation={[0, -ang, 0]}
          >
            <boxGeometry args={[len, 0.1, 0.07]} />
            <meshStandardMaterial color="#17181a" roughness={0.45} metalness={0.4} />
          </mesh>
        );
      })}
      {/* Thirty-two heads, one draw. */}
      <instancedMesh ref={ref} args={[undefined, undefined, HEADS.length]} castShadow>
        <cylinderGeometry args={[0.055, 0.075, 0.2, 20]} />
        <meshStandardMaterial color="#17181a" roughness={0.42} metalness={0.45} />
      </instancedMesh>
      {/* Their lit faces. */}
      {HEADS.map((p, i) => (
        <mesh key={`hl-${i}`} position={[p.x, SH.h - 0.44, p.z]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.05, 20]} />
          <primitive object={lens} attach="material" />
        </mesh>
      ))}

      {aims.slice(0, budget.heads).map((aim, i) => (
        <group key={`sp-${i}`}>
          {MOUNTED && (
            <Spot
              position={[aim[0] + (i % 2 ? 1.6 : -1.6), SH.h - 0.45, aim[2] + (i < 2 ? 2.0 : -2.0)]}
              target={aim}
              angle={0.3}
              penumbra={0.55}
              distance={13}
              decay={1.35}
              intensity={GAIN.spot * out * gain}
              color={colour}
            />
          )}
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* High-CRI product lighting                                           */
/* ------------------------------------------------------------------ */

/**
 * The circuit the room is sold on.
 *
 * Two narrow heads: one in the coffer over the hero platform, one on whatever
 * car the focus has selected. They are a separate circuit rather than a
 * property of the spotlights because that is how a dealership buys them — the
 * high-CRI heads go over the display positions and the standard heads stay on
 * the circulation, and the client needs to see the two states side by side.
 */
function ProductLighting({
  state,
  gain,
  focus,
}: {
  state: LightState;
  gain: number;
  focus: [number, number, number];
}) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const h = SH_PLAN.hero;
  const c = SH_PLAN.coffer;
  const lens = useEmissiveMaterial(colour, 5.5 * glow);

  /**
   * Twelve heads on the ring. Two of them are lights.
   *
   * On the centreline of the rail, not 0.75 m inboard of it. That offset was
   * right while the ring was a metre-wide soffit with room to recess things
   * into; the rail is 180 mm wide now and the heads were hanging in clear air
   * well inside it, which is the one detail in the reference you cannot
   * mistake — every head is bolted to the rail.
   */
  const ring = useMemo(
    () => {
      const k = 1 - c.band / c.rx / 2;
      return Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return {
          x: h.x + Math.cos(a) * k * c.rx,
          z: h.z + Math.sin(a) * k * c.rz,
        };
      });
    },
    [h.x, h.z, c.rx, c.rz, c.band],
  );

  return (
    <group>
      {/*
        Hung under the rail, not standing on top of it.
        
        These sat at `c.y + 0.3`, which was inside the old soffit's depth and
        is now 80 mm clear above the rail's top face — twelve heads floating
        above the ring, lit side up.
      */}
      {ring.map((p, i) => (
        <group key={`pr-${i}`}>
          <mesh position={[p.x, c.y - 0.1, p.z]} castShadow>
            <cylinderGeometry args={[0.05, 0.07, 0.2, 20]} />
            <primitive object={M_TRACK} attach="material" />
          </mesh>
          <mesh position={[p.x, c.y - 0.201, p.z]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.045, 20]} />
            <primitive object={lens} attach="material" />
          </mesh>
        </group>
      ))}
      {/*
        The hero head, far enough forward to reach the nose.

        At 1.4 m in front of the platform the cone pointed down and *away*
        from the camera, so it washed the hero's tail and left the bonnet —
        the surface everyone in the room is looking at — on ambient alone.
        Measured at 35/255 on a car whose flank was at 138. Standing the head
        2.6 m out and opening it to 0.5 rad puts the whole vehicle in the
        pool, which is the point of a display fitting.
      */}
      {MOUNTED && (
        <Spot
          position={[h.x, c.y + 0.2, h.z + 2.6]}
          target={[h.x, 1.1, h.z + 0.4]}
          angle={0.5}
          penumbra={0.5}
          distance={11}
          decay={1.3}
          intensity={GAIN.product * out * gain}
          color={colour}
          castShadow
        />
      )}
      {MOUNTED && (
        <Spot
          position={[focus[0] + 1.2, SH.h - 0.5, focus[2] + 1.8]}
          target={focus}
          angle={0.3}
          penumbra={0.45}
          distance={12}
          decay={1.3}
          intensity={GAIN.product * 0.9 * out * gain}
          color={colour}
        />
      )}
    </group>
  );
}

let glowMap: THREE.CanvasTexture | null = null;
/**
 * One radial white-to-transparent gradient, shared by everything that fakes
 * a wash: the halos on the ceiling cans, the pools on the floor, the warm
 * ring around the podium. Emissive planes illuminate nothing, and the room's
 * light budget cannot afford for them to be real - so every lit element gets
 * an additive gradient where its light would land, which is exactly the
 * pools-not-dimming insight the 2D rooms were built on, in 3D.
 */
function radialGlow(): THREE.CanvasTexture {
  if (!glowMap) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(128, 128, 4, 128, 128, 126);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(0.4, "rgba(255,255,255,0.35)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    glowMap = new THREE.CanvasTexture(c);
  }
  return glowMap;
}

function useGlowMaterial(tint: string, opacity: number) {
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: radialGlow(),
        color: tint,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [tint],
  );
  useLayoutEffect(() => {
    mat.opacity = opacity;
  });
  return mat;
}

const M_TRACK = new THREE.MeshStandardMaterial({
  color: "#17181a",
  roughness: 0.42,
  metalness: 0.45,
});

/* ------------------------------------------------------------------ */
/* Linear                                                              */
/* ------------------------------------------------------------------ */

/** Continuous runs across the flat ceiling and down the slatted bay. */
const LINES = [
  /**
   * Two runs in the white ceiling's step, then three down the timber bay.
   *
   * All of these moved with the shell. The old array ran to x = 25.4 and
   * z = 13 in a room that was 30 x 25; this one is 29 x 36 and the timber bay
   * starts at x = 18, so the three "diagonals" were landing half on plaster.
   *
   * The bay's runs are long in Z, parallel to its fins, because that is what
   * the reference shows: they only look diagonal because they recede. Laying
   * them across the fins would have read as a grid, which it is not.
   */
  { x0: 1.8, z0: 2.4, x1: 10.4, z1: 2.4 },
  { x0: 1.8, z0: 15.6, x1: 1.8, z1: 2.4 },
  { x0: 12.0, z0: 0.5, x1: 12.0, z1: 9.5 },
  { x0: 14.8, z0: 0.5, x1: 14.8, z1: 9.5 },
  { x0: 17.6, z0: 0.5, x1: 17.6, z1: 9.5 },
] as const;

function Linear({ state, gain }: { state: LightState; gain: number }) {
  const budget = BUDGET[useQuality()];
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const mat = useEmissiveMaterial(colour, GAIN.linearEmissive * glow);

  return (
    <group>
      {LINES.map((l, i) => {
        const dx = l.x1 - l.x0;
        const dz = l.z1 - l.z0;
        const len = Math.hypot(dx, dz);
        const angle = Math.atan2(dz, dx);
        const mid: [number, number, number] = [
          (l.x0 + l.x1) / 2,
          i >= 2 ? SH_PLAN.slats.y - 0.17 : SH.h - SH_PLAN.soffit.drop - 0.03,
          (l.z0 + l.z1) / 2,
        ];
        return (
          <group key={`ln-${i}`}>
            <mesh position={mid} rotation={[Math.PI / 2, 0, -angle]}>
              <planeGeometry args={[len, 0.075]} />
              <primitive object={mat} attach="material" />
            </mesh>
            {/* Two of the five carry a light; the rest are their own aperture. */}
            {MOUNTED && (i === 0 || (i === 3 && budget.linear > 1)) && (
              <rectAreaLight
                position={[mid[0], mid[1] - 0.02, mid[2]]}
                rotation={[-Math.PI / 2, 0, -angle]}
                width={len}
                height={0.4}
                intensity={GAIN.linear * out * gain}
                color={colour}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Accent, floor, architectural, RGB                                   */
/* ------------------------------------------------------------------ */

/** Grazing on the brand graphics. */
function Accent({ state, gain }: { state: LightState; gain: number }) {
  const budget = BUDGET[useQuality()];
  const colour = colourOf(state);
  const out = output(state);

  return (
    <group>
      {SH_PLAN.graphics.map((g, i) => (
        <group key={`ac-${i}`}>
          {MOUNTED && i < budget.washers && (
            <Spot
              position={[g.x, SH.h - 0.5, 2.2]}
              target={[g.x, g.y, 0.2]}
              angle={0.5}
              penumbra={0.6}
              distance={11}
              decay={1.3}
              intensity={GAIN.accent * out * gain}
              color={colour}
            />
          )}
        </group>
      ))}
    </group>
  );
}

/**
 * Floor lighting: the ring under the hero platform, and the pathway lines.
 *
 * RGB-capable, because a launch runs colour through it — the ring is the one
 * floor element everybody in the room is already looking at.
 */
function FloorLighting({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const h = SH_PLAN.hero;
  const mat = useEmissiveMaterial(colour, GAIN.floorEmissive * glow);
  const path = useEmissiveMaterial(colour, GAIN.floorEmissive * 0.3 * glow);
  const wash = useGlowMaterial("#ffddb0", 0.22 * out);

  return (
    <group>
      {/* The ring, just proud of the floor at the plinth's foot. */}
      <mesh position={[h.x, 0.045, h.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[h.r + 0.04, h.r + 0.17, 64]} />
        <primitive object={mat} attach="material" />
      </mesh>
      {/*
        And the wash that ring would actually throw: in the reference the
        floor grades warm for about a metre either side of the platform's
        line, and the hard cut from a lit ring straight to dark stone was one
        of the panel's named tells.
      */}
      <mesh position={[h.x, 0.01, h.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[h.r - 0.3, h.r + 1.4, 64]} />
        <primitive object={wash} attach="material" />
      </mesh>
      {MOUNTED && (
        <rectAreaLight
          position={[h.x, 0.1, h.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          width={h.r * 1.2}
          height={h.r * 1.2}
          intensity={GAIN.floor * out * gain}
          color={colour}
        />
      )}
      {/* Pathway lines set into the floor. */}
      {[
        { x: 8.6, z0: 3.0, z1: 17.0 },
        { x: 18.4, z0: 3.0, z1: 17.0 },
      ].map((p, i) => (
        <mesh
          key={`pl-${i}`}
          position={[p.x, 0.012, (p.z0 + p.z1) / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          {/* Dimmer than the ring: a pathway line is a cue, not a feature,
              and at the ring's aperture it read as a stray streak across the
              floor — one of the faults the brief calls out by name. */}
          <planeGeometry args={[0.05, p.z1 - p.z0]} />
          <primitive object={path} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/** Cove along the coffer edge, and the vertical strips in every column. */
function Architectural({ state, gain }: { state: LightState; gain: number }) {
  const budget = BUDGET[useQuality()];
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const mat = useEmissiveMaterial(colour, GAIN.archEmissive * glow);
  const c = SH_PLAN.coffer;
  const h = SH_PLAN.hero;

  return (
    <group>
      {/*
        The lit edge of the ring — the room's signature line.

        Outboard of the rail, which is where the reference puts it: the white
        line reads *around* the dark rail, not down the middle of it. It used
        to sit at `c.r - 0.11`, inside the old wide soffit; against a 180 mm
        rail that is the same surface, and the two coplanar faces z-fought
        along the whole circumference.

        Facing down, and that is the whole of it. `ringGeometry` is drawn in
        the XY plane facing +Z, so -PI/2 about X points it at the sky: the
        first pass put this above the rail with that rotation and the cove was
        simply not there from eye level, on a ring whose brightest feature in
        the photograph is this line.
      */}
      <mesh
        position={[h.x, c.y + 0.02, h.z]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[c.rx, c.rz, 1]}
      >
        <ringGeometry args={[1 + 0.1 / c.rx, 1 + 0.21 / c.rx, 64]} />
        <primitive object={mat} attach="material" />
      </mesh>
      {/* And its inner edge - the reference lights both sides of the ring. */}
      <mesh
        position={[h.x, c.y + 0.02, h.z]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[c.rx, c.rz, 1]}
      >
        <ringGeometry
          args={[1 - (c.band + 0.21) / c.rx, 1 - (c.band + 0.1) / c.rx, 64]}
        />
        <primitive object={mat} attach="material" />
      </mesh>
      {/*
        The canopy's traced outline: one strip along each edge of the plan
        polygon, a hand's width below the panel so the line reads against it.
        This is the ceiling's signature mark in the reference - the angular
        white panel with light drawn around its rim and the ring beneath.
      */}
      {SH_PLAN.canopy.map((pt, i) => {
        const nxt = SH_PLAN.canopy[(i + 1) % SH_PLAN.canopy.length];
        const dx = nxt[0] - pt[0];
        const dz = nxt[1] - pt[1];
        const len = Math.hypot(dx, dz);
        return (
          <mesh
            key={`cny-${i}`}
            position={[(pt[0] + nxt[0]) / 2, SH.h - 0.135, (pt[1] + nxt[1]) / 2]}
            rotation={[Math.PI / 2, 0, -Math.atan2(dz, dx)]}
          >
            <planeGeometry args={[len - 0.08, 0.09]} />
            <primitive object={mat} attach="material" />
          </mesh>
        );
      })}
      {MOUNTED && budget.accentWall && (
        <rectAreaLight
          position={[h.x, c.y - 0.05, h.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          width={c.rx * 2}
          height={c.rz * 2}
          intensity={GAIN.arch * out * gain}
          color={colour}
        />
      )}

      {/*
        The pillar lines.
        
        Offsets come off the pillar's own width - these were hard-coded at 0.4
        for a single 780 mm column, and the plan now carries a 1.6 m clad
        pillar and a 500 mm fin beside it, so both sets of strips were buried
        inside the cladding on one and floating clear of it on the other.

        The fin gets three strips rather than one. In the reference it is the
        brightest vertical in that corner and it is plainly fluted: three
        lines in a narrow dark reveal, which is a different object from the
        single seam that runs down the big pillar.
      */}
      {SH_PLAN.columns.map((col, i) => {
        const fin = col.w < 0.8;
        const lines = fin ? [-0.14, 0, 0.14] : [0];
        return (
          <group key={`cs-${i}`} position={[col.x, 0, col.z]}>
            {lines.map((o, j) => (
              <mesh
                key={`a-${j}`}
                position={[-col.w / 2 - 0.008, SH.h / 2, o]}
                rotation={[0, -Math.PI / 2, 0]}
              >
                <planeGeometry args={[0.055, SH.h - 0.7]} />
                <primitive object={mat} attach="material" />
              </mesh>
            ))}
            {lines.map((o, j) => (
              <mesh
                key={`b-${j}`}
                position={[o, SH.h / 2, col.w / 2 + 0.008]}
              >
                <planeGeometry args={[0.055, SH.h - 0.7]} />
                <primitive object={mat} attach="material" />
              </mesh>
            ))}
            {MOUNTED && i === 1 && (
              <pointLight
                position={[-0.9, 2.6, 0]}
                intensity={GAIN.arch * 0.5 * out * gain}
                distance={7}
                decay={1.6}
                color={colour}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}

/** Full-colour panels on the far right wall. */
function RgbFeature({ state, gain }: { state: LightState; gain: number }) {
  const budget = BUDGET[useQuality()];
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const w = SH_PLAN.rgbWall;
  const span = w.z1 - w.z0;
  const panels = 9;

  /**
   * A gradient across the bands, which is what the wall actually is.
   *
   * One shared emissive material gave nine identical stripes; the reference
   * runs blue at one end to magenta at the other, and that sweep is most of
   * why the wall reads as a feature rather than as a lit panel. Each band
   * gets its own material, hue-shifted either side of whatever the circuit is
   * set to, so a scene that recolours the circuit still recolours the wall and
   * the sweep travels with it.
   */
  const bands = useMemo(
    () =>
      Array.from(
        { length: panels },
        () => new THREE.MeshBasicMaterial({ toneMapped: false }),
      ),
    [],
  );
  useLayoutEffect(() => {
    /*
     * Anchored on blue-to-magenta, NOT derived from the circuit colour.
     *
     * The first pass offset each band's hue from whatever the circuit was
     * set to, and the circuit is tunable *white* - hue 0.07 or so - which
     * put the sweep through red, yellow and green: a flag, not a feature
     * wall. The reference runs blue through violet to magenta, so those are
     * the fixed endpoints and the circuit contributes brightness alone.
     */
    bands.forEach((m, i) => {
      const t = i / (panels - 1);
      m.color.setHSL(0.62 + t * 0.26, 0.85, 0.5 * glow + 0.06);
    });
  });

  return (
    <group>
      {bands.map((m, i) => {
        const z = w.z0 + (span / panels) * (i + 0.5);
        return (
          <mesh
            key={`rg-${i}`}
            position={[w.x, (w.y0 + w.y1) / 2, z]}
            rotation={[0, -Math.PI / 2, 0]}
          >
            <planeGeometry args={[span / panels - 0.08, w.y1 - w.y0]} />
            <primitive object={m} attach="material" />
          </mesh>
        );
      })}
      {/*
        `rectAreaLight` emits along local -Z. +90 degrees of Y sends that to
        -X, into the room. This project has got that axis wrong seven times;
        the sign is worked out here rather than in somebody's head.
      */}
      {MOUNTED && budget.rgb && (
        <rectAreaLight
          position={[w.x - 0.1, (w.y0 + w.y1) / 2, (w.z0 + w.z1) / 2]}
          rotation={[0, Math.PI / 2, 0]}
          width={span}
          height={w.y1 - w.y0}
          intensity={GAIN.rgb * out * gain}
          color={new THREE.Color("#7d5fe8")}
        />
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Daylight                                                            */
/* ------------------------------------------------------------------ */

/** Sun and sky through the glazed frontage behind the camera. */
function Daylight(_: { amount: number }) {
  /**
   * There is no daylight in this room, by the brief: the showroom reads as a
   * sealed, evening space in every scene, and the time slider is allowed a
   * trim of a few per cent on the ambient, nothing more.
   *
   * It is also what finally explained the pegs. A directional sun stood
   * behind the camera here, and with shadows on it projected every track head
   * and lens housing on the ceiling onto the back wall as a neat grid of
   * small dark studs - furniture nobody placed, cast by a sun nobody wanted.
   */
  return null;
}

/* ------------------------------------------------------------------ */

export interface ShowroomFixtures {
  general: LightState;
  spots: LightState;
  product: LightState;
  linear: LightState;
  accent: LightState;
  floor: LightState;
  arch: LightState;
  rgb: LightState;
}

export function CarShowroomLightRig({
  fixtures,
  gain = 1,
  daylight = 0,
  focusId,
  standardCri = false,
}: {
  fixtures: ShowroomFixtures;
  gain?: number;
  /** 0..1 exterior brightness from the simulated clock. */
  daylight?: number;
  /** Which car the adjustable heads are aimed at. */
  focusId?: string;
  /** Render the spotlights as an 80-CRI source rather than a 95+ one. */
  standardCri?: boolean;
}) {
  useLayoutEffect(() => {
    // Area lights render black without their BRDF tables uploaded first.
    RectAreaLightUniformsLib.init();
  }, []);

  const focus = useMemo<[number, number, number]>(() => {
    const car = SH_CARS.find((c) => c.id === focusId) ?? SH_CARS[2];
    return [car.x, 0.9, car.z];
  }, [focusId]);

  /**
   * The standard-CRI tint.
   *
   * An 80 CRI source is not dimmer, it is *missing part of its spectrum* —
   * specifically a trough where deep red belongs, which is why R9 is reported
   * separately from Ra. Modelling it as a multiplier that pulls red down and
   * green up is crude but it is the right crudeness: the red car goes brick,
   * the metallics flatten, and nothing else in the room changes much, which is
   * exactly what a dealership sees.
   */
  const tint = useMemo(
    () => (standardCri ? new THREE.Color(0.86, 1.0, 0.9) : new THREE.Color(1, 1, 1)),
    [standardCri],
  );

  /**
   * Four live heads: two on the focus car, two on the foreground pair.
   *
   * Picked by name rather than by taking the first two off the list, which
   * quietly put a head on a saloon parked behind a column and left the red
   * car — one of the three vehicles actually in shot — with nothing on it at
   * all. It read as a flat red mass because it was lit like one.
   */
  const aims = useMemo<[number, number, number][]>(() => {
    const priority = ["coupe", "sport", "sedan", "white", "black"];
    const others = priority
      .filter((id) => id !== (focusId ?? "suv"))
      .slice(0, 2)
      .flatMap((id) => SH_CARS.filter((c) => c.id === id));
    const list: [number, number, number][] = [
      focus,
      [focus[0], 0.9, focus[2]],
      ...others.map((c): [number, number, number] => [c.x, 0.9, c.z]),
    ];
    return list.slice(0, 4);
  }, [focus, focusId]);

  return (
    <group>
      <Daylight amount={daylight} />
      <Downlights state={fixtures.general} gain={gain} />
      <Spotlights state={fixtures.spots} gain={gain} aims={aims} tint={tint} />
      <ProductLighting state={fixtures.product} gain={gain} focus={focus} />
      <Linear state={fixtures.linear} gain={gain} />
      <Accent state={fixtures.accent} gain={gain} />
      <FloorLighting state={fixtures.floor} gain={gain} />
      <Architectural state={fixtures.arch} gain={gain} />
      <RgbFeature state={fixtures.rgb} gain={gain} />
    </group>
  );
}
