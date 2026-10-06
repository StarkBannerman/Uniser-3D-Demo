"use client";

/**
 * Device state -> three.js lights, for the open-plan workspace.
 *
 * Six groups, matching the client's sheet: general, linear, task, cove, the
 * meeting zone and the break area. Six is the argument of the room — at any
 * hour of a working day those three zones want different light at the same
 * time — so each is a separately addressed circuit rather than a brightness of
 * the same circuit.
 *
 * Two rules carried over from the rooms before this one, both learned by
 * measuring rather than by looking:
 *
 *  - **Area lights only where the shape of the source is visible.**
 *    `rectAreaLight` runs a linearly transformed cosine integration per light
 *    per pixel and is the single biggest cost in any of these rooms. It is used
 *    here for the cove, the suspended runs and the glazing, and nowhere else.
 *    This floor is four times the area of the boardroom, so that restraint
 *    matters more, not less.
 *  - **A sample of the heads carries a light.** Thirty-six downlights do not
 *    need thirty-six spotlights to read as thirty-six downlights: the apertures
 *    are what you see, and a handful of spots spread across the plate give the
 *    pools. The sample is spread deliberately across both halves — the cabin
 *    next door sampled four heads that all happened to sit on one side of the
 *    room and left the other half permanently dark.
 *
 * **On rotations.** A `rectAreaLight` emits along its own local -Z, and nothing
 * in the JSX says which way that points. That single fact has produced four
 * separate bugs in this project: shelf strips lighting the desk instead of the
 * books, a backlight washing the carpet instead of the wall, a pendant firing
 * across its own housing. Every area light below carries a comment saying what
 * it is aimed at.
 */

import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { LightState } from "@/lib/sim/types";
import { cctToRgb, lightOutput, rgbToCss } from "@/lib/sim/photometry";
import { emissive } from "./materials";
import { Spot } from "./Spot";
import { WS, WS_COVE_Y, WS_PLAN, WS_WINDOW } from "./Workspace3D";

RectAreaLightUniformsLib.init();

/**
 * Output gains.
 *
 * In the boardroom's band rather than the den's, and for the same reason: this
 * is a pale room working to 400 lux. Its surfaces give most of the light back,
 * so every bounce counts several times over and the den's figures — tuned for
 * charcoal walls returning a tenth of what lands on them — would blow the frame
 * out.
 *
 * The daylight terms are the ones to watch. Twelve metres of glazing is an
 * enormous source, far larger than any domestic window, and the gain that reads
 * as a sunny afternoon in a bedroom reads as an overexposure across a whole
 * floor plate.
 */
const GAIN = {
  cove: 12,
  coveEmissive: 4.2,
  /** Suspended runs over the benches. The grid that makes the floor read. */
  linear: 13,
  linearEmissive: 4.8,
  /** The field of downlights. */
  general: 22,
  generalEmissive: 5.0,
  /**
   * Desk lights. Small, because they are 40 cm above the thing they light.
   *
   * These are also the circuit Focus Work raises while the general layer comes
   * down, so their pools have to be visible against a floor that is still lit.
   * Narrow beam does that far better than brightness.
   */
  task: 9,
  taskEmissive: 3.4,
  /** Inside the glazed room. */
  meeting: 26,
  meetingEmissive: 4.6,
  /** Pendants over the counter, plus the lounge wash. */
  break: 16,
  breakEmissive: 4.6,
  /** What the meeting room's panel throws back into the floor. */
  displayBounce: 0.2,
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

/**
 * How bright the *fitting* looks, as opposed to how much light it gives.
 *
 * A dimmed lamp's visible aperture falls away far more slowly than its output.
 * Square-law on the emissive face would make every low scene look like the
 * fittings had failed rather than dimmed.
 */
const aperture = (s: LightState) => (s.on ? Math.pow(s.level / 100, 0.42) : 0);

/** One emissive material per call site, written in place rather than rebuilt. */
function useFace(colour: THREE.Color, intensity: number) {
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
 * Perimeter strip washing the soffit.
 *
 * All four runs carry a light, including the two short ones. The boardroom
 * leaves its end runs emissive-only on the grounds that they add nothing to a
 * ceiling already lit by the long runs — true there, and false here, because
 * this plate is sixteen metres across and the far corners are genuinely out of
 * reach of the side runs.
 */
function Cove({ state }: { state: LightState }) {
  const colour = colourOf(state);
  const out = output(state);
  const face = useFace(colour, GAIN.coveEmissive * aperture(state));
  const inset = WS.soffit.depth - 0.1;

  const runs: { pos: [number, number, number]; along: "x" | "z"; len: number }[] = [
    { pos: [inset, WS_COVE_Y, WS.d / 2], along: "z", len: WS.d - 0.4 },
    { pos: [WS.w - inset, WS_COVE_Y, WS.d / 2], along: "z", len: WS.d - 0.4 },
    { pos: [WS.w / 2, WS_COVE_Y, inset], along: "x", len: WS.w - 0.4 },
    { pos: [WS.w / 2, WS_COVE_Y, WS.d - inset], along: "x", len: WS.w - 0.4 },
  ];

  return (
    <group>
      {runs.map((r, i) => (
        <group key={i}>
          {/* The visible strip. */}
          <mesh position={r.pos} rotation={[0, r.along === "x" ? 0 : Math.PI / 2, 0]}>
            <planeGeometry args={[r.len, 0.045]} />
            <primitive object={face} attach="material" />
          </mesh>
          {/* Aimed at the soffit above it: -Z rotated to point straight up. */}
          {out > 0.001 && (
            <rectAreaLight
              position={[r.pos[0], r.pos[1] + 0.04, r.pos[2]]}
              rotation={[Math.PI / 2, 0, r.along === "x" ? 0 : Math.PI / 2]}
              width={r.len}
              /**
               * 0.42, not 0.16. The cove sits only 0.21 m below the ceiling it
               * washes, so a narrow source draws a hard bright line along the
               * perimeter and leaves the ceiling inboard of it untouched. A
               * deeper source spreads the wash across more of the soffit and
               * carries further in, which is what a cove detail is for.
               */
              height={0.42}
              intensity={GAIN.cove * out}
              color={colour}
            />
          )}
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Suspended linear                                                    */
/* ------------------------------------------------------------------ */

function Linear({ state }: { state: LightState }) {
  const colour = colourOf(state);
  const out = output(state);
  const face = useFace(colour, GAIN.linearEmissive * aperture(state));

  return (
    <group>
      {WS_PLAN.linears.map((r, i) => {
        const len = r.z1 - r.z0;
        const cz = (r.z0 + r.z1) / 2;
        return (
          <group key={i}>
            {/**
             * The lit blade, as a box rather than a downward-facing plane.
             *
             * A plane was right in principle and invisible in practice. These
             * hang 0.6 m above eye height, so from anywhere in the room you see
             * their underside at about four degrees — a 86 mm aperture projects
             * to six millimetres and the run reads as a black bar with the
             * housing's side filling the rest. A diffuser has sides, and those
             * sides are most of what you actually see of a suspended linear.
             *
             * The proportions matter as much as the shape. A 70 mm housing
             * over a 36 mm diffuser is still a black bar with a glow under it;
             * on a real fitting the extrusion is a lid and the diffuser is the
             * body, so those numbers are now the other way round.
             */}
            <mesh position={[r.x, r.y, cz]}>
              <boxGeometry args={[0.092, 0.07, len]} />
              <primitive object={face} attach="material" />
            </mesh>
            {/* Aimed at the floor: -Z turned to point down. */}
            {out > 0.001 && (
              <rectAreaLight
                position={[r.x, r.y - 0.02, cz]}
                rotation={[-Math.PI / 2, 0, 0]}
                width={0.1}
                height={len}
                intensity={GAIN.linear * out}
                color={colour}
              />
            )}
            {/**
             * Uplight, and more of it than "a little spill".
             *
             * At 0.22 this was only stopping the run reading as a black line
             * against the plenum. But recessed downlights put nothing on a
             * ceiling by definition and the cove only reaches the soffit, so
             * the middle of a 16 x 13.5 m ceiling was lit by bounce alone and
             * sat there as a grey slab over a lit floor. Suspended linears in
             * an office are usually specified direct/indirect for exactly this
             * reason: the indirect component is what makes the ceiling read as
             * part of the room. Aimed at the ceiling.
             */}
            {out > 0.001 && (
              <rectAreaLight
                position={[r.x, r.y + 0.09, cz]}
                rotation={[Math.PI / 2, 0, 0]}
                width={0.1}
                height={len}
                intensity={GAIN.linear * 0.62 * out}
                color={colour}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Downlights                                                          */
/* ------------------------------------------------------------------ */

function Downlights({
  state,
  heads,
  lit,
  gain,
  emissiveGain,
  angle,
  radius,
  ceilingY,
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
  ceilingY: number;
  targetY?: number;
  castShadow?: boolean;
}) {
  const colour = colourOf(state);
  const out = output(state);
  const face = useFace(colour, emissiveGain * aperture(state));

  return (
    <group>
      {heads.map((h, i) => (
        <mesh key={i} position={[h.x, ceilingY - 0.008, h.z]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[radius, 16]} />
          <primitive object={face} attach="material" />
        </mesh>
      ))}
      {out > 0.001 &&
        lit.map((h, i) => (
          <Spot
            key={i}
            position={[h.x, ceilingY - 0.04, h.z]}
            target={[h.x, targetY, h.z]}
            angle={angle}
            penumbra={0.8}
            // Inverse square, not a softened approximation of it. At 1.3 a
            // ceiling head still had most of its output left at floor level,
            // which is why every downlight lit the whole room instead of a
            // patch of it.
            distance={9}
            decay={2}
            intensity={gain * out}
            color={colour}
            castShadow={castShadow}
          />
        ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Task                                                                */
/* ------------------------------------------------------------------ */

/**
 * A light per desk, aimed at the desk.
 *
 * Narrow and short-throw, because that is the point of the circuit: Focus Work
 * raises this while bringing the general layer *down*, and that only reads if
 * the pools land on the work surfaces and stop there. A wide beam from the same
 * fitting would just be a dimmer version of the general layer.
 */
function Task({ state }: { state: LightState }) {
  const colour = colourOf(state);
  const out = output(state);
  const face = useFace(colour, GAIN.taskEmissive * aperture(state));
  const b = WS_PLAN.bench;
  const pitch = (b.z1 - b.z0) / b.seatsPerSide;
  const half = b.w / 2;

  /** Every place gets a visible head; a spread sample of them gets a light. */
  const places = WS_PLAN.benches.flatMap((bench, bi) =>
    Array.from({ length: b.seatsPerSide }, (_, i) =>
      ([-1, 1] as const).map((sgn) => ({
        x: bench.x + sgn * (half - 0.16),
        z: b.z0 + pitch * (i + 0.5),
        key: `${bi}-${i}-${sgn}`,
        // Two per bench carry a light, on alternating sides so neither half of
        // a bench is systematically darker than the other.
        lit: i === (sgn > 0 ? 1 : 2),
      })),
    ).flat(),
  );

  return (
    <group>
      {places.map((p) => (
        <group key={p.key}>
          <mesh position={[p.x, b.h + 0.44, p.z]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.26, 0.03]} />
            <primitive object={face} attach="material" />
          </mesh>
          {out > 0.001 && p.lit && (
            <Spot
              position={[p.x, b.h + 0.42, p.z]}
              target={[p.x, b.h, p.z]}
              angle={0.78}
              penumbra={0.85}
              distance={2.2}
              decay={2}
              intensity={GAIN.task * out}
              color={colour}
            />
          )}
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Break area                                                          */
/* ------------------------------------------------------------------ */

function Break({ state }: { state: LightState }) {
  const colour = colourOf(state);
  const out = output(state);
  const face = useFace(colour, GAIN.breakEmissive * aperture(state));
  const c = WS_PLAN.counter;
  const l = WS_PLAN.lounge;

  return (
    <group>
      {WS_PLAN.counterPendants.map((z, i) => (
        <group key={i}>
          {/* The lit aperture on the underside of the cone. */}
          <mesh position={[c.x - 0.35, 1.952, z]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.155, 18]} />
            <primitive object={face} attach="material" />
          </mesh>
          {out > 0.001 && (
            <Spot
              position={[c.x - 0.35, 1.93, z]}
              target={[c.x - 0.2, c.h, z]}
              angle={0.6}
              penumbra={0.75}
              distance={4}
              decay={2}
              intensity={GAIN.break * out}
              color={colour}
            />
          )}
        </group>
      ))}
      {/* A soft wash over the lounge, so the seating is not lit only by the
          counter four metres away. */}
      {out > 0.001 && (
        <Spot
          position={[l.x, WS.h - 0.3, l.z]}
          target={[l.x, 0.4, l.z]}
          angle={0.95}
          penumbra={0.9}
          distance={6}
          decay={2}
          intensity={GAIN.break * 1.5 * out}
          color={colour}
        />
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Daylight                                                            */
/* ------------------------------------------------------------------ */

/**
 * The glazing, as one very large area light plus a directional.
 *
 * `transmission` is what the blinds are letting through, so lowering them takes
 * the window's contribution down without touching the sun — which is exactly
 * what a solar-filter roller does in the real room.
 */
function Daylight({ level, transmission }: { level: number; transmission: number }) {
  const win = WS_WINDOW;
  const span = win.z1 - win.z0;
  const height = win.y1 - win.y0;
  const through = level * transmission;
  if (through <= 0.002) return null;

  const sky = new THREE.Color("#cfe0f2").convertSRGBToLinear();
  const sun = new THREE.Color("#ffeacb").convertSRGBToLinear();

  return (
    <group>
      {/* Aimed into the room, at +X. A quarter turn the other way points it
          straight into the wall it is mounted on, which is the single most
          repeated bug in this project. */}
      <rectAreaLight
        position={[0.12, (win.y0 + win.y1) / 2, (win.z0 + win.z1) / 2]}
        rotation={[0, -Math.PI / 2, 0]}
        width={span}
        height={height}
        intensity={GAIN.sky * through}
        color={sky}
      />
      <directionalLight
        position={[-6, 7, 3]}
        intensity={GAIN.sun * through}
        color={sun}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Display bounce                                                      */
/* ------------------------------------------------------------------ */

function DisplayBounce({ on }: { on: boolean }) {
  if (!on) return null;
  const m = WS_PLAN.meeting;
  const d = WS_PLAN.meetingDisplay;
  const colour = new THREE.Color("#9fb6d8").convertSRGBToLinear();
  return (
    /* Aimed out of the glazed room, toward the camera: default -Z is already
       +z-facing once the panel sits on the z0 wall, so a half turn is needed. */
    <rectAreaLight
      position={[(m.x0 + m.x1) / 2, d.cy, m.z0 + 0.1]}
      rotation={[0, Math.PI, 0]}
      width={d.w}
      height={d.h}
      intensity={GAIN.displayBounce}
      color={colour}
    />
  );
}

/* ------------------------------------------------------------------ */

export interface WorkspaceFixtures {
  general: LightState;
  linear: LightState;
  task: LightState;
  cove: LightState;
  meeting: LightState;
  break: LightState;
}

export function WorkspaceLightRig({
  fixtures,
  daylight,
  transmission,
  displayOn,
}: {
  fixtures: WorkspaceFixtures;
  daylight: number;
  transmission: number;
  displayOn: boolean;
}) {
  const p = WS_PLAN;

  const generalHeads = p.generalX.flatMap((x) => p.generalZ.map((z) => ({ x, z })));
  /**
   * Fifteen of the forty-two lit, on a regular lattice that covers the plate.
   *
   * Six were not enough and no gain would have made them enough. A 57 degree
   * head on a 3.4 m ceiling throws an 8.3 m pool at desk height, so six of
   * them cover about half of a 216 m² floor — and what you get is pools, with
   * the gaps between them reading as dark patches that look like a fault.
   * Uniformity on an open plan is a spacing problem, not an output problem:
   * real offices get it by putting heads close enough together that the pools
   * overlap, which is the whole reason the grid is a grid.
   *
   * Lighting every other column and every other row puts the lit heads 4.5 m
   * apart against an 8.3 m pool, so every point on the floor is inside at
   * least two of them. The last row is offset rather than aligned so the strip
   * nearest the camera is covered without adding a whole fourth row.
   *
   * Per-head gain comes down accordingly — this is two and a half times as
   * many sources as before, and the room is not meant to be two and a half
   * times brighter.
   */
  const generalLit = [
    ...[0, 2, 4, 6].flatMap((i) =>
      [0, 2, 4].map((j) => ({ x: p.generalX[i], z: p.generalZ[j] })),
    ),
    ...[1, 3, 5].map((i) => ({ x: p.generalX[i], z: p.generalZ[5] })),
  ];

  const meetingHeads = p.meetingHeads.x.flatMap((x) =>
    p.meetingHeads.z.map((z) => ({ x, z })),
  );
  const meetingLit = [
    { x: p.meetingHeads.x[0], z: p.meetingHeads.z[0] },
    { x: p.meetingHeads.x[2], z: p.meetingHeads.z[0] },
    { x: p.meetingHeads.x[1], z: p.meetingHeads.z[2] },
  ];

  return (
    <group>
      <Cove state={fixtures.cove} />
      <Linear state={fixtures.linear} />
      <Downlights
        state={fixtures.general}
        heads={generalHeads}
        lit={generalLit}
        gain={GAIN.general}
        emissiveGain={GAIN.generalEmissive}
        angle={1.0}
        radius={0.056}
        ceilingY={WS.h}
      />
      <Downlights
        state={fixtures.meeting}
        heads={meetingHeads}
        lit={meetingLit}
        gain={GAIN.meeting}
        emissiveGain={GAIN.meetingEmissive}
        angle={0.72}
        radius={0.05}
        ceilingY={p.meeting.h}
        targetY={p.meetingTable.h}
        castShadow
      />
      <Task state={fixtures.task} />
      <Break state={fixtures.break} />
      <Daylight level={daylight} transmission={transmission} />
      <DisplayBounce on={displayOn} />
    </group>
  );
}
