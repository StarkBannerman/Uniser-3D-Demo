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
 *
 * Eight groups, per Section 4 of the requirement document. Bedside and reading
 * are split left/right because "one side of the bed reads while the other
 * sleeps" is the single clearest argument for individual control, and it cannot
 * be made with a single grouped device.
 */

import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { LightState } from "@/lib/sim/types";
import { cctToRgb, lightOutput, rgbToCss } from "@/lib/sim/photometry";
import { COVE_Y, ROOM, emissive, shade } from "./materials";
import { FIXTURES, PLAN, WINDOW } from "./MasterBedroom";
import { Spot } from "./Spot";

/* Tuning — the numbers that decide whether this reads as a render. ---- */

const GAIN = {
  /** RectAreaLight luminance for the cove at full output. */
  cove: 40,
  /** Emissive intensity of the cove's visible strip. Drives the bloom. */
  coveEmissive: 5.0,
  downlight: 38,
  downlightEmissive: 6.5,
  /** Table lamps: a point source inside a glowing shade. */
  bedside: 7,
  bedsideShade: 3.4,
  /** Reading lights: narrow, and aimed at the pillow rather than the room. */
  reading: 24,
  readingEmissive: 6,
  /**
   * Wardrobe strips.
   *
   * Higher than it looks like it should be: the light is read through smoked
   * glass at a glancing angle, and the interior has to be clearly brighter than
   * the room for the before/after to land. Tuned against the Evening scene,
   * where the room around it is already lit.
   */
  wardrobe: 26,
  wardrobeEmissive: 4,
  /**
   * Path lighting.
   *
   * Low by definition — if it lights the room it has failed. But it is the one
   * fixture left on at the end of Good Night, so it has to be unmistakably
   * *doing something* to the floor: a strip nobody can see is indistinguishable
   * from a room that went dark, which loses the point of the last stage.
   */
  night: 11,
  nightEmissive: 3.2,
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

  const inset = ROOM.soffit.depth - 0.09;
  const segments = [
    { pos: [ROOM.w / 2, COVE_Y, inset], rot: [Math.PI / 2, 0, 0], size: [ROOM.w - 0.8, ROOM.soffit.depth * 0.5] },
    { pos: [ROOM.w - inset, COVE_Y, ROOM.d / 2], rot: [Math.PI / 2, 0, Math.PI / 2], size: [ROOM.d - 0.8, ROOM.soffit.depth * 0.5] },
    { pos: [ROOM.w / 2, COVE_Y, ROOM.d - inset], rot: [Math.PI / 2, 0, 0], size: [ROOM.w - 0.8, ROOM.soffit.depth * 0.5] },
    { pos: [inset, COVE_Y, ROOM.d / 2], rot: [Math.PI / 2, 0, Math.PI / 2], size: [ROOM.d - 0.8, ROOM.soffit.depth * 0.5] },
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

/** General lighting: the recessed heads. */
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
            <Spot
              position={[d.x, ROOM.h - 0.03, d.z]}
              target={[d.x, 0, d.z]}
              angle={0.6}
              penumbra={0.72}
              distance={8}
              decay={1.4}
              intensity={GAIN.downlight * out * gain}
              color={colour}
              // Only the head over the near side of the bed casts a shadow.
              // Four shadow maps at this scale cost far more than the extra
              // three shadows add, and this is the one in frame.
              castShadow={i === 0}
            />
          )}
          <mesh position={[d.x, ROOM.h - 0.026, d.z]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.046, 20]} />
            <primitive object={lensMat} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * One bedside table lamp.
 *
 * A point light inside a translucent shade, rather than a spot: a shaded lamp
 * throws light up, down and through, and using a cone here is what makes CGI
 * table lamps look like torches standing on furniture.
 */
function BedsideLamp({
  state,
  gain,
  x,
}: {
  state: LightState;
  gain: number;
  x: number;
}) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = apertureBrightness(state);
  const z = PLAN.nightstand.z - 0.02;
  const y = PLAN.nightstand.top + 0.42;

  const shadeMat = useMemo(
    () => shade(colour, GAIN.bedsideShade * glow),
    [colour.getHex(), glow],
  );

  return (
    <group>
      {out > 0.001 && (
        <pointLight
          position={[x, y, z]}
          intensity={GAIN.bedside * out * gain}
          distance={4.2}
          decay={1.7}
          color={colour}
        />
      )}
      {/* Tapered drum shade. */}
      <mesh position={[x, y, z]} castShadow={false}>
        <cylinderGeometry args={[0.13, 0.17, 0.22, 24, 1, true]} />
        <primitive object={shadeMat} attach="material" />
      </mesh>
    </group>
  );
}

/**
 * One articulated reading light.
 *
 * Tight beam onto the pillow, and deliberately nothing else. The moment worth
 * demonstrating is that the right-hand pillow is lit well enough to read by
 * while the left-hand one stays dark, which only works if the cone is narrow.
 */
function ReadingLight({
  state,
  gain,
  x,
}: {
  state: LightState;
  gain: number;
  x: number;
}) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = apertureBrightness(state);
  // Arms swing inward, so the head sits over the pillow rather than the wall.
  const dir = x < PLAN.bed.x ? 1 : -1;
  const side = x < PLAN.bed.x ? -1 : 1;

  const headPos: [number, number, number] = [
    x + dir * 0.2,
    PLAN.reading.y - 0.24,
    PLAN.reading.z + 0.28,
  ];
  // Aimed at the pillow on this side of the bed, not at the bed's centre.
  const target: [number, number, number] = [
    PLAN.bed.x + side * 0.46,
    0.78,
    PLAN.bed.headZ + 0.36,
  ];

  const lensMat = useMemo(
    () => emissive(colour, GAIN.readingEmissive * glow),
    [colour.getHex(), glow],
  );

  return (
    <group>
      {out > 0.001 && (
        <Spot
          position={headPos}
          target={target}
          // Wide enough to cover a pillow and a book, tight enough that the
          // other side of the bed stays dark. That contrast is the scene.
          angle={0.44}
          penumbra={0.55}
          distance={4}
          decay={1.4}
          intensity={GAIN.reading * out * gain}
          color={colour}
          castShadow={false}
        />
      )}
      <mesh
        position={[headPos[0], headPos[1] - 0.045, headPos[2] + 0.025]}
        rotation={[1.05, 0, 0]}
      >
        <circleGeometry args={[0.037, 16]} />
        <primitive object={lensMat} attach="material" />
      </mesh>
    </group>
  );
}

/**
 * Wardrobe interior strips.
 *
 * One area light per bay, facing into the box. Area lights cannot cast shadows
 * in three.js, which here is an advantage rather than a limitation: the shelves
 * want to be evenly filled, and the garments' own occlusion does the rest.
 */
function WardrobeLight({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = apertureBrightness(state);
  const { x0, x1, depth, height } = PLAN.wardrobe;
  const bays = 3;
  const bayW = (x1 - x0) / bays;

  const stripMat = useMemo(
    () => emissive(colour, GAIN.wardrobeEmissive * glow),
    [colour.getHex(), glow],
  );

  return (
    <group>
      {Array.from({ length: bays }, (_, i) => {
        const cx = x0 + i * bayW + bayW / 2;
        return (
          <group key={`wl-${i}`}>
            {out > 0.001 && (
              <rectAreaLight
                position={[cx, height - 0.09, depth * 0.55]}
                rotation={[-Math.PI / 2, 0, 0]}
                width={bayW - 0.1}
                height={depth * 0.7}
                intensity={GAIN.wardrobe * out * gain}
                color={colour}
              />
            )}
            {/* The strip itself, tucked under the top so it is seen as a glow
                rather than as a bar of light. */}
            <mesh
              position={[cx, height - 0.075, depth * 0.55]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[bayW - 0.12, 0.035]} />
              <primitive object={stripMat} attach="material" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/**
 * Night / path lighting.
 *
 * Under the bed base and along the wardrobe plinth, washing the floor and
 * nothing else. This is the fixture that stays on in Good Night, so it has to
 * be legible at 30% in an otherwise dark room without lifting the walls.
 */
function PathLight({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = apertureBrightness(state);
  const { x, headZ, width, length } = PLAN.bed;

  const stripMat = useMemo(
    () => emissive(colour, GAIN.nightEmissive * glow),
    [colour.getHex(), glow],
  );

  // Under the bed on both long sides, and along the wardrobe plinth.
  const strips: {
    pos: [number, number, number];
    rot: [number, number, number];
    size: [number, number];
  }[] = [
    {
      pos: [x - width / 2 - 0.12, 0.05, headZ + length / 2],
      rot: [Math.PI / 2, 0, Math.PI / 2],
      size: [length, 0.5],
    },
    {
      pos: [x + width / 2 + 0.12, 0.05, headZ + length / 2],
      rot: [Math.PI / 2, 0, Math.PI / 2],
      size: [length, 0.5],
    },
    {
      pos: [(PLAN.wardrobe.x0 + PLAN.wardrobe.x1) / 2, 0.05, PLAN.wardrobe.depth + 0.04],
      rot: [Math.PI / 2, 0, 0],
      size: [PLAN.wardrobe.x1 - PLAN.wardrobe.x0 - 0.2, 0.4],
    },
  ];

  return (
    <group>
      {strips.map((s, i) => (
        <group key={`path-${i}`}>
          {out > 0.001 && (
            <rectAreaLight
              position={s.pos}
              rotation={s.rot}
              width={s.size[0]}
              height={s.size[1]}
              intensity={GAIN.night * out * gain}
              color={colour}
            />
          )}
          <mesh position={[s.pos[0], 0.02, s.pos[2]]} rotation={s.rot}>
            <planeGeometry args={[s.size[0], 0.02]} />
            <primitive object={stripMat} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Daylight through the glazing, plus its bounce.
 *
 * The directional sun is not decoration. `RectAreaLight` cannot cast shadows in
 * three.js, so on a daylit morning with the fixtures harvested down to nothing
 * the room had no shadows in it at all and read completely flat — the same bug
 * that made the kitchen look hazy. The sun carries the shadows; the area light
 * on the window plane carries the soft wrap, and it is also what gives daylight
 * harvesting something real to harvest.
 */
function Daylight({
  amount,
  transmission,
}: {
  amount: number;
  transmission: number;
}) {
  const strength = amount * transmission;
  if (strength <= 0.004) return null;

  const span = WINDOW.z1 - WINDOW.z0;
  const height = WINDOW.y1 - WINDOW.y0;

  return (
    <group>
      <directionalLight
        position={[ROOM.w + 8, 6, ROOM.d / 2 - 2]}
        intensity={2.4 * strength}
        color={new THREE.Color("#fff2dd")}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0009}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-camera-near={1}
        shadow-camera-far={28}
      />
      <rectAreaLight
        position={[ROOM.w - 0.12, (WINDOW.y0 + WINDOW.y1) / 2, ROOM.d / 2]}
        // Faces -x, into the room.
        rotation={[0, -Math.PI / 2, 0]}
        width={span}
        height={height}
        intensity={14 * strength}
        color={new THREE.Color("#d2e2f4")}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */

export interface BedroomFixtures {
  general: LightState;
  cove: LightState;
  bedsideLeft: LightState;
  bedsideRight: LightState;
  readingLeft: LightState;
  readingRight: LightState;
  wardrobe: LightState;
  night: LightState;
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
  /** Outdoor daylight, 0..1 of a clear Mumbai noon. */
  daylight = 0,
  /** How much of it gets past the curtains, 0..1 — see `shadeTransmission`. */
  transmission = 1,
}: {
  fixtures: BedroomFixtures;
  gain?: number;
  daylight?: number;
  transmission?: number;
}) {
  // RectAreaLight needs its BRDF lookup tables uploaded before first use, or
  // every area light renders black with no error.
  useLayoutEffect(() => {
    RectAreaLightUniformsLib.init();
  }, []);

  return (
    <group>
      <CoveLight state={fixtures.cove} gain={gain} />
      <Downlights state={fixtures.general} gain={gain} />
      <BedsideLamp state={fixtures.bedsideLeft} gain={gain} x={PLAN.nightstand.left} />
      <BedsideLamp state={fixtures.bedsideRight} gain={gain} x={PLAN.nightstand.right} />
      <ReadingLight state={fixtures.readingLeft} gain={gain} x={PLAN.reading.left} />
      <ReadingLight state={fixtures.readingRight} gain={gain} x={PLAN.reading.right} />
      <WardrobeLight state={fixtures.wardrobe} gain={gain} />
      <PathLight state={fixtures.night} gain={gain} />
      <Daylight amount={daylight} transmission={transmission} />
    </group>
  );
}
