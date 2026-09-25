"use client";

/**
 * Device state -> three.js lights, for the den.
 *
 * Four groups, matching the client's sheet: general downlights, cove, accent
 * (shelf strips plus a graze on the artwork) and RGB/RGBW.
 *
 * The RGB layer does more work here than in the living room. In a media room
 * bias lighting behind the screen is a real technique — it lifts the surround
 * so a bright picture in a dark room is not exhausting — so the colour device
 * drives three things: vertical battens on the walls, a bias wash behind the
 * screen, and a run under the console.
 */

import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { LightState } from "@/lib/sim/types";
import { cctToRgb, lightOutput, rgbToCss } from "@/lib/sim/photometry";
import { emissive } from "./materials";
import { Spot } from "./Spot";
import { DN, DN_COVE_Y, DN_PLAN, DN_WINDOW } from "./Den3D";

const GAIN = {
  cove: 42,
  coveEmissive: 4.8,
  downlight: 40,
  downlightEmissive: 6,
  /** Shelf strips, and the heads grazing the artwork. */
  accentStrip: 22,
  accentGraze: 26,
  accentEmissive: 2.8,
  /** Colour. Bright emissive, modest actual output — see the note above. */
  rgb: 12,
  rgbEmissive: 4.2,
  /** Light the projector itself throws into the room off the screen. */
  screenBounce: 6,
} as const;

/** Field downlights. Sparse: a media room does not want an even ceiling. */
export const DN_DOWNLIGHTS = [
  { x: 1.7, z: 1.5 },
  { x: 5.6, z: 1.5 },
  { x: 1.7, z: 4.4 },
  { x: 5.6, z: 4.4 },
  { x: 2.5, z: 7.4 },
  { x: 5.2, z: 7.4 },
] as const;

/** Accent heads in the soffit, grazing the artwork on the left wall. */
export const DN_ART_HEADS = [
  { x: DN.soffit.depth + 0.12, z: DN_PLAN.art.z - 0.5 },
  { x: DN.soffit.depth + 0.12, z: DN_PLAN.art.z + 0.5 },
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
const aperture = (s: LightState) => (s.on ? Math.pow(s.level / 100, 0.42) : 0);

/* ------------------------------------------------------------------ */

function Cove({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const inset = DN.soffit.depth - 0.07;
  const mat = useMemo(
    () => emissive(colour, GAIN.coveEmissive * glow),
    [colour.getHex(), glow],
  );
  const segments = [
    { pos: [DN.w / 2, DN_COVE_Y, inset], along: "x", len: DN.w - 1.1 },
    { pos: [DN.w / 2, DN_COVE_Y, DN.d - inset], along: "x", len: DN.w - 1.1 },
    { pos: [inset, DN_COVE_Y, DN.d / 2], along: "z", len: DN.d - 1.1 },
    { pos: [DN.w - inset, DN_COVE_Y, DN.d / 2], along: "z", len: DN.d - 1.1 },
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
              height={DN.soffit.depth * 0.45}
              intensity={GAIN.cove * out * gain}
              color={colour}
            />
          )}
          <mesh
            position={[s.pos[0], DN_COVE_Y - 0.015, s.pos[2]]}
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
              position={[p.x, DN.h - 0.04, p.z]}
              target={aim(p)}
              angle={angle}
              penumbra={0.72}
              distance={9}
              decay={1.35}
              intensity={intensity * out * gain}
              color={colour}
              castShadow={i === 0}
            />
          )}
          <mesh position={[p.x, DN.h - 0.035, p.z]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.05, 18]} />
            <primitive object={lens} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Strips inside every shelf bay, facing down into the recess. */
function ShelfAccent({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const sh = DN_PLAN.shelves;
  const bayH = (sh.y1 - sh.y0) / sh.bays;
  const strip = useMemo(
    () => emissive(colour, GAIN.accentEmissive * glow),
    [colour.getHex(), glow],
  );

  return (
    <group>
      {Array.from({ length: sh.bays }, (_, i) => {
        const y = sh.y0 + (i + 1) * bayH - 0.05;
        return (
          <group key={`shelf-${i}`}>
            {out > 0.001 && (
              <rectAreaLight
                position={[0.2, y - 0.02, (sh.z0 + sh.z1) / 2]}
                rotation={[Math.PI, 0, 0]}
                width={0.26}
                height={sh.z1 - sh.z0 - 0.1}
                intensity={GAIN.accentStrip * out * gain}
                color={colour}
              />
            )}
            <mesh
              position={[0.2, y, (sh.z0 + sh.z1) / 2]}
              rotation={[Math.PI / 2, 0, Math.PI / 2]}
            >
              <planeGeometry args={[sh.z1 - sh.z0 - 0.12, 0.1]} />
              <primitive object={strip} attach="material" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/**
 * Colour: vertical battens, bias behind the screen, and a wash under the
 * console.
 */
function ColourLayer({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const sc = DN_PLAN.screen;
  const co = DN_PLAN.console;
  const mat = useMemo(
    () => emissive(colour, GAIN.rgbEmissive * glow),
    [colour.getHex(), glow],
  );
  const height = DN.h - DN.soffit.drop - 0.5;

  return (
    <group>
      {DN_PLAN.battens.map((b, i) => (
        <group key={`batten-${i}`}>
          <mesh
            position={[b.x, height / 2 + 0.25, b.z]}
            rotation={[0, b.along === "z" ? Math.PI / 2 : 0, 0]}
          >
            <planeGeometry args={[0.07, height]} />
            <primitive object={mat} attach="material" />
          </mesh>
          {out > 0.001 && (
            <rectAreaLight
              position={[
                b.along === "z" ? b.x + 0.05 : b.x,
                height / 2 + 0.25,
                b.along === "z" ? b.z : b.z + 0.05,
              ]}
              rotation={[0, b.along === "z" ? Math.PI / 2 : 0, 0]}
              width={0.14}
              height={height}
              intensity={GAIN.rgb * out * gain}
              color={colour}
            />
          )}
        </group>
      ))}

      {/* Bias light behind the screen: the one piece of colour in this room
          that is a technique rather than an effect. */}
      {out > 0.001 && (
        <rectAreaLight
          position={[sc.x, sc.y1 - sc.drop / 2, 0.2]}
          width={sc.w + 0.5}
          height={sc.drop + 0.4}
          intensity={GAIN.rgb * 0.7 * out * gain}
          color={colour}
        />
      )}

      {/* Wash under the console. */}
      <mesh position={[co.x, 0.1, co.d + 0.06]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[co.w - 0.1, 0.06]} />
        <primitive object={mat} attach="material" />
      </mesh>
      {out > 0.001 && (
        <rectAreaLight
          position={[co.x, 0.09, co.d + 0.1]}
          rotation={[Math.PI, 0, 0]}
          width={co.w - 0.2}
          height={0.4}
          intensity={GAIN.rgb * 0.8 * out * gain}
          color={colour}
        />
      )}
    </group>
  );
}

/**
 * The picture's own contribution.
 *
 * A three-metre screen at full brightness is a real light source — in a dark
 * room it is the dominant one, and the faces in front of it are lit by it. The
 * demo would look wrong without this the moment every fixture is off.
 */
function ScreenLight({ on, deployed }: { on: boolean; deployed: number }) {
  if (!on || deployed < 0.9) return null;
  const sc = DN_PLAN.screen;
  return (
    <rectAreaLight
      position={[sc.x, sc.y1 - sc.drop / 2, 0.2]}
      width={sc.w}
      height={sc.drop}
      intensity={GAIN.screenBounce}
      color={new THREE.Color("#b9cbe6")}
    />
  );
}

/** Daylight through the glazing. */
function Daylight({ amount, transmission }: { amount: number; transmission: number }) {
  const strength = amount * transmission;
  if (strength <= 0.004) return null;
  return (
    <group>
      <directionalLight
        position={[DN.w + 9, 6.5, DN.d / 2 - 2]}
        intensity={2.1 * strength}
        color={new THREE.Color("#fff2dd")}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0009}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={1}
        shadow-camera-far={32}
      />
      <rectAreaLight
        position={[DN.w - 0.14, (DN_WINDOW.y0 + DN_WINDOW.y1) / 2, DN.d / 2]}
        rotation={[0, -Math.PI / 2, 0]}
        width={DN_WINDOW.z1 - DN_WINDOW.z0}
        height={DN_WINDOW.y1 - DN_WINDOW.y0}
        intensity={14 * strength}
        color={new THREE.Color("#d2e2f4")}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */

export interface DenFixtures {
  general: LightState;
  cove: LightState;
  accent: LightState;
  rgb: LightState;
}

export function DenLightRig({
  fixtures,
  gain = 1,
  daylight = 0,
  transmission = 1,
  projectorOn = false,
  screenDeployed = 0,
}: {
  fixtures: DenFixtures;
  gain?: number;
  daylight?: number;
  transmission?: number;
  projectorOn?: boolean;
  /** 0..1 screen deployment, so the picture only lights the room once down. */
  screenDeployed?: number;
}) {
  useLayoutEffect(() => {
    RectAreaLightUniformsLib.init();
  }, []);

  return (
    <group>
      <Daylight amount={daylight} transmission={transmission} />
      <Cove state={fixtures.cove} gain={gain} />
      <Downlights
        state={fixtures.general}
        gain={gain}
        positions={DN_DOWNLIGHTS}
        aim={(p) => [p.x, 0, p.z]}
        intensity={GAIN.downlight}
        angle={0.58}
      />
      {/* Accent, in two parts: the strips inside the shelves and the heads
          grazing the artwork. One device, because on a keypad it is one
          button. */}
      <ShelfAccent state={fixtures.accent} gain={gain} />
      <Downlights
        state={fixtures.accent}
        gain={gain}
        positions={DN_ART_HEADS}
        aim={(p) => [0.08, DN_PLAN.art.y, p.z]}
        intensity={GAIN.accentGraze}
        angle={0.36}
      />
      <ColourLayer state={fixtures.rgb} gain={gain} />
      <ScreenLight on={projectorOn} deployed={screenDeployed} />
    </group>
  );
}
