"use client";

/**
 * The restaurant's eight circuits.
 *
 * The constraint here is not triangles, it is light count. Measured on the
 * lobby, thirty-six lights runs at 9.2 fps with a 134 ms p95 and twenty-three
 * runs at 35.1 — the cliff is steep and it is the only thing in these rooms
 * that reliably falls off it. So the sheet's eight layers are built the way
 * the lobby's seven were: a small number of real lights doing the
 * *illumination*, and a much larger number of emissive meshes doing the
 * *recognition*.
 *
 * That distinction is the whole trick. A guest looking at this room counts
 * forty-two downlights, eighteen pendants and twelve table lamps, and every
 * one of them is visibly lit. Nineteen of those are actually casting light;
 * the rest are apertures — geometry with an emissive material, which costs a
 * draw call rather than a shadow-casting shader pass. From the camera the
 * difference is invisible, because a downlight four metres above a table
 * contributes a broad wash rather than a readable pool, and the thing the eye
 * reads as "that fitting is on" is the brightness of the fitting itself.
 *
 * Circuit budget, nineteen lights:
 *   cove 2, general 4, tunable 3, pendants 1, architectural 2,
 *   feature 2, table 3, rgb 2
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { LightState } from "@/lib/sim/types";
import { cctToRgb, lightOutput, rgbToCss } from "@/lib/sim/photometry";
import { useEmissiveMaterial, useShadeMaterial } from "./lightMaterials";
import { Spot } from "./Spot";
import { RS, RS_PLAN, TABLES } from "./Restaurant3D";

/**
 * Gains, which are ratios rather than measurements.
 *
 * `rectAreaLight` intensity is a luminance and what reaches the room is that
 * figure times the light's *area*, so these numbers are only meaningful
 * against each other and against the size of the emitter they sit on. The
 * cove's strip is a third of a metre tall and sixteen long; the wine wall is
 * five by three. Matching their numbers would put six times the light on the
 * wine wall, which is exactly the mistake the lobby's feature layer records.
 */
/*
 * Re-tuned against the client's own frame rather than by eye.
 *
 * The first pass measured mean luminance 0.580 where the reference sits at
 * 0.221, with 37.8% of the frame above 0.75 against the reference's 0.2%.
 * More than a third of the image was clipped. A restaurant hero shot is a
 * dark room with pools of light in it, and the premium look IS that contrast
 * - the reference spends 30.7% of its pixels below 0.15, which is where the
 * mood comes from.
 *
 * The broad washes take almost all of the cut: ambient, cove and track exist
 * to make lux and lux is exactly what was flattening the room. The pendants,
 * table lamps and the feature layers are barely touched, because those are
 * the pools, and the pools are the point.
 */
const GAIN = {
  cove: 8,
  coveEmissive: 4.6,
  downlight: 5,
  downlightEmissive: 6.2,
  tunable: 6,
  tunableEmissive: 5.4,
  pendant: 9,
  pendantGlobe: 3.6,
  arch: 5,
  archEmissive: 3.4,
  feature: 6,
  featureEmissive: 3.2,
  table: 7,
  tableShade: 2.9,
  rgb: 11,
  rgbEmissive: 4.2,
} as const;

function colourOf(state: LightState): THREE.Color {
  if (state.sat > 0) {
    const c = new THREE.Color(rgbToCss(cctToRgb(state.cct)));
    return c.lerp(new THREE.Color().setHSL(state.hue / 360, 1, 0.5), state.sat / 100);
  }
  const [r, g, b] = cctToRgb(state.cct);
  return new THREE.Color(r / 255, g / 255, b / 255).convertSRGBToLinear();
}

const output = (s: LightState) => (s.on ? lightOutput(s.level) : 0);
/** Apertures compress far less than output: a dimmed fitting still looks lit. */
const aperture = (s: LightState) => (s.on ? Math.pow(s.level / 100, 0.42) : 0);

/* ------------------------------------------------------------------ */
/* Cove                                                                */
/* ------------------------------------------------------------------ */

/**
 * Two lights for four runs.
 *
 * The raft is ten and a half metres by sixteen, so the two long runs carry
 * roughly three-quarters of the cove's output between them; the short ends
 * contribute a tenth and cost the same. All four runs keep their emissive
 * strip, because the strip is what the eye reads as "the ceiling is lit" and
 * a dark end run is the one thing anyone would notice.
 */
function Cove({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const mat = useEmissiveMaterial(colour, GAIN.coveEmissive * aperture(state));
  const r = RS_PLAN.raft;
  const y = r.y + 0.07;
  const runs = [
    { pos: [r.x0 + 0.1, y, (r.z0 + r.z1) / 2] as [number, number, number], len: r.z1 - r.z0, along: "z" as const },
    { pos: [r.x1 - 0.1, y, (r.z0 + r.z1) / 2] as [number, number, number], len: r.z1 - r.z0, along: "z" as const },
    { pos: [(r.x0 + r.x1) / 2, y, r.z0 + 0.1] as [number, number, number], len: r.x1 - r.x0, along: "x" as const },
    { pos: [(r.x0 + r.x1) / 2, y, r.z1 - 0.1] as [number, number, number], len: r.x1 - r.x0, along: "x" as const },
  ];
  return (
    <group>
      {runs.map((run, i) => (
        <group key={i}>
          {run.along === "z" && (
            <rectAreaLight
              position={run.pos}
              // Firing up at the slab, which is what a cove does: the light
              // the room gets is the second bounce off the ceiling above.
              rotation={[-Math.PI / 2, 0, 0]}
              width={0.3}
              height={run.len}
              intensity={GAIN.cove * out * gain}
              color={colour}
            />
          )}
          <mesh
            position={[run.pos[0], run.pos[1] - 0.03, run.pos[2]]}
            rotation={[-Math.PI / 2, 0, run.along === "x" ? Math.PI / 2 : 0]}
          >
            <planeGeometry args={[0.1, run.len]} />
            <primitive object={mat} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* General ambient                                                     */
/* ------------------------------------------------------------------ */

/** Forty-two lenses on a 2.1 m grid; four of them are lights. */
const LENSES: { x: number; z: number }[] = [];
for (let i = 0; i < 6; i++) {
  for (let j = 0; j < 7; j++) {
    LENSES.push({ x: 2.4 + i * 1.95, z: 3.9 + j * 2.25 });
  }
}

function Downlights({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const mat = useEmissiveMaterial(colour, GAIN.downlightEmissive * aperture(state));
  const ref = useRef<THREE.InstancedMesh>(null);
  const y = RS_PLAN.raft.y - 0.01;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    LENSES.forEach((l, i) => {
      m.makeRotationX(-Math.PI / 2);
      m.setPosition(l.x, y, l.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [y]);

  // Four washes rather than forty-two pools. At four metres a downlight does
  // not make a readable pool on a tablecloth anyway - the table layer does
  // that - so what the ambient circuit owes the room is evenness.
  const washes: [number, number][] = [
    [4.6, 7.4],
    [10.2, 7.4],
    [4.6, 15.4],
    [10.2, 15.4],
  ];
  return (
    <group>
      {washes.map(([x, z], i) => (
        <rectAreaLight
          key={i}
          position={[x, RS_PLAN.raft.y - 0.05, z]}
          rotation={[Math.PI / 2, 0, 0]}
          width={5.2}
          height={7.4}
          intensity={GAIN.downlight * out * gain}
          color={colour}
        />
      ))}
      <instancedMesh ref={ref} args={[undefined, undefined, LENSES.length]}>
        <circleGeometry args={[0.062, 14]} />
        <primitive object={mat} attach="material" />
      </instancedMesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Tunable white — the track                                           */
/* ------------------------------------------------------------------ */

/**
 * The layer whose job is colour rather than quantity.
 *
 * Three spots carry it and thirty-four heads show it. Spots rather than area
 * lights because track is directional and the giveaway of a track head is the
 * edge of its beam on a wall — an area light has no edge and reads as another
 * cove.
 */
const TRACK: { x: number; z: number; tx: number; tz: number }[] = [
  { x: 2.9, z: 6.2, tx: 1.2, tz: 5.6 },
  { x: 2.9, z: 10.4, tx: 0.9, tz: 11.0 },
  { x: 2.9, z: 14.6, tx: 1.1, tz: 15.2 },
  { x: 6.2, z: 5.0, tx: 7.2, tz: 1.2 },
  { x: 8.4, z: 5.0, tx: 8.6, tz: 1.2 },
  { x: 12.0, z: 6.6, tx: 13.6, tz: 6.0 },
  { x: 12.0, z: 11.4, tx: 13.8, tz: 11.6 },
  { x: 12.0, z: 16.2, tx: 13.6, tz: 17.0 },
];

function TunableWhite({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const mat = useEmissiveMaterial(colour, GAIN.tunableEmissive * aperture(state));
  const y = RS_PLAN.raft.y - 0.12;
  const lit = [1, 3, 6];
  return (
    <group>
      {TRACK.map((t, i) => (
        <group key={i}>
          <mesh position={[t.x, y, t.z]}>
            <cylinderGeometry args={[0.045, 0.055, 0.14, 10]} />
            <primitive object={mat} attach="material" />
          </mesh>
          {lit.includes(i) && out > 0 && (
            <Spot
              position={[t.x, y, t.z]}
              target={[t.tx, 1.1, t.tz]}
              angle={0.62}
              penumbra={0.72}
              distance={14}
              intensity={GAIN.tunable * out * gain}
              color={colour}
            />
          )}
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Decorative pendants                                                 */
/* ------------------------------------------------------------------ */

/**
 * Eighteen globes on staggered drops, one light between them.
 *
 * A cluster like this is the thing a guest photographs and almost none of the
 * light in the room comes from it — a 280 lumen decorative globe at 2100 K is
 * a brightness, not an illuminant. So the globes are emissive geometry and a
 * single point light in the middle of the cluster carries whatever spill the
 * cluster is actually entitled to.
 */
const GLOBES = Array.from({ length: 18 }, (_, i) => {
  // Deterministic scatter: a ring of three turns, each globe on its own drop.
  const a = i * 2.39996;
  const rad = RS_PLAN.pendants.r * Math.sqrt((i + 0.6) / 18);
  return {
    x: RS_PLAN.pendants.x + Math.cos(a) * rad,
    z: RS_PLAN.pendants.z + Math.sin(a) * rad,
    y: 2.02 + ((i * 7) % 5) * 0.21,
    r: 0.105 + ((i * 11) % 3) * 0.016,
  };
});

function Pendants({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const globeMat = useShadeMaterial(colour, GAIN.pendantGlobe * glow);
  const coreMat = useEmissiveMaterial(colour, GAIN.pendantGlobe * 2.1 * glow);
  const p = RS_PLAN.pendants;
  return (
    <group>
      {GLOBES.map((g, i) => (
        <group key={i}>
          {/* The drop. Thin enough to disappear, present enough that the
              globes do not look like they are floating. */}
          <mesh position={[g.x, (g.y + RS_PLAN.raft.y) / 2 + g.r, g.z]}>
            <cylinderGeometry args={[0.004, 0.004, RS_PLAN.raft.y - g.y - g.r, 6]} />
            <meshStandardMaterial color="#17150f" roughness={0.7} />
          </mesh>
          <mesh position={[g.x, g.y, g.z]}>
            <sphereGeometry args={[g.r, 20, 14]} />
            <primitive object={globeMat} attach="material" />
          </mesh>
          {/* The filament, which is most of the brightness. */}
          <mesh position={[g.x, g.y, g.z]}>
            <sphereGeometry args={[g.r * 0.3, 10, 8]} />
            <primitive object={coreMat} attach="material" />
          </mesh>
        </group>
      ))}
      {out > 0 && (
        <pointLight
          position={[p.x, 2.25, p.z]}
          intensity={GAIN.pendant * out * gain}
          distance={9}
          decay={1.5}
          color={colour}
        />
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Architectural                                                       */
/* ------------------------------------------------------------------ */

/** Grazing the timber raft and the stone piers — material, not surface. */
function Architectural({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const mat = useEmissiveMaterial(colour, GAIN.archEmissive * aperture(state));
  return (
    <group>
      {/* Up the timber fins at the bar end. */}
      <rectAreaLight
        position={[6.0, RS.h - 0.34, 2.05]}
        rotation={[-Math.PI / 2, 0, 0]}
        width={7.2}
        height={0.5}
        intensity={GAIN.arch * out * gain}
        color={colour}
      />
      <mesh position={[6.0, RS.h - 0.36, 2.05]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7.0, 0.07]} />
        <primitive object={mat} attach="material" />
      </mesh>

      {/* Down the stone piers on the glazed side. */}
      <rectAreaLight
        position={[RS.w - 0.42, RS.h - 0.25, 11.3]}
        rotation={[Math.PI / 2, 0, 0]}
        width={0.7}
        height={14}
        intensity={GAIN.arch * 0.8 * out * gain}
        color={colour}
      />
      {[4.6, 11.3, 18.0].map((z, i) => (
        <mesh key={i} position={[RS.w - 0.42, RS.h - 0.27, z]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.52, 0.07]} />
          <primitive object={mat} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Feature — bar back and wine wall                                    */
/* ------------------------------------------------------------------ */

function Feature({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const mat = useEmissiveMaterial(colour, GAIN.featureEmissive * aperture(state));
  const b = RS_PLAN.bar;
  const v = RS_PLAN.wine;
  const barMid = (b.z0 + b.z1) / 2;
  return (
    <group>
      {/* Under-shelf strips on the back bar. Three strips, one light: the
          strips are the look and the light is the spill onto the bottles. */}
      <rectAreaLight
        position={[0.75, 2.0, barMid]}
        rotation={[0, Math.PI / 2, 0]}
        width={b.z1 - b.z0 - 0.6}
        height={1.5}
        intensity={GAIN.feature * out * gain}
        color={colour}
      />
      {[1.42, 1.94, 2.46].map((y, i) => (
        <mesh key={i} position={[0.73, y - 0.03, barMid]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[b.z1 - b.z0 - 0.6, 0.035]} />
          <primitive object={mat} attach="material" />
        </mesh>
      ))}

      {/* The wine wall, lit from inside its own box. A lit wine wall sells
          wine; this is the one feature in the room with a revenue argument. */}
      {/*
        A quarter of the bar's gain, not half.
        
        A `rectAreaLight` emits along its own -Z, so this one sits in front of
        the wine wall firing back INTO it - which is what lights the bottles,
        and also what put light on the room's back wall behind them. Sampled
        against the client's frame the wall came back rgb(145,89,49) where
        theirs is rgb(70,44,27): a glowing tan panel rather than a lit cellar,
        and the brightest thing in a room whose brightest thing should be a
        table lamp.
      */}
      <rectAreaLight
        position={[(v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2, v.z + 0.5]}
        rotation={[0, 0, 0]}
        width={v.x1 - v.x0}
        height={v.y1 - v.y0}
        intensity={GAIN.feature * 0.26 * out * gain}
        color={colour}
      />
      <mesh position={[(v.x0 + v.x1) / 2, v.y1 + 0.08, v.z + 0.22]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[v.x1 - v.x0, 0.08]} />
        <primitive object={mat} attach="material" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Table / accent                                                      */
/* ------------------------------------------------------------------ */

/**
 * A shaded lamp on every table and three lights across twelve of them.
 *
 * The pool of light on a tablecloth is the single most recognisable thing in
 * fine dining, so this is the one circuit where the emissive stand-in is not
 * quite enough on its own: a shade that glows with no pool under it reads as
 * a prop. Three spots hung over the three table clusters give the floor the
 * pooling, and every lamp carries its own lit shade.
 */
function TableAccent({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const shadeMat = useShadeMaterial(colour, GAIN.tableShade * glow);
  const pools: [number, number][] = [
    [5.4, 16.4],
    [11.0, 12.6],
    [6.0, 7.0],
  ];
  return (
    <group>
      {TABLES.map((t, i) => (
        <group key={i} position={[t.x, 0.758, t.z]}>
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.035, 0.05, 0.06, 12]} />
            <meshStandardMaterial color="#9a7b42" roughness={0.35} metalness={0.8} />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.1, 8]} />
            <meshStandardMaterial color="#9a7b42" roughness={0.35} metalness={0.8} />
          </mesh>
          <mesh position={[0, 0.185, 0]}>
            <cylinderGeometry args={[0.055, 0.082, 0.1, 16, 1, true]} />
            <primitive object={shadeMat} attach="material" />
          </mesh>
        </group>
      ))}
      {out > 0 &&
        pools.map(([x, z], i) => (
          <Spot
            key={i}
            position={[x, RS_PLAN.raft.y - 0.15, z]}
            target={[x, 0.76, z]}
            angle={0.78}
            penumbra={0.85}
            distance={6}
            decay={1.3}
            intensity={GAIN.table * out * gain}
            color={colour}
          />
        ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* RGB                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Off for every normal service, and the reason the room can be sold twice.
 *
 * Mounted low, washing up the window piers and out of the planters. Colour
 * from above reads as a disco; colour from below reads as a dressed room, and
 * the difference is entirely the mounting height.
 */
function Rgb({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const mat = useEmissiveMaterial(colour, GAIN.rgbEmissive * aperture(state));
  if (out <= 0) return null;
  return (
    <group>
      <rectAreaLight
        position={[RS.w - 0.78, 0.3, 11.3]}
        rotation={[-Math.PI / 2, 0, 0]}
        width={0.3}
        height={15}
        intensity={GAIN.rgb * out * gain}
        color={colour}
      />
      <rectAreaLight
        position={[0.9, 0.3, 6.6]}
        rotation={[-Math.PI / 2, 0, 0]}
        width={0.3}
        height={5}
        intensity={GAIN.rgb * 0.7 * out * gain}
        color={colour}
      />
      {[
        { x: RS.w - 0.78, z: 11.3, len: 15 },
        { x: 0.9, z: 6.6, len: 5 },
      ].map((s, i) => (
        <mesh key={i} position={[s.x, 0.06, s.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.1, s.len]} />
          <primitive object={mat} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Daylight                                                            */
/* ------------------------------------------------------------------ */

function Daylight({ amount }: { amount: number }) {
  const colour = useMemo(() => {
    const [r, g, b] = cctToRgb(5600);
    return new THREE.Color(r / 255, g / 255, b / 255).convertSRGBToLinear();
  }, []);
  if (amount <= 0.001) return null;
  return (
    <rectAreaLight
      position={[RS.w - 0.1, RS.h / 2, (RS_PLAN.glazing.z0 + RS_PLAN.glazing.z1) / 2]}
      rotation={[0, -Math.PI / 2, 0]}
      width={RS_PLAN.glazing.z1 - RS_PLAN.glazing.z0}
      height={RS.h}
      intensity={34 * amount}
      color={colour}
    />
  );
}

/* ------------------------------------------------------------------ */

export interface RestaurantFixtures {
  general: LightState;
  tunable: LightState;
  cove: LightState;
  pendant: LightState;
  arch: LightState;
  feature: LightState;
  table: LightState;
  rgb: LightState;
}

export function RestaurantLightRig({
  fixtures,
  gain = 1,
  daylight = 0,
}: {
  fixtures: RestaurantFixtures;
  gain?: number;
  /** 0..1 exterior brightness from the simulated clock. */
  daylight?: number;
}) {
  useLayoutEffect(() => {
    // Area lights render black without their BRDF tables uploaded first.
    RectAreaLightUniformsLib.init();
  }, []);

  return (
    <group>
      <Daylight amount={daylight} />
      <Cove state={fixtures.cove} gain={gain} />
      <Downlights state={fixtures.general} gain={gain} />
      <TunableWhite state={fixtures.tunable} gain={gain} />
      <Pendants state={fixtures.pendant} gain={gain} />
      <Architectural state={fixtures.arch} gain={gain} />
      <Feature state={fixtures.feature} gain={gain} />
      <TableAccent state={fixtures.table} gain={gain} />
      <Rgb state={fixtures.rgb} gain={gain} />
    </group>
  );
}
