"use client";

/**
 * Kitchen device state -> three.js lights.
 *
 * Four groups, all visible in the reference: the under-cabinet strip, the two
 * island pendants, ceiling downlights, and a plinth accent at the island base.
 *
 * The under-cabinet strip is the one that sells this room. It is the clearest
 * demonstration of task lighting there is — a client can see the difference
 * between a worktop that is lit and one that is merely in a lit room, and
 * nothing else in the catalogue makes that point as quickly.
 */

import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { LightState } from "@/lib/sim/types";
import { cctToRgb, lightOutput, rgbToCss } from "@/lib/sim/photometry";
import { emissive } from "./materials";
import { KT, KT_GLASS, KT_ISLAND, KT_PENDANTS, KT_RUN } from "./Kitchen3D";
import { Spot } from "./Spot";

const GAIN = {
  underCabinet: 30,
  underCabinetEmissive: 4.2,
  pendant: 13,
  pendantEmissive: 4.6,
  downlight: 34,
  downlightEmissive: 6,
  plinthEmissive: 2.2,
} as const;

export const KT_DOWNLIGHTS = [
  { x: 1.5, z: 1.5 },
  { x: 3.0, z: 1.1 },
  { x: 5.0, z: 1.1 },
  { x: 6.2, z: 2.6 },
  { x: 2.1, z: 3.8 },
  { x: 5.2, z: 4.4 },
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

/** The warm line under the wall units, washing the worktop and splashback. */
function UnderCabinet({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const width = KT_RUN.x1 - KT_RUN.x0 - 0.1;
  const cx = (KT_RUN.x0 + KT_RUN.x1) / 2;

  const mat = useMemo(
    () => emissive(colour, GAIN.underCabinetEmissive * glow),
    [colour.getHex(), glow],
  );

  return (
    <group>
      {out > 0.001 && (
        <rectAreaLight
          position={[cx, KT.upper - 0.03, 0.3]}
          // Faces down onto the worktop.
          rotation={[-Math.PI / 2, 0, 0]}
          width={width}
          height={0.3}
          intensity={GAIN.underCabinet * out * gain}
          color={colour}
        />
      )}
      <mesh position={[cx, KT.upper - 0.02, 0.32]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, 0.05]} />
        <primitive object={mat} attach="material" />
      </mesh>
    </group>
  );
}

function Pendants({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);

  const shade = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#1b1d21", roughness: 0.4 }),
    [],
  );
  const lens = useMemo(
    () => emissive(colour, GAIN.pendantEmissive * glow),
    [colour.getHex(), glow],
  );

  return (
    <group>
      {KT_PENDANTS.map((p, i) => (
        <group key={`pend-${i}`}>
          {/* Cord, dome shade and a brass collar, as in the reference. */}
          <mesh position={[p.x, (KT.h + p.y + 0.12) / 2, p.z]}>
            <cylinderGeometry args={[0.005, 0.005, KT.h - p.y - 0.12, 6]} />
            <primitive object={shade} attach="material" />
          </mesh>
          <mesh position={[p.x, p.y + 0.14, p.z]}>
            <cylinderGeometry args={[0.045, 0.045, 0.07, 14]} />
            <primitive object={shade} attach="material" />
          </mesh>
          <mesh position={[p.x, p.y, p.z]} castShadow>
            <sphereGeometry args={[0.13, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
            <primitive object={shade} attach="material" />
          </mesh>
          <mesh position={[p.x, p.y - 0.05, p.z]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.1, 18]} />
            <primitive object={lens} attach="material" />
          </mesh>
          {out > 0.001 && (
            <pointLight
              position={[p.x, p.y - 0.1, p.z]}
              intensity={GAIN.pendant * out * gain}
              distance={5}
              decay={1.6}
              color={colour}
            />
          )}
        </group>
      ))}
    </group>
  );
}

function Downlights({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);

  const lens = useMemo(
    () => emissive(colour, GAIN.downlightEmissive * glow),
    [colour.getHex(), glow],
  );

  return (
    <group>
      {KT_DOWNLIGHTS.map((d, i) => (
        <group key={`dl-${d.x}-${d.z}`}>
          {out > 0.001 && (
            <Spot
              position={[d.x, KT.h - 0.03, d.z]}
              target={[d.x, 0, d.z]}
              angle={0.62}
              penumbra={0.72}
              distance={7}
              decay={1.4}
              intensity={GAIN.downlight * out * gain}
              color={colour}
              castShadow={i === 1}
            />
          )}
          <mesh position={[d.x, KT.h - 0.026, d.z]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.045, 18]} />
            <primitive object={lens} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Concealed strip in the island plinth. */
function Plinth({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);

  const mat = useMemo(
    () => emissive(colour, GAIN.plinthEmissive * glow),
    [colour.getHex(), glow],
  );

  return (
    <group>
      <mesh position={[KT_ISLAND.x, 0.055, KT_ISLAND.z + KT_ISLAND.d / 2 - 0.02]}>
        <planeGeometry args={[KT_ISLAND.w - 0.2, 0.05]} />
        <primitive object={mat} attach="material" />
      </mesh>
      {out > 0.001 && (
        <pointLight
          position={[KT_ISLAND.x, 0.1, KT_ISLAND.z + KT_ISLAND.d / 2 + 0.2]}
          intensity={2.4 * out * gain}
          distance={2.2}
          decay={1.8}
          color={colour}
        />
      )}
    </group>
  );
}

/** Daylight through the balcony glazing, plus its bounce. */
function Daylight({ amount, transmission }: { amount: number; transmission: number }) {
  const strength = amount * transmission;
  if (strength <= 0.004) return null;

  const span = KT_GLASS.z1 - KT_GLASS.z0;
  const height = KT_GLASS.y1 - KT_GLASS.y0;

  return (
    <group>
      <rectAreaLight
        position={[KT.w - 0.12, (KT_GLASS.y0 + KT_GLASS.y1) / 2, (KT_GLASS.z0 + KT_GLASS.z1) / 2]}
        // Faces -x, into the room.
        rotation={[0, -Math.PI / 2, 0]}
        width={span}
        height={height}
        intensity={20 * strength}
        color={new THREE.Color("#d2e2f4")}
      />
    </group>
  );
}

export interface KitchenFixtures {
  underCabinet: LightState;
  pendants: LightState;
  downlights: LightState;
  plinth: LightState;
}

export function KitchenLightRig({
  fixtures,
  gain = 1,
  daylight = 0,
  transmission = 1,
}: {
  fixtures: KitchenFixtures;
  gain?: number;
  daylight?: number;
  transmission?: number;
}) {
  useLayoutEffect(() => {
    RectAreaLightUniformsLib.init();
  }, []);

  return (
    <group>
      <Daylight amount={daylight} transmission={transmission} />
      <UnderCabinet state={fixtures.underCabinet} gain={gain} />
      <Pendants state={fixtures.pendants} gain={gain} />
      <Downlights state={fixtures.downlights} gain={gain} />
      <Plinth state={fixtures.plinth} gain={gain} />
    </group>
  );
}
