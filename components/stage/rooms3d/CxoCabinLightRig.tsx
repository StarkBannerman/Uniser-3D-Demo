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

const BASE = {
  /**
   * These came down by a bit over half in one go, and the reason is not in
   * this file.
   *
   * Every luminaire gain here had been raised to compensate for a room whose
   * surfaces were reflecting almost nothing — the joinery returned half a per
   * cent of what reached it because its material colour was being multiplied
   * by a scanned albedo instead of replaced by one. Fixing the materials
   * multiplied the light coming back off the walnut by fifteen, so every one
   * of these numbers was suddenly lighting a room that no longer needed it.
   *
   * The emissive values are deliberately *not* cut. They set how the strip
   * itself looks against the tone curve, which has nothing to do with how much
   * the room reflects.
   */
  cove: 11.7,
  /**
   * Emissive values are chosen against the tone curve, not against taste.
   *
   * ACES maps roughly 2 to 0.8 and anything past about 4 to white. These all
   * sat above 5, so every strip in the room was a flat white bar with no
   * colour left in it — the 2700K the scene asked for never reached the
   * screen. Around 2 is a bright warm line that still has its hue.
   */
  coveEmissive: 2.2,
  /**
   * The suspended linear.
   *
   * 16 put a blown band straight down the desk top — a 2.2 m area light 1.55 m
   * above a surface is a lot of flux over not much distance. It took four
   * wrong guesses to find: the task lamp, the desk's gloss, the laptop's bloom
   * and the desk's roughness again, none of which moved the measurement by
   * more than a tenth of a per cent.
   *
   * The tell was that roughness changed nothing. A specular highlight spreads
   * when you roughen a surface; a diffuse pool does not care. Once it was
   * clearly diffuse there was only one source directly above it.
   */
  // Back up from the 7 it was cut to while hunting the blown desk. The
  // pendant was never the cause, and it is the one luminaire in the room
  // anybody looks at.
  pendant: 5.85,
  pendantEmissive: 2.4,
  /**
   * A near-field source, and the number is small for a reason.
   *
   * three.js spotlights are candela: illuminance is intensity / distance
   * squared. This one sits 0.46 m above what it lights, so whatever is written
   * here arrives on the desk multiplied by about four. At 9 it put a blown
   * white band across the whole top; at 3 it still did. 0.9 is the first value
   * that reads as a lamp rather than as a fault.
   */
  lamp: 0.72,
  lampEmissive: 1.5,
  /**
   * Working light, raised after measuring.
   *
   * Focus is meant to be the brightest scene in the room and came out at a mean
   * of 72/255 against Welcome's 103 — darker than the scene whose whole job is
   * atmosphere. The decorative layers were carrying the room and the working
   * ones were not, which is the right instinct taken one step too far.
   */
  general: 17.1,
  generalEmissive: 2.1,
  /** Narrow heads on the desk. */
  task: 18.9,
  taskEmissive: 2.3,
  /**
   * Shelf strips. Small, because of what they physically are.
   *
   * This was the blown band on the desk, and it took five wrong guesses to
   * find — the task lamp, the desk's gloss, the laptop's bloom, the desk's
   * roughness again, and the pendant — none of which moved the measurement by
   * more than a tenth of a per cent.
   *
   * What settled it was comparing scenes rather than changing things: Leave
   * clipped 0 per cent, Reading 0 per cent, Welcome 7.6. The only layer much
   * brighter in Welcome than Reading is the accent, at 92 against 55.
   *
   * And then the error is obvious. Each unit's strips were one area light the
   * full size of the unit, facing out into the room — 1.85 by 2.24 metres of
   * emitter pointed straight at a desk two and a half metres away. A strip
   * tucked under a shelf lights the books 20 cm in front of it. It does not
   * light the far side of the room, and it certainly does not do it harder
   * than the ceiling does.
   */
  accentStrip: 2.02,
  accentGraze: 9,
  accentEmissive: 1.7,
  /**
   * Concealed colour: bright to look at, modest as a source.
   *
   * At 9 the amber wash behind the stone swamped the marble it is meant to lift
   * — the feature wall rendered as a flat sheet of copper and the veining
   * disappeared under it. "Where appropriate" in this room means you should
   * have to look for it.
   */
  rgb: 2.25,
  rgbEmissive: 2.0,
  sun: 1.3,
  // Enough to read as a lit window, not enough to bleach the floor in front of
  // it — which is what a 2.9 x 2.8 m source does at anything higher.
  sky: 2.0,
} as const;

/**
 * Exposure, applied to every emitter in the room.
 *
 * `ToneMappingEffect` has no exposure uniform for ACES, and the renderer's own
 * `toneMappingExposure` does nothing here because tone mapping is the
 * composer's job. But exposure *is* only a linear scale applied before the tone
 * curve — ACES(colour x exposure) — so scaling the scene's radiance is exactly
 * equivalent and costs nothing.
 *
 * It scales the emissive faces as well as the lights, which is the point: a
 * strip is part of the image, not outside it. At night everything comes down
 * together and the strips are the only things left standing, which is what
 * makes a dark room read as dark rather than as a grey one.
 */
function gains(exposure: number) {
  const g = { ...BASE } as Record<string, number>;
  for (const k of Object.keys(g)) g[k] = (BASE as Record<string, number>)[k] * exposure;
  return g as unknown as typeof BASE;
}

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

function Cove({ state, GAIN }: { state: LightState; GAIN: typeof BASE }) {
  const colour = colourOf(state);
  const out = output(state);
  const face = useFace(colour, GAIN.coveEmissive * aperture(state));
  const inset = CX.soffit.depth - 0.09;

  const runs: { pos: [number, number, number]; along: "x" | "z"; len: number; lit: boolean }[] = [
    { pos: [inset, CX_COVE_Y, CX.d / 2], along: "z", len: CX.d - 0.3, lit: true },
    { pos: [CX.w - inset, CX_COVE_Y, CX.d / 2], along: "z", len: CX.d - 0.3, lit: true },
    // All four carry a light, including the short runs.
    //
    // They were emissive-only, carried over from the boardroom where the end
    // runs genuinely add nothing — but that room is lit from both long walls
    // onto a pale ceiling. Here the run at z = 0.57 is the one above the
    // feature wall, so switching it off left the entire back of the room with
    // no cove wash at all. A perimeter cove that stops at two sides is not a
    // perimeter cove.
    { pos: [CX.w / 2, CX_COVE_Y, inset], along: "x", len: CX.w - 0.3, lit: true },
    { pos: [CX.w / 2, CX_COVE_Y, CX.d - inset], along: "x", len: CX.w - 0.3, lit: true },
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
function Decorative({ state, GAIN }: { state: LightState; GAIN: typeof BASE }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const blade = useFace(colour, GAIN.pendantEmissive * glow);
  const shade = useFace(colour, GAIN.lampEmissive * glow);
  const p = CX_PLAN.pendant;
  const d = CX_PLAN.desk;

  return (
    <group>
      {/**
       * The lit face runs along X, with the housing it sits inside.
       *
       * It ran along Z. When the desk turned ninety degrees the housing in
       * `CxoCabin3D` turned with it and this did not, so the glowing blade
       * crossed its own dark body diagonally — a light at right angles to the
       * fitting holding it.
       *
       * Three things had to agree and only one of them did: the box geometry,
       * the emissive plane, and the area light's roll. The `Math.PI / 2` on the
       * light's Z was what put its width along Z after the X rotation, and it
       * is the easiest of the three to miss because nothing about it is visible
       * until the shape of the pool on the desk is wrong.
       */}
      {out > 0.001 && (
        <rectAreaLight
          position={[p.x, p.y - 0.055, p.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          width={p.len}
          height={0.11}
          intensity={GAIN.pendant * out}
          color={colour}
        />
      )}
      <mesh position={[p.x, p.y - 0.052, p.z]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[p.len, 0.11]} />
        <primitive object={blade} attach="material" />
      </mesh>
      <mesh position={[p.x, p.y + 0.052, p.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[p.len, 0.11]} />
        <primitive object={blade} attach="material" />
      </mesh>

      {/**
       * Desk task lamp, where a table lamp used to stand on a side table.
       *
       * A shaded lamp on an occasional table is a living room; a slim matte
       * black task light on the desk is an office, and it is the fitting the
       * brief actually asks for. Same device, same control, different room.
       */}
      <group position={[d.x - 1.02, d.h, d.z - 0.2]}>
        <mesh position={[0, 0.01, 0]}>
          <cylinderGeometry args={[0.075, 0.085, 0.022, 18]} />
          <meshStandardMaterial color="#1a1b1d" roughness={0.6} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.4, 10]} />
          <meshStandardMaterial color="#1a1b1d" roughness={0.5} metalness={0.3} />
        </mesh>
        <mesh position={[0.17, 0.4, 0]} rotation={[0, 0, -0.35]}>
          <boxGeometry args={[0.42, 0.028, 0.055]} />
          <meshStandardMaterial color="#1a1b1d" roughness={0.5} metalness={0.3} />
        </mesh>
        <mesh position={[0.17, 0.383, 0]} rotation={[0, 0, -0.35]}>
          <planeGeometry args={[0.36, 0.04]} />
          <primitive object={shade} attach="material" />
        </mesh>
        {/**
         * Wide, soft and weak, because it is 40 cm from what it is lighting.
         *
         * A task lamp is a near-field source and the inverse square law is
         * merciless at that range: at the gain a ceiling fitting wants, this
         * put a blown white streak across the desk — 3.4 per cent of the
         * surface clipped at a peak of 253. The gain comes down by two thirds,
         * the cone opens up and the decay steepens, which is what a shade on a
         * desk actually does to the light leaving it.
         */}
        {out > 0.001 && (
          <Spot
            position={[d.x - 0.85, d.h + 0.46, d.z - 0.2]}
            target={[d.x - 0.5, d.h, d.z + 0.12]}
            angle={0.95}
            penumbra={0.9}
            distance={2.2}
            decay={2}
            intensity={GAIN.lamp * out}
            color={colour}
          />
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
            penumbra={0.82}
            // Inverse square, not a softened approximation of it. At 1.3 a
            // ceiling head still had most of its output left at floor level,
            // which is why every downlight lit the whole room instead of a
            // patch of it.
            distance={7}
            decay={2}
            intensity={gain * out}
            color={colour}
            castShadow={castShadow}
          />
        ))}
    </group>
  );
}

/**
 * Accent: strips in every shelf bay, and a graze on the artwork.
 *
 * One area light per joinery unit rather than one per bay — four bays stacked
 * in the same plane wash the same piece of timber, and four lights were three
 * more than the picture needed.
 *
 * `rotation={[0, Math.PI, 0]}` throughout: a RectAreaLight emits along its own
 * local -Z, so without the half turn every one of these fires into the wall it
 * is mounted on. That exact bug has now cost time in two rooms.
 */
function Accent({ state, GAIN }: { state: LightState; GAIN: typeof BASE }) {
  const colour = colourOf(state);
  const out = output(state);
  const face = useFace(colour, GAIN.accentEmissive * aperture(state));
  const p = CX_PLAN;

  return (
    <group>
      {p.shelves.map((unit, u) => {
        const span = unit.x1 - unit.x0;
        const cx = (unit.x0 + unit.x1) / 2;
        const top = 2.86;
        const bottom = unit.bottom;
        const pitch = (top - bottom) / unit.bays;
        return (
          <group key={u}>
            {Array.from({ length: unit.bays }, (_, b) => (
              <mesh key={b} position={[cx, bottom + pitch * (b + 1) - 0.03, 0.36]}>
                <planeGeometry args={[span - 0.08, 0.035]} />
                <primitive object={face} attach="material" />
              </mesh>
            ))}
            {/**
             * Clear of the joinery, and pointed at it.
             *
             * This sat at z = 0.34 facing the room — which is inside the
             * unit's own 0.02 to 0.38 depth, and facing away from the books at
             * 0.26. Two faults from one line: it lit nothing on the shelves,
             * so the bays read as empty black frames however high the accent
             * channel went; and grazing the uprights and shelf edges at
             * almost zero degrees drew a bright line right round the unit,
             * which is the glowing wireframe outline.
             *
             * It now stands 0.62 out and faces the wall, so the books are lit
             * from the front and nothing is grazed. A second, much weaker one
             * throws the spill into the room that the first used to.
             *
             * Same mistake as the stone slab's backlight, two commits apart.
             * Both were a light aimed at the room instead of at the thing it
             * is named after.
             */}
            {out > 0.001 && (
              <>
                <rectAreaLight
                  position={[cx, (bottom + top) / 2, 0.62]}
                  rotation={[0, 0, 0]}
                  width={span + 0.2}
                  height={top - bottom + 0.2}
                  intensity={GAIN.accentStrip * 1.6 * out}
                  color={colour}
                />
                <rectAreaLight
                  position={[cx, (bottom + top) / 2, 0.42]}
                  rotation={[0, Math.PI, 0]}
                  width={span}
                  height={top - bottom}
                  intensity={GAIN.accentStrip * 0.3 * out}
                  color={colour}
                />
              </>
            )}
          </group>
        );
      })}

      {out > 0.001 && (
        <Spot
          position={[p.artHead.x, CX.h - 0.06, p.artHead.z]}
          target={[p.art.x, p.art.cy, 0.14]}
          angle={0.4}
          penumbra={0.55}
          distance={5}
          decay={2}
          intensity={GAIN.accentGraze * out}
          color={colour}
        />
      )}
    </group>
  );
}

/**
 * Feature colour: the reveal behind the marble, the line under the desk, and
 * the wash beneath the credenza.
 *
 * All three are concealed — bright to look at, deliberately modest as emitters,
 * so a saturated colour tints the joinery without staining the room. The desk
 * strip is the one that earns its place: three metres of stone appearing to
 * float costs one emissive quad and a pool on the floor.
 */
function FeatureColour({ state, GAIN }: { state: LightState; GAIN: typeof BASE }) {
  const colour = colourOf(state);
  const out = output(state);
  const face = useFace(colour, GAIN.rgbEmissive * aperture(state));
  const p = CX_PLAN;
  const m = p.marble;
  const desk = p.desk;

  return (
    <group>
      {/**
       * No halo plane behind the slab.
       *
       * It was a rectangle 12 cm larger than the stone, so all you ever saw of
       * it was a 6 cm bright border — a glowing wireframe outline rather than a
       * backlight. The rect light below does the actual lifting, and a reveal
       * that is lit rather than emitting is what a real slab detail is.
       */}
      {/**
       * Two lights, pointing opposite ways, and only one of them existed.
       *
       * The slab's backlight faced *into the room* — so at Evening, when the
       * brief calls it the hero and it is turned up to 70 per cent, it lit the
       * carpet and left the stone itself a black rectangle. A backlight has to
       * fall on the thing it is lifting.
       *
       * So the main one now faces the wall and grazes the stone, and a second,
       * much weaker one throws the spill the room was getting before.
       */}
      {out > 0.001 && (
        <>
          <rectAreaLight
            position={[(m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2, 0.52]}
            rotation={[0, 0, 0]}
            width={m.x1 - m.x0 + 0.3}
            height={m.y1 - m.y0 + 0.3}
            intensity={GAIN.rgb * 1.5 * out}
            color={colour}
          />
          <rectAreaLight
            position={[(m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2, 0.3]}
            rotation={[0, Math.PI, 0]}
            width={m.x1 - m.x0}
            height={m.y1 - m.y0}
            intensity={GAIN.rgb * 0.3 * out}
            color={colour}
          />
        </>
      )}

      {/* The line under the desk, on its long side facing the room. */}
      <mesh position={[desk.x, 0.115, desk.z + desk.d / 2 - 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[desk.w - 1.2, 0.12]} />
        <primitive object={face} attach="material" />
      </mesh>
      {out > 0.001 && (
        <rectAreaLight
          position={[desk.x, 0.1, desk.z + desk.d / 2 - 0.06]}
          rotation={[-Math.PI / 2, 0, 0]}
          width={desk.w - 1.2}
          height={0.5}
          intensity={GAIN.rgb * 1.6 * out}
          color={colour}
        />
      )}

      <mesh position={[p.credenza.x, 0.095, 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[p.credenza.len - 0.2, p.credenza.d]} />
        <primitive object={face} attach="material" />
      </mesh>
    </group>
  );
}

function Daylight({ level, transmission, GAIN }: { level: number; transmission: number; GAIN: typeof BASE }) {
  const through = level * transmission;
  if (through <= 0.004) return null;
  return (
    <group>
      {/* The glazed wall, x = 0. `rotation={[0, -Math.PI / 2, 0]}` so it
          emits into the room rather than out of the building. */}
      <rectAreaLight
        position={[0.1, (CX_WINDOW.y0 + CX_WINDOW.y1) / 2, (CX_WINDOW.z0 + CX_WINDOW.z1) / 2]}
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
  exposure,
}: {
  fixtures: CxoFixtures;
  daylight: number;
  transmission: number;
  /** 1 at midday, well under that after dusk. See `gains`. */
  exposure: number;
}) {
  const p = CX_PLAN;
  const GAIN = gains(exposure);
  /**
   * Five of the ten heads carry a spotlight; the rest are lenses only.
   *
   * The sampled four used to span x 1.4 to 4.4 in an eight metre room — one of
   * them on the right-hand half, and every head at x = 6.5 upwards was a trim
   * ring with nothing behind it. With the cove's end runs dark as well, the
   * whole right side of the room had no source of its own and stayed dark at
   * any level.
   *
   * Sampling a grid is fine; sampling one side of it is not. These are picked
   * to cover both halves and the depth the camera actually sees.
   */
  const generalLit = [
    p.generalHeads[1],
    p.generalHeads[2],
    p.generalHeads[3],
    p.generalHeads[4],
    p.generalHeads[7],
  ];
  /** Two of the four desk heads, diagonally opposite. */
  const taskLit = [p.taskHeads[0], p.taskHeads[3]];

  return (
    <group>
      <Cove state={fixtures.cove} GAIN={GAIN} />
      <Decorative state={fixtures.decorative} GAIN={GAIN} />
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
      <Accent state={fixtures.accent} GAIN={GAIN} />
      <FeatureColour state={fixtures.rgb} GAIN={GAIN} />
      <Daylight level={daylight} transmission={transmission} GAIN={GAIN} />
    </group>
  );
}
