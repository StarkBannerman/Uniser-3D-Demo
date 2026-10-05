"use client";

/**
 * Device state -> three.js lights, for the boardroom.
 *
 * Six groups, matching the client's sheet: general, cove, feature, table,
 * presentation (the front row) and video conference. Six is the argument of the
 * room — "dim the lights" has three different correct answers here depending on
 * whether you are presenting, discussing or on a call — so each one is a
 * separately addressed circuit rather than a brightness of the same circuit.
 *
 * Two deliberate departures from the den's rig, both learned from measuring it:
 *
 *  - **Six area lights, not sixteen.** `rectAreaLight` runs a linearly
 *    transformed cosine integration per light per pixel, and it is the single
 *    biggest cost in any of these rooms. It is used only where the *shape* of
 *    the source is visible — the cove's wash, the pendant's blade of light, the
 *    window. Everything else is a spotlight, which is far cheaper and, on a
 *    matte office surface, indistinguishable.
 *  - **Materials are mutated, not rebuilt.** The den allocates a new
 *    `MeshStandardMaterial` on every frame of a fade. Here each emissive face
 *    is built once and its colour and intensity written in place.
 */

import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { LightState } from "@/lib/sim/types";
import { cctToRgb, lightOutput, rgbToCss } from "@/lib/sim/photometry";
import { emissive } from "./materials";
import { Spot } from "./Spot";
import { BR, BR_COVE_Y, BR_PLAN, BR_WINDOW } from "./Boardroom3D";
import type { ScreenContent } from "./geometry";

RectAreaLightUniformsLib.init();

/**
 * Output gains.
 *
 * Substantially below the den's, and that is not a style choice. The den
 * returns about a tenth of the light that lands on its walls; this room returns
 * six tenths. Every bounce therefore counts several times over, and carrying
 * the den's figures across blew nine per cent of the frame to flat white —
 * measured, not judged by eye.
 *
 * The daylight terms came down hardest. A 9.4 x 2.7 m rect light is an enormous
 * source compared with any domestic window, so the same gain that reads as a
 * sunny afternoon in a bedroom reads as an overexposure here.
 */
const GAIN = {
  cove: 22,
  coveEmissive: 4.6,
  /** The suspended linear. The brightest single fitting in the room. */
  feature: 17,
  featureEmissive: 5.2,
  /** Field downlights. Four sample the twelve on the ceiling. */
  general: 30,
  generalEmissive: 5.4,
  /** Narrow-beam heads on the table itself. */
  table: 26,
  tableEmissive: 4.8,
  /** The row nearest the screen. */
  front: 26,
  /** Forward wash onto faces, from above the display. */
  vc: 13,
  vcEmissive: 4.0,
  /**
   * What the screen throws back into the room.
   *
   * 4, then 1.5, then 0.4, now 0.18 — the measurement settled every step. With
   * the display lit, the far end of the table read 134/255 against 28 with the
   * AV off, and against 52 for the near end of the same table. The near end is
   * directly under the pendant and the table heads, so a screen two metres away
   * making it brighter than that is backwards.
   *
   * It lands at 58 against the near end's 50: a lit screen lifts the end of the
   * table nearest it by about a sixth, which is what a bright panel in a lit
   * room actually does. It is a 3.4 x 1.9 m source, so even a small gain is a
   * great deal of total flux — that is why the number had to go so far.
   */
  screenBounce: 0.18,
  /** Daylight through the glazing. */
  sun: 1.35,
  sky: 3.0,
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

/**
 * How bright the *fitting* looks, as opposed to how much light it gives.
 *
 * A dimmed lamp's visible aperture falls away far more slowly than its output —
 * a strip at 10 per cent still reads as lit. Square-law on the emissive face
 * would make every low scene look like the fittings had failed.
 */
const aperture = (s: LightState) => (s.on ? Math.pow(s.level / 100, 0.42) : 0);

/** One emissive material per call site, written in place rather than rebuilt. */
function useEmissiveFace(colour: THREE.Color, intensity: number) {
  const mat = useMemo(() => emissive("#ffffff", 0), []);
  useLayoutEffect(() => {
    mat.emissive.copy(colour);
    mat.emissiveIntensity = intensity;
  }, [mat, colour, intensity]);
  return mat;
}

/* ------------------------------------------------------------------ */
/* Cove                                                                */
/* ------------------------------------------------------------------ */

/**
 * Perimeter strip washing the ceiling.
 *
 * Four visible runs, two area lights. The long runs down each side do
 * essentially all the work; the short ones at either end are two metres of
 * strip firing at a ceiling already lit by thirty-four, and removing their
 * lights changed the render by less than a per cent while removing an eighth of
 * the room's fragment cost. Their emissive faces stay, because those are what
 * you actually see.
 */
function Cove({ state }: { state: LightState }) {
  const colour = colourOf(state);
  const out = output(state);
  const face = useEmissiveFace(colour, GAIN.coveEmissive * aperture(state));
  const inset = BR.soffit.depth - 0.08;

  const runs: {
    pos: [number, number, number];
    along: "x" | "z";
    len: number;
    lit: boolean;
  }[] = [
    { pos: [inset, BR_COVE_Y, BR.d / 2], along: "z", len: BR.d - 0.3, lit: true },
    { pos: [BR.w - inset, BR_COVE_Y, BR.d / 2], along: "z", len: BR.d - 0.3, lit: true },
    { pos: [BR.w / 2, BR_COVE_Y, inset], along: "x", len: BR.w - 0.3, lit: false },
    { pos: [BR.w / 2, BR_COVE_Y, BR.d - inset], along: "x", len: BR.w - 0.3, lit: false },
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
              height={BR.soffit.depth * 0.5}
              intensity={GAIN.cove * out}
              color={colour}
            />
          )}
          <mesh
            position={r.pos}
            rotation={[-Math.PI / 2, 0, r.along === "x" ? 0 : Math.PI / 2]}
          >
            <planeGeometry args={[r.len, 0.07]} />
            <primitive object={face} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Feature pendant                                                     */
/* ------------------------------------------------------------------ */

/**
 * The suspended linear over the table.
 *
 * An area light rather than a row of spots because its shape is the point: a
 * five metre blade of light makes a long, soft highlight down a polished table
 * that no point source reproduces, and that highlight is most of why a
 * boardroom table photographs well.
 */
function Feature({ state }: { state: LightState }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const face = useEmissiveFace(colour, GAIN.featureEmissive * glow);
  const p = BR_PLAN.pendant;
  const length = p.z1 - p.z0;
  const cz = (p.z0 + p.z1) / 2;

  return (
    <group>
      {out > 0.001 && (
        <rectAreaLight
          position={[p.x, p.y - 0.06, cz]}
          rotation={[-Math.PI / 2, 0, Math.PI / 2]}
          width={length}
          height={0.1}
          intensity={GAIN.feature * out}
          color={colour}
        />
      )}
      {/* Lit underside. */}
      <mesh position={[p.x, p.y - 0.057, cz]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.1, length]} />
        <primitive object={face} attach="material" />
      </mesh>
      {/* A little light up the housing too — an uplit pendant reads as a real
          fitting rather than a glowing bar hanging in space. */}
      <mesh position={[p.x, p.y + 0.057, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.1, length]} />
        <primitive object={face} attach="material" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Downlight groups                                                    */
/* ------------------------------------------------------------------ */

/** Lenses for a set of recessed heads, plus a sampled set of spotlights. */
function Downlights({
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
  /** Every head on the ceiling — all of them get a visible lens. */
  heads: { x: number; z: number }[];
  /** The subset that carries an actual spotlight. */
  lit: { x: number; z: number }[];
  gain: number;
  emissiveGain: number;
  angle: number;
  radius: number;
  targetY?: number;
  castShadow?: boolean;
}) {
  const colour = colourOf(state);
  const out = output(state);
  const face = useEmissiveFace(colour, emissiveGain * aperture(state));

  return (
    <group>
      {heads.map((h) => (
        <mesh key={`${h.x}-${h.z}`} position={[h.x, BR.h - 0.02, h.z]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[radius, 16]} />
          <primitive object={face} attach="material" />
        </mesh>
      ))}
      {out > 0.001 &&
        lit.map((h) => (
          <Spot
            key={`s${h.x}-${h.z}`}
            position={[h.x, BR.h - 0.05, h.z]}
            target={[h.x, targetY, h.z]}
            angle={angle}
            penumbra={0.78}
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

/* ------------------------------------------------------------------ */
/* Video conference wash                                               */
/* ------------------------------------------------------------------ */

/**
 * Forward wash from above the display, pointed back down the table.
 *
 * `rotation={[0, Math.PI, 0]}` is load-bearing: a `RectAreaLight` emits along
 * its local -Z, so without it this fires into the wall it is mounted on. That
 * exact bug cost an afternoon in the den.
 */
function VideoConference({ state }: { state: LightState }) {
  const colour = colourOf(state);
  const out = output(state);
  const face = useEmissiveFace(colour, GAIN.vcEmissive * aperture(state));
  const v = BR_PLAN.vc;

  return (
    <group>
      {out > 0.001 && (
        <rectAreaLight
          position={[v.x, v.y, v.z]}
          rotation={[0, Math.PI, 0]}
          width={v.w}
          height={0.12}
          intensity={GAIN.vc * out}
          color={colour}
        />
      )}
      <mesh position={[v.x, v.y, v.z - 0.01]}>
        <planeGeometry args={[v.w, 0.08]} />
        <primitive object={face} attach="material" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Daylight                                                            */
/* ------------------------------------------------------------------ */

/**
 * Sun and sky through the glazed façade.
 *
 * `daylight` is the outdoor level 0..1 and `transmission` is what the blinds
 * are letting through, so closing them darkens the room without any scene
 * having to say so — which is what makes stage one of Presentation worth
 * watching.
 */
function Daylight({ level, transmission }: { level: number; transmission: number }) {
  const through = level * transmission;
  const warm = new THREE.Color("#fff3df");
  const sky = new THREE.Color("#cfe0ff");

  return (
    <group>
      {through > 0.004 && (
        <>
          {/* The window plane itself, as a soft source. */}
          <rectAreaLight
            position={[0.06, (BR_WINDOW.y0 + BR_WINDOW.y1) / 2, (BR_WINDOW.z0 + BR_WINDOW.z1) / 2]}
            rotation={[0, -Math.PI / 2, 0]}
            width={BR_WINDOW.z1 - BR_WINDOW.z0}
            height={BR_WINDOW.y1 - BR_WINDOW.y0}
            intensity={GAIN.sky * through}
            color={sky}
          />
          {/* Direct sun, raking across the table. The only shadow caster in
              the room — everything else is soft enough that a shadow map is
              cost without a picture. */}
          <directionalLight
            position={[-7, 5.4, 5.2]}
            intensity={GAIN.sun * through}
            color={warm}
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
        </>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Screen bounce                                                       */
/* ------------------------------------------------------------------ */

const BOUNCE: Record<ScreenContent, [number, string]> = {
  presentation: [0.75, "#eef2fb"],
  conference: [0.88, "#dde7f8"],
  desktop: [0.85, "#dfe8fb"],
  streaming: [1, "#c9d8f6"],
  game: [1, "#c3d2f8"],
};

function ScreenBounce({
  on,
  deployed,
  content,
}: {
  on: boolean;
  deployed: number;
  content: ScreenContent;
}) {
  if (!on) return null;
  const [gain, hex] = BOUNCE[content];
  const s = BR_PLAN.screen;
  const d = BR_PLAN.display;
  // Deployed, the lit surface is the fabric; stowed, it is the display behind.
  const height = deployed > 0.05 ? s.drop * deployed : d.h;
  const cy = deployed > 0.05 ? s.y1 - height / 2 : d.cy;

  return (
    <rectAreaLight
      position={[s.x, cy, 0.2]}
      rotation={[0, Math.PI, 0]}
      width={deployed > 0.05 ? s.w : d.w}
      height={Math.max(height, 0.1)}
      intensity={GAIN.screenBounce * gain}
      color={new THREE.Color(hex)}
    />
  );
}

/* ------------------------------------------------------------------ */

export interface BoardroomFixtures {
  general: LightState;
  cove: LightState;
  feature: LightState;
  table: LightState;
  front: LightState;
  vc: LightState;
}

export function BoardroomLightRig({
  fixtures,
  daylight,
  transmission,
  avOn,
  screenDeployed,
  screenContent,
}: {
  fixtures: BoardroomFixtures;
  daylight: number;
  transmission: number;
  avOn: boolean;
  screenDeployed: number;
  screenContent: ScreenContent;
}) {
  const p = BR_PLAN;

  const generalHeads = p.generalRows.flatMap((x) => p.generalZ.map((z) => ({ x, z })));
  /** Four of the twelve carry a spotlight; the rest are lenses only. */
  const generalLit = [
    { x: p.generalRows[0], z: p.generalZ[1] },
    { x: p.generalRows[1], z: p.generalZ[1] },
    { x: p.generalRows[0], z: p.generalZ[4] },
    { x: p.generalRows[1], z: p.generalZ[4] },
  ];

  const tableHeads = p.tableHeads.rows.flatMap((x) =>
    p.tableHeads.z.map((z) => ({ x, z })),
  );
  const tableLit = [
    { x: p.tableHeads.rows[0], z: p.tableHeads.z[1] },
    { x: p.tableHeads.rows[1], z: p.tableHeads.z[2] },
  ];

  const frontHeads = p.frontX.map((x) => ({ x, z: p.frontZ }));
  const frontLit = [
    { x: p.frontX[1], z: p.frontZ },
    { x: p.frontX[2], z: p.frontZ },
  ];

  return (
    <group>
      <Cove state={fixtures.cove} />
      <Feature state={fixtures.feature} />

      <Downlights
        state={fixtures.general}
        heads={generalHeads}
        lit={generalLit}
        gain={GAIN.general}
        emissiveGain={GAIN.generalEmissive}
        angle={0.72}
        radius={0.052}
      />
      <Downlights
        state={fixtures.table}
        heads={tableHeads}
        lit={tableLit}
        gain={GAIN.table}
        emissiveGain={GAIN.tableEmissive}
        // Narrow, and aimed at the table top rather than the floor. This is the
        // circuit that stays lit through a presentation, so its pool wants to
        // land on the table and stop there.
        angle={0.42}
        radius={0.038}
        targetY={BR_PLAN.table.h}
        castShadow
      />
      <Downlights
        state={fixtures.front}
        heads={frontHeads}
        lit={frontLit}
        gain={GAIN.front}
        emissiveGain={GAIN.generalEmissive}
        angle={0.78}
        radius={0.052}
      />

      <VideoConference state={fixtures.vc} />
      <Daylight level={daylight} transmission={transmission} />
      <ScreenBounce on={avOn} deployed={screenDeployed} content={screenContent} />
    </group>
  );
}
