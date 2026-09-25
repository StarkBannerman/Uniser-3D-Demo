"use client";

/**
 * Device state -> three.js lights, for the living room.
 *
 * The only bridge between the simulation and the 3D view, and deliberately
 * thin. Brightness comes from `lightOutput()` (the square-law dimmer curve) and
 * colour from `cctToRgb()` (the blackbody locus) — the same functions the lux
 * sensor and the energy model use. Re-deriving either here would let the room
 * disagree with the numbers in the panel about what the fixtures are doing.
 *
 * Five groups, matching the client's sheet: general downlights, cove, the
 * decorative pendant cluster, accent (niche strips plus the graze down the
 * media wall) and optional RGB.
 */

import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { LightState } from "@/lib/sim/types";
import { cctToRgb, lightOutput, rgbToCss } from "@/lib/sim/photometry";
import { emissive } from "./materials";
import { Spot } from "./Spot";
import {
  LR,
  LR_COVE_Y,
  LR_PENDANT_GLOBES,
  LR_PLAN,
  LR_TV,
  LR_WINDOW,
} from "./LivingRoom3D";

const GAIN = {
  cove: 40,
  coveEmissive: 5,
  downlight: 30,
  downlightEmissive: 6.5,
  /** Grazing heads down the wall, plus the strips inside the niches. */
  accentGraze: 24,
  accentStrip: 18,
  accentEmissive: 3,
  /** Decorative globes: a lamp is read through its shade, not past it. */
  decorative: 5,
  decorativeGlobe: 3.6,
  /**
   * Concealed colour. Bright enough to tint the ceiling and the wall behind the
   * screen, never to light the room — the moment RGB becomes the working light
   * it stops reading as an effect and starts reading as a mistake.
   */
  rgb: 14,
  rgbEmissive: 3.2,
} as const;

/** Field downlights, on an even grid over the seating. */
export const LR_DOWNLIGHTS = [
  { x: 1.5, z: 1.5 },
  { x: 3.4, z: 1.5 },
  { x: 5.3, z: 1.5 },
  { x: 1.5, z: 3.3 },
  { x: 3.4, z: 3.3 },
  { x: 5.3, z: 3.3 },
  { x: 2.4, z: 5.2 },
  { x: 4.9, z: 5.2 },
] as const;

/** Accent heads in the soffit, raking down the media wall at z = 0. */
export const LR_WASH = [
  { x: 1.7, z: LR.soffit.depth + 0.1 },
  { x: 3.6, z: LR.soffit.depth + 0.1 },
  { x: 5.4, z: LR.soffit.depth + 0.1 },
] as const;

function colourOf(state: LightState): THREE.Color {
  if (state.sat > 0) {
    const c = new THREE.Color(rgbToCss(cctToRgb(state.cct)));
    return c.lerp(new THREE.Color().setHSL(state.hue / 360, 1, 0.5), state.sat / 100);
  }
  const [r, g, b] = cctToRgb(state.cct);
  return new THREE.Color(r / 255, g / 255, b / 255).convertSRGBToLinear();
}

const output = (s: LightState) => (s.on ? lightOutput(s.level) : 0);
/** Aperture brightness is compressed far less than luminous output — a dimmed
 *  fixture still looks like a lit object. */
const aperture = (s: LightState) => (s.on ? Math.pow(s.level / 100, 0.42) : 0);

/* ------------------------------------------------------------------ */

function Cove({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const inset = LR.soffit.depth - 0.07;

  const mat = useMemo(
    () => emissive(colour, GAIN.coveEmissive * glow),
    [colour.getHex(), glow],
  );

  const segments = [
    { pos: [LR.w / 2, LR_COVE_Y, inset], along: "x", len: LR.w - 1.1 },
    { pos: [LR.w / 2, LR_COVE_Y, LR.d - inset], along: "x", len: LR.w - 1.1 },
    { pos: [inset, LR_COVE_Y, LR.d / 2], along: "z", len: LR.d - 1.1 },
    { pos: [LR.w - inset, LR_COVE_Y, LR.d / 2], along: "z", len: LR.d - 1.1 },
  ] as const;

  return (
    <group>
      {segments.map((s, i) => (
        <group key={`cove-${i}`}>
          {out > 0.001 && (
            <rectAreaLight
              position={s.pos as unknown as [number, number, number]}
              rotation={[Math.PI / 2, 0, s.along === "x" ? 0 : Math.PI / 2]}
              width={s.len}
              height={LR.soffit.depth * 0.45}
              intensity={GAIN.cove * out * gain}
              color={colour}
            />
          )}
          <mesh
            position={[s.pos[0], LR_COVE_Y - 0.015, s.pos[2]]}
            rotation={[Math.PI / 2, 0, s.along === "x" ? 0 : Math.PI / 2]}
          >
            <planeGeometry args={[s.len, 0.045]} />
            <primitive object={mat} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Downlights({
  state,
  gain,
  positions,
  aim,
  intensity,
  angle,
}: {
  state: LightState;
  gain: number;
  positions: readonly { x: number; z: number }[];
  /** Where the beam lands — straight down, or forward onto the media wall. */
  aim: (p: { x: number; z: number }) => [number, number, number];
  intensity: number;
  angle: number;
}) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);

  const lens = useMemo(
    () => emissive(colour, GAIN.downlightEmissive * glow),
    [colour.getHex(), glow],
  );

  return (
    <group>
      {positions.map((p, i) => (
        <group key={`dl-${p.x}-${p.z}`}>
          {out > 0.001 && (
            <Spot
              position={[p.x, LR.h - 0.04, p.z]}
              target={aim(p)}
              angle={angle}
              penumbra={0.7}
              distance={9}
              decay={1.35}
              intensity={intensity * out * gain}
              color={colour}
              // One shadow caster per group. More shadow maps cost far more
              // than the extra shadows contribute at this scale.
              castShadow={i === 0}
            />
          )}
          <mesh position={[p.x, LR.h - 0.035, p.z]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.05, 18]} />
            <primitive object={lens} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Accent, part two: the strips inside the shelving niches.
 *
 * Area lights rather than spots, because a recess wants to be evenly filled —
 * and `RectAreaLight` casting no shadows is an advantage here, since the
 * objects on the shelves occlude each other quite enough.
 */
function NicheAccent({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const n = LR_PLAN.niche;
  const bayH = (n.y1 - n.y0) / n.bays;

  const strip = useMemo(
    () => emissive(colour, GAIN.accentEmissive * glow),
    [colour.getHex(), glow],
  );

  return (
    <group>
      {Array.from({ length: n.bays }, (_, i) => {
        const y = n.y0 + (i + 1) * bayH - 0.05;
        return (
          <group key={`niche-${i}`}>
            {out > 0.001 && (
              <rectAreaLight
                position={[(n.x0 + n.x1) / 2, y - 0.02, 0.16]}
                rotation={[Math.PI, 0, 0]}
                width={n.x1 - n.x0 - 0.08}
                height={0.22}
                intensity={GAIN.accentStrip * out * gain}
                color={colour}
              />
            )}
            <mesh
              position={[(n.x0 + n.x1) / 2, y, 0.16]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[n.x1 - n.x0 - 0.1, 0.12]} />
              <primitive object={strip} attach="material" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/**
 * Decorative: the pendant globes.
 *
 * Point lights inside translucent spheres, not spots. A shaded fitting throws
 * light up, down and through, and using a cone is what makes rendered pendants
 * look like torches hanging from a ceiling.
 */
function Decorative({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const { x, z } = LR_PLAN.pendants;

  const globe = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        // Smoked glass: it keeps a body colour when off instead of vanishing.
        color: "#4a4038",
        emissive: colour,
        emissiveIntensity: GAIN.decorativeGlobe * glow,
        roughness: 0.25,
        metalness: 0,
        transparent: true,
        opacity: 0.86,
        toneMapped: false,
      }),
    [colour.getHex(), glow],
  );

  return (
    <group>
      {LR_PENDANT_GLOBES.map((g, i) => (
        <group key={`globe-${i}`}>
          <mesh position={[x + g.dx, g.y, z + g.dz]}>
            <sphereGeometry args={[g.r, 20, 16]} />
            <primitive object={globe} attach="material" />
          </mesh>
          {/* Two of the seven carry the actual light. Seven point lights in one
              cluster costs real frame time and looks no different. */}
          {out > 0.001 && (i === 0 || i === 3) && (
            <pointLight
              position={[x + g.dx, g.y, z + g.dz]}
              intensity={GAIN.decorative * out * gain}
              distance={5}
              decay={1.7}
              color={colour}
            />
          )}
        </group>
      ))}
    </group>
  );
}

/**
 * Optional RGB: a concealed run along the ceiling edge on the glazing side, and
 * a second behind the television.
 *
 * Deliberately never the working light. It tints the ceiling and the wall
 * behind the screen, which is what colour lighting is actually for.
 */
function ColourWash({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const inset = LR.soffit.depth - 0.07;

  const mat = useMemo(
    () => emissive(colour, GAIN.rgbEmissive * glow),
    [colour.getHex(), glow],
  );

  return (
    <group>
      {/* Ceiling edge on the glazing side — the run that reads first, because
          it is the longest thing in the frame. */}
      {out > 0.001 && (
        <rectAreaLight
          position={[LR.w - inset - 0.06, LR_COVE_Y + 0.02, LR.d / 2]}
          rotation={[Math.PI / 2, 0, Math.PI / 2]}
          width={LR.d - 1.2}
          height={LR.soffit.depth * 0.4}
          intensity={GAIN.rgb * out * gain}
          color={colour}
        />
      )}
      <mesh
        position={[LR.w - inset - 0.06, LR_COVE_Y - 0.012, LR.d / 2]}
        rotation={[Math.PI / 2, 0, Math.PI / 2]}
      >
        <planeGeometry args={[LR.d - 1.2, 0.035]} />
        <primitive object={mat} attach="material" />
      </mesh>

      {/* Behind the television. */}
      <mesh position={[LR_TV.x, LR_TV.y, 0.045]}>
        <planeGeometry args={[LR_TV.w + 0.22, LR_TV.h + 0.2]} />
        <primitive object={mat} attach="material" />
      </mesh>
      {out > 0.001 && (
        <pointLight
          position={[LR_TV.x, LR_TV.y, 0.45]}
          intensity={5 * out * gain}
          distance={3.4}
          decay={1.7}
          color={colour}
        />
      )}
    </group>
  );
}

/**
 * Daylight through the glazing.
 *
 * The directional sun is not decoration. `RectAreaLight` cannot cast shadows in
 * three.js, so on a daylit afternoon with the fixtures harvested down to
 * nothing the room had no shadows in it at all and read completely flat. The
 * sun carries the shadows; the area light on the window plane carries the soft
 * wrap, and is also what gives daylight harvesting something real to harvest.
 */
function Daylight({ amount, transmission }: { amount: number; transmission: number }) {
  const strength = amount * transmission;
  if (strength <= 0.004) return null;

  const span = LR_WINDOW.z1 - LR_WINDOW.z0;
  const height = LR_WINDOW.y1 - LR_WINDOW.y0;

  return (
    <group>
      <directionalLight
        position={[LR.w + 9, 6.5, LR.d / 2 - 2]}
        intensity={2.3 * strength}
        color={new THREE.Color("#fff2dd")}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0009}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={1}
        shadow-camera-far={30}
      />
      <rectAreaLight
        position={[LR.w - 0.14, (LR_WINDOW.y0 + LR_WINDOW.y1) / 2, LR.d / 2]}
        // Faces -x, into the room.
        rotation={[0, -Math.PI / 2, 0]}
        width={span}
        height={height}
        intensity={15 * strength}
        color={new THREE.Color("#d2e2f4")}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */

export interface LivingFixtures {
  downlights: LightState;
  cove: LightState;
  decorative: LightState;
  accent: LightState;
  rgb: LightState;
}

export function LivingRoomLightRig({
  fixtures,
  gain = 1,
  daylight = 0,
  transmission = 1,
}: {
  fixtures: LivingFixtures;
  gain?: number;
  /** 0..1 exterior brightness from the simulated clock. */
  daylight?: number;
  /** 0..1 fraction the sheers and drapes let through. */
  transmission?: number;
}) {
  useLayoutEffect(() => {
    // Area lights render black without their BRDF tables uploaded first.
    RectAreaLightUniformsLib.init();
  }, []);

  return (
    <group>
      <Daylight amount={daylight} transmission={transmission} />
      <Cove state={fixtures.cove} gain={gain} />
      <Downlights
        state={fixtures.downlights}
        gain={gain}
        positions={LR_DOWNLIGHTS}
        aim={(p) => [p.x, 0, p.z]}
        intensity={GAIN.downlight}
        angle={0.6}
      />
      {/* Accent, in two parts: the graze down the media wall and the strips
          inside the niches. One device, because on a keypad it is one button. */}
      <Downlights
        state={fixtures.accent}
        gain={gain}
        positions={LR_WASH}
        aim={(p) => [p.x, 0.3, 0.05]}
        intensity={GAIN.accentGraze}
        angle={0.5}
      />
      <NicheAccent state={fixtures.accent} gain={gain} />
      <Decorative state={fixtures.decorative} gain={gain} />
      <ColourWash state={fixtures.rgb} gain={gain} />
    </group>
  );
}
