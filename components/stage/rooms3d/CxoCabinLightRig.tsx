"use client";

/**
 * Device state -> three.js lights, for the CXO cabin.
 *
 * Seven groups, matching the sheet: decorative, cove, general, task, accent,
 * feature colour, and tunable white as a property of the rest.
 *
 * The brief's instruction — premium and hospitality-like — is mostly a decision
 * about which layers are allowed to go out. In an office the working light is
 * the point and everything else is garnish. Here it is the other way round: the
 * cove, the accent and the decorative layers carry the room, and the general
 * downlights are the ones that disappear first. Every scene is built that way,
 * and so is this rig: the layers with the most gain are the ones a lux
 * calculation would call decoration.
 *
 * Six area lights, as in the boardroom, and for the same measured reason — a
 * `rectAreaLight` is the most expensive thing in any of these rooms, so it is
 * spent only where the shape of the source is visible.
 */

import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { LightState } from "@/lib/sim/types";
import { cctToRgb, lightOutput, rgbToCss } from "@/lib/sim/photometry";
import { emissive } from "./materials";
import { Spot } from "./Spot";
import { CX, CX_COVE_Y, CX_PLAN, CX_WINDOW } from "./CxoCabin3D";

RectAreaLightUniformsLib.init();

const GAIN = {
  cove: 26,
  coveEmissive: 5.2,
  /** The suspended linear and the table lamp. */
  pendant: 16,
  pendantEmissive: 5.0,
  lamp: 9,
  lampEmissive: 2.4,
  /**
   * Working light, raised after measuring.
   *
   * Focus is meant to be the brightest scene in the room and came out at a mean
   * of 72/255 against Welcome's 103 — darker than the scene whose whole job is
   * atmosphere. The decorative layers were carrying the room and the working
   * ones were not, which is the right instinct taken one step too far.
   */
  general: 38,
  generalEmissive: 5.2,
  /** Narrow heads on the desk. */
  task: 42,
  taskEmissive: 5.6,
  /** Shelf strips, and the head grazing the artwork. */
  accentStrip: 15,
  accentGraze: 20,
  accentEmissive: 3.4,
  /**
   * Concealed colour: bright to look at, modest as a source.
   *
   * At 9 the amber wash behind the stone swamped the marble it is meant to lift
   * — the feature wall rendered as a flat sheet of copper and the veining
   * disappeared under it. "Where appropriate" in this room means you should
   * have to look for it.
   */
  rgb: 5,
  rgbEmissive: 3.6,
  sun: 1.3,
  sky: 2.8,
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
/** How bright the fitting *looks*, which falls away far more slowly than output. */
const aperture = (s: LightState) => (s.on ? Math.pow(s.level / 100, 0.42) : 0);

/** One material per call site, written in place rather than rebuilt per frame. */
function useFace(colour: THREE.Color, intensity: number) {
  const mat = useMemo(() => emissive("#ffffff", 0), []);
  useLayoutEffect(() => {
    mat.emissive.copy(colour);
    mat.emissiveIntensity = intensity;
  }, [mat, colour, intensity]);
  return mat;
}

/* ------------------------------------------------------------------ */

function Cove({ state }: { state: LightState }) {
  const colour = colourOf(state);
  const out = output(state);
  const face = useFace(colour, GAIN.coveEmissive * aperture(state));
  const inset = CX.soffit.depth - 0.09;

  const runs: { pos: [number, number, number]; along: "x" | "z"; len: number; lit: boolean }[] = [
    { pos: [inset, CX_COVE_Y, CX.d / 2], along: "z", len: CX.d - 0.3, lit: true },
    { pos: [CX.w - inset, CX_COVE_Y, CX.d / 2], along: "z", len: CX.d - 0.3, lit: true },
    { pos: [CX.w / 2, CX_COVE_Y, inset], along: "x", len: CX.w - 0.3, lit: false },
    { pos: [CX.w / 2, CX_COVE_Y, CX.d - inset], along: "x", len: CX.w - 0.3, lit: false },
  ];

  return (
    <group>
      {runs.map((r, i) => (
        <group key={i}>
          {r.lit && out > 0.001 && (
            <rectAreaLight
              position={r.pos}
              rotation={[Math.PI / 2, 0, r.along === "x" ? 0 : Math.PI / 2]}
              width={r.len}
              height={CX.soffit.depth * 0.5}
              intensity={GAIN.cove * out}
              color={colour}
            />
          )}
          <mesh position={r.pos} rotation={[-Math.PI / 2, 0, r.along === "x" ? 0 : Math.PI / 2]}>
            <planeGeometry args={[r.len, 0.08]} />
            <primitive object={face} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Decorative: the suspended linear over the desk, and the shaded lamp.
 *
 * The lamp is a `shade`-style emitter rather than a bare emissive face — a lamp
 * is lit *through*, so it has to keep a diffuse response to the rest of the
 * room as well as glowing, or it goes flat and papery the moment anything else
 * is brighter than it is.
 */
function Decorative({ state }: { state: LightState }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const blade = useFace(colour, GAIN.pendantEmissive * glow);
  const shade = useFace(colour, GAIN.lampEmissive * glow);
  const p = CX_PLAN.pendant;
  const t = CX_PLAN.sideTable;

  return (
    <group>
      {out > 0.001 && (
        <rectAreaLight
          position={[p.x, p.y - 0.055, p.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          width={p.w}
          height={0.11}
          intensity={GAIN.pendant * out}
          color={colour}
        />
      )}
      <mesh position={[p.x, p.y - 0.052, p.z]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[p.w, 0.11]} />
        <primitive object={blade} attach="material" />
      </mesh>
      <mesh position={[p.x, p.y + 0.052, p.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[p.w, 0.11]} />
        <primitive object={blade} attach="material" />
      </mesh>

      {/* Table lamp: body, shade and a point inside it. */}
      <group position={[t.x, 0, t.z]}>
        <mesh position={[0, 0.66, 0]}>
          <cylinderGeometry args={[0.035, 0.07, 0.22, 14]} />
          <primitive object={blade} attach="material" />
        </mesh>
        <mesh position={[0, 0.92, 0]}>
          <cylinderGeometry args={[0.17, 0.23, 0.26, 20, 1, true]} />
          <primitive object={shade} attach="material" />
        </mesh>
        {out > 0.001 && (
          <pointLight position={[0, 0.9, 0]} intensity={GAIN.lamp * out} distance={5.5} decay={1.6} color={colour} />
        )}
      </group>
    </group>
  );
}

/** Lenses for a set of heads, plus a sampled subset carrying real spotlights. */
function Heads({
  state,
  heads,
  lit,
  gain,
  emissiveGain,
  angle,
  radius,
  targetY = 0,
  castShadow = false,
}: {
  state: LightState;
  heads: readonly { x: number; z: number }[];
  lit: readonly { x: number; z: number }[];
  gain: number;
  emissiveGain: number;
  angle: number;
  radius: number;
  targetY?: number;
  castShadow?: boolean;
}) {
  const colour = colourOf(state);
  const out = output(state);
  const face = useFace(colour, emissiveGain * aperture(state));

  return (
    <group>
      {heads.map((h) => (
        <mesh key={`${h.x}-${h.z}`} position={[h.x, CX.h - 0.02, h.z]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[radius, 16]} />
          <primitive object={face} attach="material" />
        </mesh>
      ))}
      {out > 0.001 &&
        lit.map((h) => (
          <Spot
            key={`s${h.x}-${h.z}`}
            position={[h.x, CX.h - 0.05, h.z]}
            target={[h.x, targetY, h.z]}
            angle={angle}
            penumbra={0.8}
            distance={9}
            decay={1.3}
            intensity={gain * out}
            color={colour}
            castShadow={castShadow}
          />
        ))}
    </group>
  );
}

/**
 * Accent: strips in every shelf bay, and a head grazing the artwork.
 *
 * One area light for the two shelving units rather than one per bay. Eight bays
 * stacked in the same plane wash the same piece of joinery, and the eight
 * lights that used to do it were seven more than the picture needed.
 */
function Accent({ state }: { state: LightState }) {
  const colour = colourOf(state);
  const out = output(state);
  const face = useFace(colour, GAIN.accentEmissive * aperture(state));
  const art = CX_PLAN.art;

  return (
    <group>
      {CX_PLAN.shelves.map((unit, u) => {
        const width = unit.x1 - unit.x0;
        const cx = (unit.x0 + unit.x1) / 2;
        const top = 2.62;
        const bottom = 0.62;
        const pitch = (top - bottom) / unit.bays;
        return (
          <group key={u}>
            {Array.from({ length: unit.bays }, (_, b) => (
              <mesh key={b} position={[cx, bottom + pitch * (b + 1) - 0.028, 0.3]} rotation={[Math.PI / 2, 0, 0]}>
                <planeGeometry args={[width - 0.06, 0.035]} />
                <primitive object={face} attach="material" />
              </mesh>
            ))}
            {out > 0.001 && (
              <rectAreaLight
                position={[cx, (bottom + top) / 2, 0.28]}
                rotation={[0, 0, 0]}
                width={width}
                height={top - bottom}
                intensity={GAIN.accentStrip * out}
                color={colour}
              />
            )}
          </group>
        );
      })}

      {/* Graze down the artwork. */}
      {out > 0.001 && (
        <Spot
          position={[CX_PLAN.artHead.x, CX.h - 0.06, CX_PLAN.artHead.z]}
          target={[CX.w - 0.12, art.cy, art.z]}
          angle={0.4}
          penumbra={0.55}
          distance={7}
          decay={1.2}
          intensity={GAIN.accentGraze * out}
          color={colour}
        />
      )}
    </group>
  );
}

/**
 * Feature colour: a concealed wash behind the stone and under the credenza.
 *
 * "Where appropriate" in a CXO cabin means almost invisible. These are two
 * glowing slots rather than a colour-changing ceiling, and the brightest thing
 * about them is the emissive face — the actual output is kept low on purpose so
 * a saturated colour tints the joinery without staining the whole room.
 */
function FeatureColour({ state }: { state: LightState }) {
  const colour = colourOf(state);
  const out = output(state);
  const face = useFace(colour, GAIN.rgbEmissive * aperture(state));
  const stone = CX_PLAN.stone;
  const cred = CX_PLAN.credenza;

  return (
    <group>
      {/* Reveal around the stone panel. */}
      {([stone.x0 - 0.04, stone.x1 + 0.04] as const).map((x) => (
        <mesh key={x} position={[x, CX.h / 2, 0.05]}>
          <planeGeometry args={[0.05, CX.h - 0.5]} />
          <primitive object={face} attach="material" />
        </mesh>
      ))}
      {/* Wash under the floating credenza. */}
      <mesh position={[cred.x, 0.055, cred.d / 2 + 0.03]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[cred.w - 0.2, cred.d]} />
        <primitive object={face} attach="material" />
      </mesh>
      {out > 0.001 && (
        <rectAreaLight
          position={[(stone.x0 + stone.x1) / 2, 1.5, 0.12]}
          rotation={[0, 0, 0]}
          width={stone.x1 - stone.x0}
          height={2.4}
          intensity={GAIN.rgb * out}
          color={colour}
        />
      )}
    </group>
  );
}

function Daylight({ level, transmission }: { level: number; transmission: number }) {
  const through = level * transmission;
  if (through <= 0.004) return null;
  return (
    <group>
      <rectAreaLight
        position={[0.08, (CX_WINDOW.y0 + CX_WINDOW.y1) / 2, (CX_WINDOW.z0 + CX_WINDOW.z1) / 2]}
        rotation={[0, -Math.PI / 2, 0]}
        width={CX_WINDOW.z1 - CX_WINDOW.z0}
        height={CX_WINDOW.y1 - CX_WINDOW.y0}
        intensity={GAIN.sky * through}
        color={new THREE.Color("#d2e1ff")}
      />
      {/* The only shadow caster in the room. Everything else here is soft
          enough that a shadow map would be cost without a picture. */}
      <directionalLight
        position={[-8, 5.6, 6.0]}
        intensity={GAIN.sun * through}
        color={new THREE.Color("#fff0d8")}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0014}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={0.5}
        shadow-camera-far={28}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */

export interface CxoFixtures {
  decorative: LightState;
  cove: LightState;
  general: LightState;
  task: LightState;
  accent: LightState;
  rgb: LightState;
}

export function CxoCabinLightRig({
  fixtures,
  daylight,
  transmission,
}: {
  fixtures: CxoFixtures;
  daylight: number;
  transmission: number;
}) {
  const p = CX_PLAN;
  /** Four of the ten heads carry a spotlight; the rest are lenses only. */
  const generalLit = [p.generalHeads[1], p.generalHeads[3], p.generalHeads[6], p.generalHeads[8]];
  /** Two of the four desk heads, diagonally opposite. */
  const taskLit = [p.taskHeads[0], p.taskHeads[3]];

  return (
    <group>
      <Cove state={fixtures.cove} />
      <Decorative state={fixtures.decorative} />
      <Heads
        state={fixtures.general}
        heads={p.generalHeads}
        lit={generalLit}
        gain={GAIN.general}
        emissiveGain={GAIN.generalEmissive}
        angle={0.76}
        radius={0.05}
      />
      <Heads
        state={fixtures.task}
        heads={p.taskHeads}
        lit={taskLit}
        gain={GAIN.task}
        emissiveGain={GAIN.taskEmissive}
        // Narrow, and aimed at the desk top rather than the floor.
        angle={0.4}
        radius={0.034}
        targetY={CX_PLAN.desk.h}
        castShadow
      />
      <Accent state={fixtures.accent} />
      <FeatureColour state={fixtures.rgb} />
      <Daylight level={daylight} transmission={transmission} />
    </group>
  );
}
