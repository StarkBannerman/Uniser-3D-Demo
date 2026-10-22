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
  downlight: 44,
  downlightEmissive: 6,
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
  linearEmissive: 4.2,
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
  floorEmissive: 4,
  arch: 12,
  archEmissive: 3.6,
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
for (let i = 0; i < 9; i++) {
  for (let j = 0; j < 6; j++) {
    const x = 1.6 + i * 2.85;
    const z = 1.7 + j * 2.95;
    // The coffer is a hole in the ceiling; nothing is recessed into it.
    const dx = x - SH_PLAN.hero.x;
    const dz = z - SH_PLAN.hero.z;
    if (Math.hypot(dx, dz) < SH_PLAN.coffer.r + 0.5) continue;
    LENSES.push({ x, z });
  }
}

const DOWN_EMITTERS = [
  { x: 4.6, z: 4.4 },
  { x: 4.6, z: 14.2 },
  { x: 11.5, z: 16.0 },
  { x: 19.0, z: 15.4 },
  { x: 21.5, z: 7.0 },
  { x: 13.0, z: 2.6 },
] as const;

function Downlights({ state, gain }: { state: LightState; gain: number }) {
  const budget = BUDGET[useQuality()];
  const ref = useRef<THREE.InstancedMesh>(null);
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const lens = useEmissiveMaterial(colour, GAIN.downlightEmissive * glow);
  const y = SH.h - 0.015;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const one = new THREE.Vector3(1, 1, 1);
    LENSES.forEach((p, i) => {
      m.compose(new THREE.Vector3(p.x, y, p.z), rot, one);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [y]);

  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, LENSES.length]}>
        <circleGeometry args={[0.075, 14]} />
        <primitive object={lens} attach="material" />
      </instancedMesh>
      {DOWN_EMITTERS.slice(0, budget.downlights).map((p, i) => (
        <group key={`dl-${i}`}>
          {MOUNTED && (
            <Spot
              position={[p.x, SH.h - 0.05, p.z]}
              target={[p.x, 0, p.z]}
              angle={0.82}
              penumbra={0.86}
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
const TRACKS = [
  { x0: 2.2, x1: 16.0, z: 5.0 },
  { x0: 2.2, x1: 16.0, z: 11.6 },
  { x0: 17.0, x1: 25.0, z: 8.6 },
] as const;

const HEADS: { x: number; z: number }[] = [];
for (const t of TRACKS) {
  const n = Math.round((t.x1 - t.x0) / 1.25);
  for (let i = 0; i < n; i++) {
    HEADS.push({ x: t.x0 + 0.6 + i * 1.25, z: t.z });
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
      {/* The track itself. */}
      {TRACKS.map((t, i) => (
        <mesh key={`tr-${i}`} position={[(t.x0 + t.x1) / 2, SH.h - 0.06, t.z]}>
          <boxGeometry args={[t.x1 - t.x0, 0.1, 0.07]} />
          <meshStandardMaterial color="#17181a" roughness={0.45} metalness={0.4} />
        </mesh>
      ))}
      {/* Thirty-two heads, one draw. */}
      <instancedMesh ref={ref} args={[undefined, undefined, HEADS.length]} castShadow>
        <cylinderGeometry args={[0.055, 0.075, 0.2, 12]} />
        <meshStandardMaterial color="#17181a" roughness={0.42} metalness={0.45} />
      </instancedMesh>
      {/* Their lit faces. */}
      {HEADS.map((p, i) => (
        <mesh key={`hl-${i}`} position={[p.x, SH.h - 0.44, p.z]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.05, 10]} />
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
      const rr = c.r - c.band / 2;
      return Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return { x: h.x + Math.cos(a) * rr, z: h.z + Math.sin(a) * rr };
      });
    },
    [h.x, h.z, c.r, c.band],
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
            <cylinderGeometry args={[0.05, 0.07, 0.2, 10]} />
            <primitive object={M_TRACK} attach="material" />
          </mesh>
          <mesh position={[p.x, c.y - 0.201, p.z]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.045, 10]} />
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
   * The chevron in the dropped soffit, which is the ceiling's whole structure
   * in the reference: one long run across the back and one down the left,
   * meeting at a corner that frames the display floor.
   *
   * These used to be two parallel runs lying flat on the ceiling at z = 2.4
   * and z = 17.4. Flush strips on a flat plane read as strip lights; the same
   * strips in the corner of a 400 mm step read as architecture, which is what
   * the photograph shows and what the left half of our frame was missing —
   * it was an unbroken grey field with nothing in it but downlight housings.
   * They sit on the soffit's underside now; see `SH_PLAN.soffit`.
   */
  { x0: 2.4, z0: 4.4, x1: 15.9, z1: 4.4 },
  { x0: 2.4, z0: 16.9, x1: 2.4, z1: 4.4 },
  // The diagonals in the slatted bay, which is what the sheet shows.
  { x0: 16.4, z0: 1.0, x1: 25.4, z1: 5.4 },
  { x0: 16.4, z0: 5.0, x1: 25.4, z1: 9.4 },
  { x0: 16.4, z0: 9.0, x1: 25.4, z1: 13.0 },
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

  return (
    <group>
      {/* The ring, just proud of the floor at the plinth's foot. */}
      <mesh position={[h.x, 0.045, h.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[h.r + 0.04, h.r + 0.17, 64]} />
        <primitive object={mat} attach="material" />
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
      <mesh position={[h.x, c.y + 0.02, h.z]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[c.r + 0.10, c.r + 0.21, 64]} />
        <primitive object={mat} attach="material" />
      </mesh>
      {MOUNTED && budget.accentWall && (
        <rectAreaLight
          position={[h.x, c.y - 0.05, h.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          width={c.r * 2}
          height={c.r * 2}
          intensity={GAIN.arch * out * gain}
          color={colour}
        />
      )}

      {SH_PLAN.columns.map((col, i) => (
        <group key={`cs-${i}`} position={[col.x, 0, col.z]}>
          {[
            { p: [-0.4, SH.h / 2, 0] as [number, number, number], r: -Math.PI / 2 },
            { p: [0, SH.h / 2, 0.4] as [number, number, number], r: 0 },
          ].map((f, j) => (
            <mesh key={j} position={f.p} rotation={[0, f.r, 0]}>
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
      ))}
    </group>
  );
}

/** Full-colour panels on the far right wall. */
function RgbFeature({ state, gain }: { state: LightState; gain: number }) {
  const budget = BUDGET[useQuality()];
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const mat = useEmissiveMaterial(colour, GAIN.rgbEmissive * glow);
  const w = SH_PLAN.rgbWall;
  const span = w.z1 - w.z0;
  const panels = 7;

  return (
    <group>
      {Array.from({ length: panels }, (_, i) => {
        const z = w.z0 + (span / panels) * (i + 0.5);
        return (
          <mesh
            key={`rg-${i}`}
            position={[w.x, (w.y0 + w.y1) / 2, z]}
            rotation={[0, -Math.PI / 2, 0]}
          >
            <planeGeometry args={[span / panels - 0.12, w.y1 - w.y0]} />
            <primitive object={mat} attach="material" />
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
          color={colour}
        />
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Daylight                                                            */
/* ------------------------------------------------------------------ */

/** Sun and sky through the glazed frontage behind the camera. */
function Daylight({ amount }: { amount: number }) {
  const budget = BUDGET[useQuality()];
  if (amount <= 0.004) return null;

  return (
    <group>
      <directionalLight
        position={[SH.w / 2 + 6, 14, SH.d + 16]}
        intensity={2.2 * amount}
        color={new THREE.Color("#fff2dd")}
        castShadow={budget.shadows > 1}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0011}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
      {/*
        The frontage is at z = d, so -Z is into the room. No rotation.

        Toned down and taken most of the way to white against the reference.
        This is a 28 m emitter and at intensity 9 it was the largest single
        source in the room — the ceiling came back at B/R 1.00 in the morning
        scene, bluer than its own paint, against 0.76 in the photograph, and
        the evening scenes measured 0.60 because they switch this off and show
        what the fittings alone are doing. North light really is that blue;
        a showroom's frontage is also tinted glass with a canopy over it, and
        the reference is the client's own picture of what they expect to see.
      */}
      <rectAreaLight
        position={[SH.w / 2, 2.6, SH.d - 0.3]}
        width={SH.w - 2}
        height={4.6}
        intensity={5.5 * amount}
        color={new THREE.Color("#e9edf3")}
      />
    </group>
  );
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
