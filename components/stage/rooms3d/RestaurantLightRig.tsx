"use client";

/**
 * The restaurant's eight circuits.
 *
 * The constraint is light count, not triangles. Measured on the lobby,
 * thirty-six lights runs at 9.2 fps with a 134 ms p95 and twenty-three runs
 * at 35.1 - the cliff is steep and it is the only thing in these rooms that
 * reliably falls off it. So the brief's eight layers are built the way the
 * lobby's seven were: a small number of real lights doing the
 * *illumination*, and a much larger number of emissive meshes doing the
 * *recognition*.
 *
 * A guest counts sixteen downlights, fifteen track heads, eight pendants and
 * fourteen table lamps, all visibly lit. Eighteen of those cast anything. The
 * rest are apertures, which cost a draw call rather than a shadow pass, and
 * from the camera the difference is invisible: a downlight four metres above
 * a table makes a broad wash, not a readable pool, and what the eye reads as
 * "that fitting is on" is the brightness of the fitting itself.
 *
 * Budget, eighteen lights: cove 2, downlights 3, track 3, pendants 1,
 * architectural 2, feature 2, table 3, rgb 2.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { LightState } from "@/lib/sim/types";
import { cctToRgb, lightOutput, rgbToCss } from "@/lib/sim/photometry";
import { useEmissiveMaterial, useShadeMaterial } from "./lightMaterials";
import { Spot } from "./Spot";
import { RS, RS_PLAN, SOFFIT_EDGE, SOFFIT_Y, TABLES, TOP_Y } from "./RestaurantPlan";

/**
 * Gains, which are ratios rather than measurements.
 *
 * `rectAreaLight` intensity is a luminance: what reaches the room is that
 * figure times the emitter's AREA. So these only mean anything against each
 * other and against the size of the surface they sit on. The cove strip is
 * 0.3 m deep; the wine cabinet is 3.2 by 3.7. Matching their numbers would
 * put ten times the light on the cabinet.
 */
const GAIN = {
  cove: 34,
  coveEmissive: 5.0,
  downlight: 20,
  downlightEmissive: 6.2,
  track: 26,
  trackEmissive: 5.4,
  pendant: 26,
  pendantGlobe: 3.8,
  arch: 19,
  archEmissive: 3.6,
  feature: 18,
  featureEmissive: 3.4,
  table: 18,
  tableShade: 3.0,
  rgb: 26,
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
 * The curve, which is the brightest line in the frame.
 *
 * Strips run the whole arc - forty-four segments along the shared edge - and
 * two rect-area lights do the work. The strips are what the camera reads as
 * the soffit being lit; the lights are what puts anything on the ceiling
 * above it. A dark segment anywhere along that curve is the one fault a
 * viewer would notice instantly, which is why every segment is lit and only
 * two of them cost a light.
 */
function Cove({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const mat = useEmissiveMaterial(colour, GAIN.coveEmissive * aperture(state));
  /**
   * One continuous ribbon, not forty-four planes.
   *
   * Laid out as separate quads the cove came back as a dashed line: each
   * segment is a flat plane and the curve turns between them, so every joint
   * opened a wedge. Overlapping them hides it on a gentle bend and crosses
   * them on a tight one. A single strip built from the shared curve has no
   * joints to open, and it is one draw call rather than forty-four.
   */
  const ribbon = useMemo(() => {
    const pos: number[] = [];
    const idx: number[] = [];
    const H = 0.1;
    SOFFIT_EDGE.forEach((p, i) => {
      pos.push(p.x, SOFFIT_Y + 0.12, p.y, p.x, SOFFIT_Y + 0.12 - H, p.y);
      if (i < SOFFIT_EDGE.length - 1) {
        const a0 = i * 2;
        idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <group>
      {/*
        Vertical, on the soffit's edge face, pointing at the camera.
        
        These were laid flat facing UP, which is where a cove strip actually
        sits - and they rendered as nothing at all, because a plane is
        single-sided and the camera was looking at the back of every one. The
        brief's dominant glowing line was not dim, it was culled.
        
        A real cove is a hidden source and a lit surface. Here the lit surface
        has to be the line itself, so the strip sits on the edge face where
        the camera can see it and the up-firing lights below do the rest.
      */}
      <mesh geometry={ribbon}>
        <primitive object={mat} attach="material" />
      </mesh>
      {out > 0 &&
        [0.3, 0.72].map((t, i) => {
          const p = SOFFIT_EDGE[Math.round(t * (SOFFIT_EDGE.length - 1))];
          return (
            <rectAreaLight
              key={i}
              position={[p.x, SOFFIT_Y + 0.1, p.y]}
              rotation={[-Math.PI / 2, 0, 0]}
              width={9}
              height={0.5}
              intensity={GAIN.cove * out * gain}
              color={colour}
            />
          );
        })}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* General ambient — recessed downlights                               */
/* ------------------------------------------------------------------ */

/** Sixteen lenses on the flat ceiling left of the soffit; three are lights. */
const LENSES: { x: number; z: number }[] = [];
for (let i = 0; i < 4; i++) {
  for (let j = 0; j < 4; j++) {
    LENSES.push({ x: -9.2 + i * 2.5, z: -2.4 - j * 3.0 });
  }
}

function Downlights({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const mat = useEmissiveMaterial(colour, GAIN.downlightEmissive * aperture(state));
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    LENSES.forEach((l, i) => {
      m.makeRotationX(-Math.PI / 2);
      m.setPosition(l.x, RS.h - 0.01, l.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  const washes: [number, number][] = [
    [-7.4, -4.0],
    [-7.4, -10.0],
    [1.0, -12.5],
  ];
  return (
    <group>
      {out > 0 &&
        washes.map(([x, z], i) => (
          <rectAreaLight
            key={i}
            position={[x, RS.h - 0.06, z]}
            rotation={[Math.PI / 2, 0, 0]}
            width={6.4}
            height={7.0}
            intensity={GAIN.downlight * out * gain}
            color={colour}
          />
        ))}
      <instancedMesh ref={ref} args={[undefined, undefined, LENSES.length]}>
        <circleGeometry args={[0.045, 14]} />
        <primitive object={mat} attach="material" />
      </instancedMesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Tunable white — the two track rails                                 */
/* ------------------------------------------------------------------ */

/**
 * The layer whose job is colour rather than quantity.
 *
 * Spots rather than area lights, because track is directional and the
 * giveaway of a track head is the edge of its beam on a wall. An area light
 * has no edge and reads as another cove.
 */
function TunableWhite({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const mat = useEmissiveMaterial(colour, GAIN.trackEmissive * aperture(state));

  const heads = useMemo(() => {
    const list: { x: number; y: number; z: number; lit: boolean }[] = [];
    RS_PLAN.rails.forEach((r, ri) => {
      for (let i = 0; i < r.heads; i++) {
        const t = (i + 0.5) / r.heads;
        list.push({
          x: r.x0 + (r.x1 - r.x0) * t,
          y: RS.h - r.drop - 0.07,
          z: r.z0 + (r.z1 - r.z0) * t,
          // Three lit heads across fifteen, spread so the bar and the near
          // tables each get one.
          lit: (ri === 0 && (i === 1 || i === 5)) || (ri === 1 && i === 3),
        });
      }
    });
    return list;
  }, []);

  return (
    <group>
      {RS_PLAN.rails.map((r, i) => {
        const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
        return (
          <group key={i}>
            <mesh
              position={[(r.x0 + r.x1) / 2, RS.h - r.drop, (r.z0 + r.z1) / 2]}
              rotation={[0, -Math.atan2(r.z1 - r.z0, r.x1 - r.x0), 0]}
            >
              <boxGeometry args={[len, 0.05, 0.05]} />
              <meshStandardMaterial color="#121009" roughness={0.5} metalness={0.5} />
            </mesh>
            {r.drop > 0.05 && (
              <group>
                {[0.15, 0.85].map((t, k) => (
                  <mesh
                    key={k}
                    position={[
                      r.x0 + (r.x1 - r.x0) * t,
                      RS.h - r.drop / 2,
                      r.z0 + (r.z1 - r.z0) * t,
                    ]}
                  >
                    <cylinderGeometry args={[0.006, 0.006, r.drop, 6]} />
                    <meshStandardMaterial color="#121009" roughness={0.6} />
                  </mesh>
                ))}
              </group>
            )}
          </group>
        );
      })}
      {heads.map((h, i) => (
        <group key={i}>
          <mesh position={[h.x, h.y, h.z]}>
            <cylinderGeometry args={[0.035, 0.044, 0.11, 10]} />
            <primitive object={mat} attach="material" />
          </mesh>
          {h.lit && out > 0 && (
            <Spot
              position={[h.x, h.y, h.z]}
              target={[h.x + 0.6, 1.0, h.z - 2.4]}
              angle={0.58}
              penumbra={0.75}
              distance={13}
              intensity={GAIN.track * out * gain}
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
 * Eight amber globes on cables of different lengths, one light between them.
 *
 * A cluster like this is what a guest photographs and almost none of the
 * room's light comes from it - a 280 lumen globe at 2100 K is a brightness,
 * not an illuminant. The globes are emissive geometry with a brighter
 * filament inside, and one point light carries whatever spill they are
 * entitled to.
 */
const GLOBES = [
  { dx: -0.95, dz: 0.55, y: 3.30, r: 0.165 },
  { dx: -0.40, dz: -0.30, y: 2.95, r: 0.145 },
  { dx: 0.30, dz: 0.40, y: 3.15, r: 0.275 },
  { dx: 0.95, dz: -0.25, y: 3.35, r: 0.185 },
  { dx: -0.15, dz: 0.95, y: 2.62, r: 0.155 },
  { dx: 0.55, dz: 1.05, y: 2.40, r: 0.215 },
  { dx: -1.25, dz: -0.70, y: 2.80, r: 0.150 },
  { dx: 1.35, dz: 0.60, y: 2.72, r: 0.175 },
];

function Pendants({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const globeMat = useShadeMaterial(colour, GAIN.pendantGlobe * glow);
  const coreMat = useEmissiveMaterial(colour, GAIN.pendantGlobe * 2.2 * glow);
  const p = RS_PLAN.pendants;
  return (
    <group>
      {GLOBES.map((g, i) => {
        const x = p.x + g.dx;
        const z = p.z + g.dz;
        return (
          <group key={i}>
            <mesh position={[x, (g.y + g.r + SOFFIT_Y) / 2, z]}>
              <cylinderGeometry args={[0.004, 0.004, SOFFIT_Y - g.y - g.r, 6]} />
              <meshStandardMaterial color="#17150f" roughness={0.7} />
            </mesh>
            <mesh position={[x, g.y, z]}>
              <sphereGeometry args={[g.r, 20, 14]} />
              <primitive object={globeMat} attach="material" />
            </mesh>
            {/* The filament, which carries most of the brightness. */}
            <mesh position={[x, g.y, z]}>
              <sphereGeometry args={[g.r * 0.28, 10, 8]} />
              <primitive object={coreMat} attach="material" />
            </mesh>
          </group>
        );
      })}
      {out > 0 && (
        <pointLight
          position={[p.x, 2.95, p.z]}
          intensity={GAIN.pendant * out * gain}
          distance={10}
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

/** The column's LED slot, the backlit stone panel, and the timber slats. */
function Architectural({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const mat = useEmissiveMaterial(colour, GAIN.archEmissive * aperture(state));
  const c = RS_PLAN.column;
  const n = RS_PLAN.niche;
  const mid = (n.x0 + n.x1) / 2;
  return (
    <group>
      {/* The slot down the column's left-facing edge. */}
      <mesh position={[c.x - c.w / 2 - 0.01, RS.h / 2, c.z + c.d / 2 - 0.06]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[0.07, RS.h - 0.5]} />
        <primitive object={mat} attach="material" />
      </mesh>
      {out > 0 && (
        <rectAreaLight
          position={[c.x - c.w / 2 - 0.06, RS.h / 2, c.z + c.d / 2 - 0.06]}
          rotation={[0, -Math.PI / 2, 0]}
          width={0.2}
          height={RS.h - 0.5}
          intensity={GAIN.arch * out * gain}
          color={colour}
        />
      )}
      {/* The stone panel, lit from its own reveal. */}
      <mesh position={[mid, n.y1 + 0.04, n.z + 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[n.x1 - n.x0, 0.08]} />
        <primitive object={mat} attach="material" />
      </mesh>
      {out > 0 && (
        <rectAreaLight
          position={[mid, (n.y0 + n.y1) / 2, n.z + 0.45]}
          rotation={[0, 0, 0]}
          width={n.x1 - n.x0}
          height={n.y1 - n.y0}
          intensity={GAIN.arch * 0.5 * out * gain}
          color={colour}
        />
      )}
      {/* Brass sconce on the panel. */}
      <mesh position={[mid - 0.55, n.sconceY, n.z + 0.26]}>
        <cylinderGeometry args={[0.055, 0.055, 0.26, 12]} />
        <primitive object={mat} attach="material" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Feature — bar shelves, wine cabinet, drape                          */
/* ------------------------------------------------------------------ */

function Feature({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const mat = useEmissiveMaterial(colour, GAIN.featureEmissive * aperture(state));
  const b = RS_PLAN.bar;
  const v = RS_PLAN.wine;
  const d = RS_PLAN.drape;
  const barMid = (b.x0 + b.x1) / 2;
  return (
    <group>
      {/* Under-shelf strips on the back bar. */}
      {[1.5, 2.05, 2.6].map((y, i) => (
        <mesh key={i} position={[barMid, y, b.z + 0.42]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[b.x1 - b.x0 - 0.5, 0.045]} />
          <primitive object={mat} attach="material" />
        </mesh>
      ))}
      {out > 0 && (
        <rectAreaLight
          position={[barMid, 2.0, b.z + 0.8]}
          rotation={[0, 0, 0]}
          width={b.x1 - b.x0}
          height={1.9}
          intensity={GAIN.feature * out * gain}
          color={colour}
        />
      )}

      {/* A strip under every wine shelf - the cabinet glows amber as a whole. */}
      {Array.from({ length: 8 }, (_, r) => (
        <mesh
          key={r}
          position={[v.x, 0.345 + (r / 7) * (v.h - 0.8), v.z + v.d / 2 - 0.04]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[v.w - 0.1, 0.04]} />
          <primitive object={mat} attach="material" />
        </mesh>
      ))}
      {out > 0 && (
        <rectAreaLight
          position={[v.x, v.h / 2, v.z + 0.55]}
          rotation={[0, 0, 0]}
          width={v.w}
          height={v.h}
          intensity={GAIN.feature * 0.3 * out * gain}
          color={colour}
        />
      )}

      {/* The drape, lit from behind. No light of its own - it is a surface
          that glows, and the bar's wash is already pointing at it. */}
      <mesh position={[(d.x0 + d.x1) / 2, RS.h / 2, d.z + 0.05]}>
        <planeGeometry args={[d.x1 - d.x0, RS.h - 0.3]} />
        <primitive object={mat} attach="material" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Table / accent                                                      */
/* ------------------------------------------------------------------ */

/**
 * A cordless shaded lamp on every cover, and three lights across fourteen.
 *
 * The pool of light on a tablecloth is the most recognisable thing in fine
 * dining, so this is the one circuit where an emissive stand-in alone is not
 * enough: a shade that glows with no pool under it reads as a prop. Three
 * spots over the three table clusters give the floor the pooling; every lamp
 * carries its own lit shade.
 */
function TableAccent({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const shadeMat = useShadeMaterial(colour, GAIN.tableShade * aperture(state));
  const pools: [number, number][] = [
    [4.0, -3.4],
    [-5.0, -5.0],
    [1.0, -11.0],
  ];
  return (
    <group>
      {TABLES.map((t, i) => (
        <group key={i} position={[t.x + t.r * 0.42, TOP_Y, t.z - t.r * 0.3]}>
          <mesh position={[0, 0.025, 0]}>
            <cylinderGeometry args={[0.032, 0.046, 0.05, 12]} />
            <meshStandardMaterial color="#9a7b42" roughness={0.33} metalness={0.8} />
          </mesh>
          <mesh position={[0, 0.095, 0]}>
            <cylinderGeometry args={[0.011, 0.011, 0.09, 8]} />
            <meshStandardMaterial color="#9a7b42" roughness={0.33} metalness={0.8} />
          </mesh>
          <mesh position={[0, 0.185, 0]}>
            <cylinderGeometry args={[0.052, 0.078, 0.11, 16, 1, true]} />
            <primitive object={shadeMat} attach="material" />
          </mesh>
        </group>
      ))}
      {out > 0 &&
        pools.map(([x, z], i) => (
          <Spot
            key={i}
            position={[x, SOFFIT_Y - 0.2, z]}
            target={[x, TOP_Y, z]}
            angle={0.8}
            penumbra={0.86}
            distance={6.5}
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
  const g = RS_PLAN.glass;
  return (
    <group>
      <rectAreaLight
        position={[(g.x0 + g.x1) / 2, 0.25, g.z + 0.5]}
        rotation={[-Math.PI / 2, 0, 0]}
        width={g.x1 - g.x0}
        height={0.3}
        intensity={GAIN.rgb * out * gain}
        color={colour}
      />
      <rectAreaLight
        position={[RS.xMin + 0.7, 0.25, -8]}
        rotation={[-Math.PI / 2, 0, 0]}
        width={0.3}
        height={9}
        intensity={GAIN.rgb * 0.7 * out * gain}
        color={colour}
      />
      {[
        { x: (g.x0 + g.x1) / 2, z: g.z + 0.5, w: g.x1 - g.x0, d: 0.1 },
        { x: RS.xMin + 0.7, z: -8, w: 0.1, d: 9 },
      ].map((s, i) => (
        <mesh key={i} position={[s.x, 0.05, s.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[s.w, s.d]} />
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
  const g = RS_PLAN.glass;
  if (amount <= 0.001) return null;
  return (
    <rectAreaLight
      position={[(g.x0 + g.x1) / 2, RS.h / 2, g.z + 0.1]}
      rotation={[0, 0, 0]}
      width={g.x1 - g.x0}
      height={RS.h}
      intensity={30 * amount}
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
