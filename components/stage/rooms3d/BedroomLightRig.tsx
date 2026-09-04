"use client";

/**
 * Device state -> three.js lights.
 *
 * This is the only bridge between the simulation and the 3D view, and it is
 * deliberately thin. Brightness comes from `lightOutput()` (the square-law
 * dimmer curve) and colour from `cctToRgb()` (the blackbody locus) — the same
 * functions the SVG renderer and the lux sensor use. Re-deriving either here
 * would mean the room could disagree with the lux reading and the energy model
 * about what the fixtures are doing.
 *
 * Note what is *not* scaled by `lightOutput`: the emissive faces. A dimmed
 * filament still looks like a bright object, it just throws less light, so
 * aperture brightness is deliberately compressed far less than luminous output.
 */

import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { LightState } from "@/lib/sim/types";
import { cctToRgb, lightOutput, rgbToCss } from "@/lib/sim/photometry";
import { COVE_Y, ROOM, emissive } from "./materials";
import { ACCENT_Z, FIXTURES } from "./MasterBedroom";

/* Tuning — the numbers that decide whether this reads as a render. ---- */

const GAIN = {
  /** RectAreaLight luminance for the cove at full output. */
  cove: 46,
  /** Emissive intensity of the cove's visible strip. Drives the bloom. */
  coveEmissive: 5.5,
  downlight: 42,
  downlightEmissive: 7,
  pendant: 9,
  pendantEmissive: 6,
  accentEmissive: 7.5,
} as const;

function colourOf(state: LightState): THREE.Color {
  if (state.sat > 0) {
    const c = new THREE.Color(rgbToCss(cctToRgb(state.cct)));
    const hsl = new THREE.Color().setHSL(state.hue / 360, 1, 0.5);
    return c.lerp(hsl, state.sat / 100);
  }
  const [r, g, b] = cctToRgb(state.cct);
  return new THREE.Color(r / 255, g / 255, b / 255).convertSRGBToLinear();
}

/** Luminous output, 0..1 — square-law, as a real dimmer behaves. */
function output(state: LightState): number {
  return state.on ? lightOutput(state.level) : 0;
}

/**
 * Aperture brightness, 0..1.
 *
 * A much flatter curve than luminous output. At 10% a fixture puts out 1% of its
 * light but the lens is still clearly glowing, and compressing the aperture the
 * same way as the output makes every dimmed fixture look switched off.
 */
function apertureBrightness(state: LightState): number {
  return state.on ? Math.pow(state.level / 100, 0.42) : 0;
}

/* ------------------------------------------------------------------ */

function CoveLight({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = apertureBrightness(state);

  const inset = ROOM.soffit.depth - 0.08;
  const segments = [
    // Along the slat wall and the glazing wall — the two the camera sees.
    { pos: [ROOM.w / 2, COVE_Y, inset], rot: [Math.PI / 2, 0, 0], size: [ROOM.w - 0.7, ROOM.soffit.depth * 0.5] },
    { pos: [ROOM.w - inset, COVE_Y, ROOM.d / 2], rot: [Math.PI / 2, 0, Math.PI / 2], size: [ROOM.d - 0.7, ROOM.soffit.depth * 0.5] },
    { pos: [ROOM.w / 2, COVE_Y, ROOM.d - inset], rot: [Math.PI / 2, 0, 0], size: [ROOM.w - 0.7, ROOM.soffit.depth * 0.5] },
    { pos: [inset, COVE_Y, ROOM.d / 2], rot: [Math.PI / 2, 0, Math.PI / 2], size: [ROOM.d - 0.7, ROOM.soffit.depth * 0.5] },
  ];

  const stripMat = useMemo(
    () => emissive(colour, GAIN.coveEmissive * glow),
    [colour.getHex(), glow],
  );

  return (
    <group>
      {segments.map((s, i) => (
        <group key={`cove-${i}`}>
          {out > 0.001 && (
            <rectAreaLight
              position={s.pos as [number, number, number]}
              rotation={s.rot as [number, number, number]}
              width={s.size[0]}
              height={s.size[1]}
              intensity={GAIN.cove * out * gain}
              color={colour}
            />
          )}
          {/* The visible strip. Kept present but dark when off, because a cove
              channel does not disappear when you switch it off. */}
          <mesh
            position={[s.pos[0], COVE_Y - 0.02, s.pos[2]]}
            rotation={[Math.PI / 2, 0, i % 2 === 0 ? 0 : Math.PI / 2]}
          >
            <planeGeometry args={[s.size[0], 0.05]} />
            <primitive object={stripMat} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Downlights({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = apertureBrightness(state);

  const lensMat = useMemo(
    () => emissive(colour, GAIN.downlightEmissive * glow),
    [colour.getHex(), glow],
  );

  return (
    <group>
      {FIXTURES.downlights.map((d, i) => (
        <group key={`dl-${i}`}>
          {out > 0.001 && (
            <spotLight
              position={[d.x, ROOM.h - 0.03, d.z]}
              target-position={[d.x, 0, d.z]}
              angle={0.62}
              penumbra={0.72}
              distance={7}
              decay={1.4}
              intensity={GAIN.downlight * out * gain}
              color={colour}
              // Only the middle fixture casts a shadow. Three shadow maps at
              // this scale cost far more than the second and third shadows add.
              castShadow={i === 1}
              shadow-mapSize={[1024, 1024]}
              shadow-bias={-0.0012}
            />
          )}
          <mesh position={[d.x, ROOM.h - 0.026, d.z]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.045, 20]} />
            <primitive object={lensMat} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Pendant({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = apertureBrightness(state);
  const p = FIXTURES.pendant;

  const lensMat = useMemo(
    () => emissive(colour, GAIN.pendantEmissive * glow),
    [colour.getHex(), glow],
  );

  return (
    <group>
      {out > 0.001 && (
        <pointLight
          position={[p.x, p.y, p.z]}
          intensity={GAIN.pendant * out * gain}
          distance={5}
          decay={1.6}
          color={colour}
        />
      )}
      <mesh position={[p.x, p.y - 0.01, p.z]}>
        <cylinderGeometry args={[0.026, 0.026, 0.03, 16]} />
        <primitive object={lensMat} attach="material" />
      </mesh>
    </group>
  );
}

/**
 * Cool vertical accents at the curtain joins.
 *
 * Present in every state in the reference video, including all-off, which is
 * what identifies them as fixtures rather than daylight leaking through a gap.
 */
function Accents({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const glow = apertureBrightness(state);
  const mat = useMemo(
    () => emissive(colour, GAIN.accentEmissive * glow),
    [colour.getHex(), glow],
  );

  const zs = ACCENT_Z;
  const height = ROOM.h - 0.5;

  return (
    <group>
      {zs.map((z, i) => (
        <mesh key={`accent-${i}`} position={[ROOM.w - 0.07, height / 2 + 0.08, z]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[0.05, height]} />
          <primitive object={mat} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */

export interface BedroomFixtures {
  cove: LightState;
  downlights: LightState;
  pendant: LightState;
  accent: LightState;
}

export function BedroomLightRig({
  fixtures,
  /**
   * Global luminous gain — the demo's exposure control, applied here because
   * composer tone mapping leaves `toneMappingExposure` inert. Scales light
   * intensity only, never emissive faces, so raising it brightens the room
   * without turning every aperture into a white blob.
   */
  gain = 1,
}: {
  fixtures: BedroomFixtures;
  gain?: number;
}) {
  // RectAreaLight needs its BRDF lookup tables uploaded before first use, or
  // every area light renders black with no error.
  useLayoutEffect(() => {
    RectAreaLightUniformsLib.init();
  }, []);

  return (
    <group>
      <CoveLight state={fixtures.cove} gain={gain} />
      <Downlights state={fixtures.downlights} gain={gain} />
      <Pendant state={fixtures.pendant} gain={gain} />
      <Accents state={fixtures.accent} gain={gain} />
    </group>
  );
}
