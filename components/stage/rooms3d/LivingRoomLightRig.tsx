"use client";

/**
 * Living room device state -> three.js lights.
 *
 * Same contract as the bedroom rig: brightness through `lightOutput()`, colour
 * through `cctToRgb()`, so the room, the lux sensor and the energy model can
 * never disagree about what a fixture is doing.
 *
 * Four groups, matching what is visible in the reference photograph: the cove,
 * field downlights, a wall-wash grazing the media wall, and a concealed accent
 * behind the television.
 */

import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { LightState } from "@/lib/sim/types";
import { cctToRgb, lightOutput, rgbToCss } from "@/lib/sim/photometry";
import { emissive } from "./materials";
import { LR, LR_COVE_Y, LR_TV, LR_WINDOW } from "./LivingRoom3D";

const GAIN = {
  cove: 40,
  coveEmissive: 5,
  downlight: 30,
  downlightEmissive: 6.5,
  wash: 26,
  washEmissive: 6.5,
  accentEmissive: 1.5,
} as const;

/** Field downlights, in the raised centre of the ceiling. */
export const LR_DOWNLIGHTS = [
  { x: 1.7, z: 1.6 },
  { x: 3.5, z: 1.6 },
  { x: 1.7, z: 3.5 },
  { x: 3.5, z: 3.5 },
  { x: 2.6, z: 5.5 },
] as const;

/** Wall-wash heads in the soffit, grazing the media wall. */
/** Wash heads in the soffit, grazing down the media wall at x = LR.w. */
export const LR_WASH = [
  { x: LR.w - 0.42, z: 1.6 },
  { x: LR.w - 0.42, z: 3.1 },
  { x: LR.w - 0.42, z: 4.6 },
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
    { pos: [LR.w / 2, LR_COVE_Y, inset], along: "x", len: LR.w - 0.9 },
    { pos: [LR.w / 2, LR_COVE_Y, LR.d - inset], along: "x", len: LR.w - 0.9 },
    { pos: [inset, LR_COVE_Y, LR.d / 2], along: "z", len: LR.d - 0.9 },
    { pos: [LR.w - inset, LR_COVE_Y, LR.d / 2], along: "z", len: LR.d - 0.9 },
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
            <spotLight
              position={[p.x, LR.h - 0.04, p.z]}
              target-position={aim(p)}
              angle={angle}
              penumbra={0.7}
              distance={9}
              decay={1.35}
              intensity={intensity * out * gain}
              color={colour}
              // One shadow caster per group. More shadow maps cost far more
              // than the extra shadows contribute at this scale.
              castShadow={i === 0}
              shadow-mapSize={[1024, 1024]}
              shadow-bias={-0.0012}
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

function TvAccent({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);

  const mat = useMemo(
    () => emissive(colour, GAIN.accentEmissive * glow),
    [colour.getHex(), glow],
  );

  return (
    <group>
      <mesh
        position={[LR.w - 0.03, LR_TV.y, LR_TV.z]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[LR_TV.w + 0.3, LR_TV.h + 0.26]} />
        <primitive object={mat} attach="material" />
      </mesh>
      {out > 0.001 && (
        <pointLight
          position={[LR.w - 0.4, LR_TV.y, LR_TV.z]}
          intensity={5 * out * gain}
          distance={3.2}
          decay={1.7}
          color={colour}
        />
      )}
    </group>
  );
}

/**
 * Daylight through the glazing, as an area light on the window plane.
 *
 * Without this the window was a bright card that lit nothing, so the daytime
 * scene had to be carried entirely by the fixtures — the opposite of the
 * reference, where the room is mostly daylit and the cove is an accent. It is
 * also what gives daylight harvesting something real to harvest.
 */
function Daylight({ amount, transmission }: { amount: number; transmission: number }) {
  const strength = amount * transmission;
  if (strength <= 0.004) return null;

  const span = LR_WINDOW.z1 - LR_WINDOW.z0;
  const height = LR_WINDOW.y1 - LR_WINDOW.y0;

  return (
    <group>
    <rectAreaLight
      position={[0.12, (LR_WINDOW.y0 + LR_WINDOW.y1) / 2, (LR_WINDOW.z0 + LR_WINDOW.z1) / 2]}
      // Faces +x, into the room.
      rotation={[0, Math.PI / 2, 0]}
      width={span}
      height={height}
      intensity={78 * strength}
      // Overcast daylight is cool; matching the reference's neutral-white walls
      // depends on it not being warm.
      color={new THREE.Color("#cfe0f2")}
    />
    {/* Bounce. A single area light at the window leaves the ceiling and the far
        side of the room dark, because real-time rendering has no interreflection
        — and a daylit room is mostly interreflection. */}
    <hemisphereLight args={["#dbe8f5", "#7a5f42", 1.7 * strength]} />
    </group>
  );
}

export interface LivingFixtures {
  cove: LightState;
  downlights: LightState;
  wash: LightState;
  accent: LightState;
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
      <Downlights
        state={fixtures.wash}
        gain={gain}
        positions={LR_WASH}
        // Aimed at the foot of the media wall, which is what produces the
        // scalloped grazing light visible in the reference photograph.
        aim={(p) => [LR.w - 0.05, 0.25, p.z]}
        intensity={GAIN.wash}
        angle={0.5}
      />
      <TvAccent state={fixtures.accent} gain={gain} />
    </group>
  );
}
