"use client";

/**
 * Device state -> three.js lights, for the hotel lobby.
 *
 * Seven groups, matching the client's sheet: cove, architectural, general,
 * decorative, accent, feature and façade.
 *
 * **The governing constraint here is the light count, not the geometry.**
 * three.js bakes `NUM_POINT_LIGHTS`, `NUM_SPOT_LIGHTS` and the rest into every
 * material's shader as a `#define`, so each light is evaluated at every
 * fragment of every surface whether it reaches it or not — and this room has
 * more surface than any other in the project. The sheet shows a lobby with
 * well over a hundred visible fittings. This rig has thirty-three lights.
 *
 * The gap is closed with *apertures*: emissive meshes that look like a lit
 * fitting without being one. A hundred and ten metres of cove is six area
 * lights and forty emissive strips; the chandelier is two point lights and
 * fifty-four glowing globes; the downlight field is ten spots and forty-eight
 * glowing lenses. What the eye reads as "that fitting is on" is almost
 * entirely the aperture — the actual illumination can come from far fewer
 * sources placed where they do the most work.
 *
 * Every light is also *mounted* and driven to zero rather than unmounted. See
 * `MOUNTED` below; this is the fix that took a four-second transition freeze
 * in the bedroom down to an ordinary frame.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { LightState } from "@/lib/sim/types";
import { cctToRgb, lightOutput, rgbToCss } from "@/lib/sim/photometry";
import { useEmissiveMaterial, useShadeMaterial } from "./lightMaterials";
import { Spot } from "./Spot";
import { useQuality } from "../Stage3D";
import type { Quality } from "@/lib/device";
import { COFFER, HL, HL_PLAN, LAMPS, WaterWall } from "./HotelLobby3D";

const GAIN = {
  cove: 27,
  coveEmissive: 4.4,
  downlight: 28,
  downlightEmissive: 6,
  arch: 20,
  archEmissive: 3.6,
  decorative: 12,
  decorativeGlobe: 3.4,
  accent: 34,
  accentEmissive: 3,
  /**
   * Nine, where the cove runs at forty-six.
   *
   * `rectAreaLight` intensity is a luminance, not a flux: what reaches the
   * room is that figure multiplied by the light's *area*. The water wall is
   * 4.7 by 5 metres — twenty-three square metres against a cove strip's four —
   * so matching the cove's number put five times the cove's light on the back
   * wall and blew it to flat white. The ratio, not the number, is the setting.
   */
  feature: 9,
  featureEmissive: 3.4,
  facade: 40,
  facadeEmissive: 4,
} as const;

/**
 * Lights stay mounted, and are driven to zero instead of being removed.
 *
 * Adding or removing one light recompiles every material in the scene, and
 * during a scene fade the seven channels cross zero at different moments — so
 * the count would change several times per transition, each combination a
 * shader variant the driver has not seen. Measured on the bedroom before this
 * rule existed: one scene press compiled 38 programs and froze the worst frame
 * for 2684 ms. Mounted throughout, the same transition compiles nothing.
 */
const MOUNTED = true;

/**
 * **The light budget is the frame budget.** Measured on this room, on an M1:
 *
 *     36 lights   9.2 fps   p95 134 ms
 *     23 lights  35.1 fps   p95  67 ms
 *
 * Nothing else in the renderer is within a factor of three of that. Resolution
 * — the obvious lever, and the one tried first — bought 14 per cent for 36 per
 * cent fewer pixels, because three.js evaluates every light at every fragment
 * *and* uploads every light's uniforms on every draw call, so a third of the
 * cost is not per-pixel at all.
 *
 * The rule this room now follows, and the reason it still looks the same: a
 * light is for *illumination*, an emissive mesh is for *recognition*. Anything
 * whose job is to be seen as a lit fitting is an aperture; only the handful
 * that genuinely change how the room is lit are lights.
 */

/** Seven flutes at 140 mm centres — see the slot run in `Accent`. */
const SLOT_PITCH = 7 * (0.085 + 0.055);
const SLOTS = 9;

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
 *  fitting still looks like a lit object. */
const aperture = (s: LightState) => (s.on ? Math.pow(s.level / 100, 0.42) : 0);

/* ------------------------------------------------------------------ */
/* Downlights                                                          */
/* ------------------------------------------------------------------ */

/**
 * The field: forty-eight apertures, ten of them actually lights.
 *
 * On a 2.4 m grid across a 17 x 24 m plate that is what a lobby of this size
 * is specified to, and forty-eight spot lights is not a thing a browser will
 * do. The ten that carry light are spread to cover the circulation route, the
 * lounge and the reception approach; the other thirty-eight are lenses. From
 * the floor the difference is invisible, because a downlight at seven metres
 * contributes a broad wash rather than a readable pool.
 */
const LENSES: { x: number; z: number }[] = [];
for (let i = 0; i < 6; i++) {
  for (let j = 0; j < 8; j++) {
    LENSES.push({ x: 1.6 + i * 2.8, z: 1.8 + j * 2.9 });
  }
}

/**
 * Four, where there were ten.
 *
 * This is the single biggest saving in the room and it costs almost nothing to
 * look at. A downlight five and a half metres above a floor does not make a
 * readable pool of light — it makes a broad wash, and four broad washes
 * overlapping across 408 m² are indistinguishable from ten. What a viewer
 * actually reads as "the downlights are on" is the forty-eight glowing lenses
 * in the ceiling, and those are an instanced mesh that costs one draw call and
 * no light at all.
 *
 * Measured: taking this room from 36 lights to 23 moved it from 9.2 frames a
 * second to 35. Nothing else in the renderer comes close to that.
 */
const EMITTERS = [
  { x: 6.0, z: 6.0 },
  { x: 11.5, z: 9.0 },
  { x: 5.2, z: 15.5 },
  { x: 11.8, z: 18.5 },
] as const;

/**
 * Which of the lobby's decorative washes a tier can afford.
 *
 * This is the heaviest room in the project: ten rect-area sources, and
 * rect-area is the expensive type — about 6 ms a frame each where a spot is
 * 3. At 127 ms a frame on the high tier and 43 on the low, after the shadow
 * and water fixes, the lights are now all that is left.
 *
 * Only the decorative layers give way. The cove, the downlights, the water
 * wall and the daylight stay on both tiers, because they are the room; what
 * goes is the second and third accent wash and two of the three facade
 * uplights, all of which keep their emissive faces and so still read as lit
 * fittings — they simply stop casting into the room.
 */
const BUDGET: Record<Quality, { accents: number; facade: number; coveRuns: number }> = {
  high: { accents: 4, facade: 3, coveRuns: 2 },
  low: { accents: 1, facade: 1, coveRuns: 1 },
};

function Downlights({ state, gain }: { state: LightState; gain: number }) {
  /**
   * One shadow map here, and only on the high tier.
   *
   * This room renders 168 shadow-casting meshes into 5.2 megapixels of depth
   * a frame, on top of a frame that already costs 127 ms. On a machine with
   * integrated graphics that is a cost with nothing to show for it: the lobby
   * is lit by ten rect-area sources that cast no shadow in three.js at all,
   * so what this map contributes is one soft pool under the seating.
   */
  const detailed = useQuality() === "high";
  const ref = useRef<THREE.InstancedMesh>(null);
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const lens = useEmissiveMaterial(colour, GAIN.downlightEmissive * glow);
  const y = COFFER[0].y - 0.015;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const rot = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      -Math.PI / 2,
    );
    const one = new THREE.Vector3(1, 1, 1);
    LENSES.forEach((p, i) => {
      m.compose(new THREE.Vector3(p.x, y, p.z), rot, one);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [y]);

  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, LENSES.length]}>
        <circleGeometry args={[0.06, 14]} />
        <primitive object={lens} attach="material" />
      </instancedMesh>
      {EMITTERS.map((p, i) => (
        <group key={`dl-${i}`}>
          {MOUNTED && (
            <Spot
              position={[p.x, COFFER[0].y - 0.05, p.z]}
              target={[p.x, 0, p.z]}
              angle={0.78}
              penumbra={0.85}
              distance={16}
              decay={1.2}
              intensity={GAIN.downlight * out * gain}
              color={colour}
              // One shadow caster. More shadow maps cost far more at this
              // scale than the extra shadows contribute.
              /**
               * The caster is the head over the circulation route, not the
               * one over the sofa.
               *
               * One shadow map is all this room gets — more cost far more
               * than they contribute at this scale — so which head carries it
               * matters. Directly above the sectional it drew a hard-edged
               * band across the hero object in the brightest scene; over the
               * open floor it gives the furniture contact shadows without
               * putting a line through anything.
               */
              castShadow={i === 1 && detailed}
            />
          )}
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Cove                                                                */
/* ------------------------------------------------------------------ */

/**
 * The coffer steps.
 *
 * Every step carries a continuous strip, which is what the sheet's "Cove
 * Lighting" callout is pointing at. The strips are emissive geometry on all
 * four sides of both steps; the actual area lights are the two long runs of
 * each step, because the short ends contribute almost nothing to a room three
 * times longer than it is wide and cost exactly as much per fragment.
 */
function Cove({ state, gain }: { state: LightState; gain: number }) {
  const budget = BUDGET[useQuality()];
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const mat = useEmissiveMaterial(colour, GAIN.coveEmissive * glow);

  const steps = COFFER.slice(1).map((c, i) => ({
    ...c,
    // The strip sits on the lower ceiling just outside the step, firing up at
    // the reveal and the slab above it.
    y: COFFER[i].y + 0.05,
  }));

  return (
    <group>
      {steps.map((c, i) => {
        const inset = 0.16;
        const runs = [
          { pos: [(c.x0 + c.x1) / 2, c.y, c.z0 - inset], along: "x", len: c.x1 - c.x0 },
          { pos: [(c.x0 + c.x1) / 2, c.y, c.z1 + inset], along: "x", len: c.x1 - c.x0 },
          { pos: [c.x0 - inset, c.y, (c.z0 + c.z1) / 2], along: "z", len: c.z1 - c.z0 },
          { pos: [c.x1 + inset, c.y, (c.z0 + c.z1) / 2], along: "z", len: c.z1 - c.z0 },
        ] as const;
        return (
          <group key={`cove-${i}`}>
            {runs.map((r, j) => (
              <group key={j}>
                {/*
                  The two long runs of each step carry a light; the two short
                  ones carry only their strip. In a room twenty-four metres
                  long and seventeen wide the end runs are a tenth of the
                  cove's output and a sixth of its cost, and the strip is what
                  the eye reads as "lit" either way.
                */}
                {/*
                  And on the low tier, one of the two. Each step contributes a
                  pair, so a room with three steps is spending six rect-area
                  lights — the expensive type — on a cove whose *strips* are
                  what the eye actually reads as lit. Halving the pair leaves
                  the wash lopsided by a few per cent across a seventeen-metre
                  span, and nobody has ever noticed which side of a lobby
                  ceiling is a shade brighter.
                */}
                {MOUNTED && r.along === "z" && (budget.coveRuns > 1 || j === 2) && (
                  <rectAreaLight
                    position={r.pos as unknown as [number, number, number]}
                    rotation={[Math.PI / 2, 0, Math.PI / 2]}
                    width={r.len}
                    height={0.34}
                    intensity={GAIN.cove * out * gain}
                    color={colour}
                  />
                )}
                {false && r.along === "x" && i === 1 && (
                  <rectAreaLight
                    position={r.pos as unknown as [number, number, number]}
                    rotation={[Math.PI / 2, 0, 0]}
                    width={r.len}
                    height={0.34}
                    intensity={GAIN.cove * 0.7 * out * gain}
                    color={colour}
                  />
                )}
                <mesh
                  position={[r.pos[0], r.pos[1] - 0.04, r.pos[2]]}
                  rotation={[Math.PI / 2, 0, r.along === "x" ? 0 : Math.PI / 2]}
                >
                  <planeGeometry args={[r.len, 0.1]} />
                  <primitive object={mat} attach="material" />
                </mesh>
              </group>
            ))}
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Architectural                                                       */
/* ------------------------------------------------------------------ */

/**
 * Linear grooves down the panelled wall, and uplight slots in every column.
 *
 * This is the layer the sheet labels "clean lines and integrated lighting in
 * ceilings, walls and architectural elements" — light that describes the
 * building. It is also the layer that keeps the room legible at two in the
 * morning when general is at eighteen per cent, which is why Night runs it
 * higher than it runs the ceiling.
 */
function Architectural({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const mat = useEmissiveMaterial(colour, GAIN.archEmissive * glow);
  const height = COFFER[0].y;

  /** Three horizontal grooves in the panelled wall, at the sheet's heights. */
  const grooves = [1.15, 2.85, 4.55];

  return (
    <group>
      {grooves.map((y, i) => (
        <group key={`gr-${i}`}>
          {/*
            Two runs, not one.

            A single 23 m line passed straight behind the reception feature
            wall, which stands 180 mm proud of the flutes — so the middle
            third of every groove was occluded and the three lines appeared to
            start and stop in different places depending on what was in front
            of them. Split at the wall, they read as a set.
          */}
          {/*
            One run again, not two. The split existed because the reception
            wall used to stand ON this wall and interrupt the groove; the
            wall faces the camera now and the left wall is clear, so the
            groove runs the length of it as a single line.
          */}
          {[{ z0: 0.4, z1: HL.d - 0.4 }].map((r, k) => (
            <mesh
              key={k}
              position={[0.075, y, (r.z0 + r.z1) / 2]}
              rotation={[0, Math.PI / 2, 0]}
            >
              <planeGeometry args={[r.z1 - r.z0, 0.045]} />
              <primitive object={mat} attach="material" />
            </mesh>
          ))}
          {/* One of the three carries the light — a wall washed from three
              identical area sources is indistinguishable from one washed from
              a single wider one, and costs three times as much. */}
          {MOUNTED && i === 1 && (
            <rectAreaLight
              position={[0.14, y, HL.d / 2]}
              rotation={[0, Math.PI / 2, 0]}
              width={HL.d - 0.6}
              height={1.6}
              intensity={GAIN.arch * out * gain}
              color={colour}
            />
          )}
        </group>
      ))}

      {/* Column uplight slots. Emissive on every column, lit on one. */}
      {HL_PLAN.columns.map((z, i) => (
        <group key={`cu-${i}`} position={[HL_PLAN.columnX, 0, z]}>
          {[
            { p: [-0.472, height / 2, 0] as [number, number, number], r: -Math.PI / 2 },
            { p: [0, height / 2, 0.472] as [number, number, number], r: 0 },
          ].map((f, j) => (
            <mesh key={j} position={f.p} rotation={[0, f.r, 0]}>
              <planeGeometry args={[0.075, height - 0.5]} />
              <primitive object={mat} attach="material" />
            </mesh>
          ))}
          {MOUNTED && i === 2 && (
            <pointLight
              position={[-0.8, 2.6, 0]}
              intensity={GAIN.arch * 0.5 * out * gain}
              distance={7}
              decay={1.6}
              color={colour}
            />
          )}
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Decorative                                                          */
/* ------------------------------------------------------------------ */

/**
 * The chandelier cluster and the table lamps.
 *
 * Fifty-four globes at fifty-four staggered heights, as one instanced mesh.
 * Two of them carry a point light; the rest are glass. A cluster pendant is
 * read as a constellation of bright points, and a bright point is an emissive
 * sphere — the illumination it adds to a room seven metres below is a soft
 * wash that two sources reproduce exactly.
 */
export const GLOBES = Array.from({ length: 54 }, (_, i) => {
  const n1 = Math.sin(i * 12.9898) * 43758.5453;
  const n2 = Math.sin(i * 78.233) * 43758.5453;
  const n3 = Math.sin(i * 39.425) * 43758.5453;
  const a = n1 - Math.floor(n1);
  const b = n2 - Math.floor(n2);
  const c = n3 - Math.floor(n3);
  // A spiral rather than a scatter: the cluster has to read as designed.
  const t = i / 53;
  const turn = i * 2.39996;
  /*
   * About three metres across, solved from the landmark rather than from the
   * brief's metre value. The cluster spans x 0.44-0.57 of a 78-degree frame,
   * which is 13 per cent of the width; three metres only subtends that from
   * about fourteen metres away, and fourteen metres is also what puts the
   * lowest globe at the y 0.38 the same table asks for. The spiral used to
   * reach 2.9 m of radius - a six-metre cluster five metres from the lens,
   * which filled the upper half of every frame.
   */
  const radius = 0.25 + Math.sqrt(t) * 1.05 * (0.8 + a * 0.4);
  return {
    dx: Math.cos(turn) * radius,
    dz: Math.sin(turn) * radius,
    /**
     * Wider and much deeper than the first pass.
     *
     * At a 1.9 m spread over a 2.3 m drop the cluster was a dense ball — the
     * reference's is nearly three metres across and falls through three, and
     * the depth is what makes it read as a constellation rather than a bunch
     * of grapes. The globe sizes vary by two to one for the same reason:
     * identical spheres at identical spacing read as a diagram.
     */
    y: 6.25 - (1.0 - t) * 2.95 - b * 0.55,
    r: 0.075 + c * 0.095,
  };
});

function Decorative({ state, gain }: { state: LightState; gain: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cords = useRef<THREE.InstancedMesh>(null);
  const cores = useRef<THREE.InstancedMesh>(null);
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const { x, z } = HL_PLAN.chandelier;

  /**
   * Glass outside, filament inside.
   *
   * A single emissive sphere is a glowing ball, and fifty-four glowing balls
   * is a string of fairy lights. What a hand-blown globe pendant actually
   * shows is two things at once: a faint amber *shell* that catches the room
   * on its curve, and a small bright *core* burning behind it. Two instanced
   * meshes give both, and the core is what reads as a filament.
   *
   * `transmission` would be the physically right way to do the shell and is
   * deliberately not used: it makes three.js render the entire scene a second
   * time into a transmission buffer, every frame, and this is the largest
   * room in the project. A low-opacity physical material with a clearcoat is
   * indistinguishable at this size and costs one blend.
   */
  const globeMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#d9b47e",
        emissive: new THREE.Color("#ffffff"),
        emissiveIntensity: 0,
        roughness: 0.06,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        ior: 1.46,
        transparent: true,
        opacity: 0.42,
        envMapIntensity: 1.8,
        toneMapped: false,
      }),
    [],
  );
  const coreMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }),
    [],
  );
  useLayoutEffect(() => {
    globeMat.emissive.copy(colour);
    globeMat.emissiveIntensity = GAIN.decorativeGlobe * 0.45 * glow;
    // The core carries most of the brightness, which is why the shell can
    // stay glassy instead of being driven to white to be seen.
    // Strictly proportional. The 0.35 floor this used to carry left one
    // filament visibly burning in Cleaning, where the decorative circuit is
    // switched off — a lit lamp on a dead circuit is the one lighting fault
    // a client always spots.
    coreMat.color.copy(colour).multiplyScalar(3.1 * glow);
  });

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const core = cores.current;
    GLOBES.forEach((g, i) => {
      sc.setScalar(g.r);
      m.compose(new THREE.Vector3(x + g.dx, g.y, z + g.dz), q, sc);
      mesh.setMatrixAt(i, m);
      core?.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (core) core.instanceMatrix.needsUpdate = true;

    const cord = cords.current;
    if (!cord) return;
    const top = COFFER[2].y - 0.02;
    GLOBES.forEach((g, i) => {
      const len = top - g.y;
      sc.set(1, len, 1);
      m.compose(new THREE.Vector3(x + g.dx, g.y + len / 2, z + g.dz), q, sc);
      cord.setMatrixAt(i, m);
    });
    cord.instanceMatrix.needsUpdate = true;
  }, [x, z]);

  /**
   * Shades are lit *through*, not lit up.
   *
   * `useEmissiveMaterial` gives an aperture — the right thing for a cove slot
   * or a downlight lens, both of which really are holes with light behind
   * them. A fabric shade is a translucent surface with a lamp inside, so it
   * keeps a diffuse response as well, goes papery when something brighter is
   * nearby, and is darker at the top than at the hem. `useShadeMaterial` is
   * that, and it is why these stop looking like paper cones.
   */
  const shade = useShadeMaterial(colour, 2.2 * glow);

  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, globeMat, GLOBES.length]}>
        <sphereGeometry args={[1, 16, 12]} />
      </instancedMesh>
      <instancedMesh ref={cores} args={[undefined, coreMat, GLOBES.length]}>
        <sphereGeometry args={[0.3, 10, 8]} />
      </instancedMesh>
      {/* The drops.

          A cluster pendant without its cables is a swarm of floating balls —
          it was the single most artificial thing in the room. Each cable runs
          from the inner coffer slab down to its own globe, so the staggering
          reads as hanging rather than as scatter. One instanced draw. */}
      <instancedMesh ref={cords} args={[undefined, undefined, GLOBES.length]}>
        <cylinderGeometry args={[0.0045, 0.0045, 1, 5]} />
        <meshStandardMaterial color="#1c1a17" roughness={0.6} metalness={0.3} />
      </instancedMesh>
      {/*
        No canopy plate.

        A 1.9 m black disc on the ceiling is what a two-metre cluster needs if
        every cord is to land on one fitting, and it put a solid dark lid over
        the brightest part of the coffer. Real installations of this size are
        wired through individual ceiling points, so the cables simply
        disappear into the slab — which is both correct and what the reference
        shows.
      */}
      {MOUNTED && (
        <>
          <pointLight
            position={[x, 3.9, z]}
            intensity={GAIN.decorative * out * gain}
            distance={16}
            decay={1.5}
            color={colour}
          />

        </>
      )}

      {LAMPS.map((l, i) => (
        <group key={`lamp-${i}`} position={[l.x, 0, l.z]}>
          <mesh position={[0, l.y, 0]}>
            <cylinderGeometry args={[0.15, 0.21, 0.26, 16, 1, true]} />
            <primitive object={shade} attach="material" />
          </mesh>
          <mesh position={[0, l.y - 0.13, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.2, 16]} />
            <primitive object={shade} attach="material" />
          </mesh>
          {/* Three of the seven carry a light, placed just under the shade
              so the spill lands on the table rather than on the ceiling.
              Seven point lights in one room is seven per-fragment
              evaluations everywhere, for a difference nobody can see. */}
          {MOUNTED && i === 3 && (
            <pointLight
              position={[0, l.y - 0.12, 0]}
              intensity={GAIN.decorative * 0.42 * out * gain}
              distance={5.5}
              decay={1.8}
              color={colour}
            />
          )}
        </group>
      ))}
    </group>
  );
}


/* ------------------------------------------------------------------ */
/* Accent                                                              */
/* ------------------------------------------------------------------ */

/**
 * Narrow beams on the three things in the room worth pointing at.
 *
 * The sheet's accent callout reads "highlights artwork, textures and key
 * features", so the heads have to actually land on those: the canvas, the
 * sculpture on its plinth, and the reception wall. A head raking bare plaster
 * is a wall washer with better marketing.
 */
function Accent({ state, gain }: { state: LightState; gain: number }) {
  const budget = BUDGET[useQuality()];
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const strip = useEmissiveMaterial(colour, GAIN.accentEmissive * glow);
  const a = HL_PLAN.art;
  const w = HL_PLAN.deskWall;

  return (
    <group>
      {/* On the artwork. */}
      {MOUNTED && 0 < budget.accents && (
        <Spot
          position={[a.x, COFFER[0].y - 0.1, a.z + 1.5]}
          target={[a.x, a.y, a.z]}
          angle={0.42}
          penumbra={0.6}
          distance={12}
          decay={1.3}
          // Half the sculpture's figure. A canvas is a diffuse surface a metre
          // from the head; a bronze is three metres away and reflective, so
          // the same beam on both blows the painting flat white.
          intensity={GAIN.accent * 0.5 * out * gain}
          color={colour}
        />
      )}
      {/* On the sculpture. */}
      {MOUNTED && 1 < budget.accents && (
        <Spot
          position={[HL_PLAN.sculpture.x, COFFER[0].y - 0.1, HL_PLAN.sculpture.z + 1.4]}
          target={[HL_PLAN.sculpture.x, 1.5, HL_PLAN.sculpture.z]}
          angle={0.3}
          penumbra={0.5}
          distance={10}
          decay={1.3}
          intensity={GAIN.accent * 1.3 * out * gain}
          color={colour}
        />
      )}
      {/* Washing the reception wall, from a slot above it. */}
      {MOUNTED && 2 < budget.accents && (
        <rectAreaLight
          position={[(w.x0 + w.x1) / 2, w.y1 + 0.1, w.z + 0.6]}
          rotation={[0, 0, 0]}
          width={w.x1 - w.x0}
          height={2.4}
          intensity={GAIN.accent * 0.5 * out * gain}
          color={colour}
        />
      )}
      {/*
        Backlit panels behind the desk — five narrow slots, not one sheet.

        This started as a single emissive plane the size of the whole feature
        wall, which at an aperture brightness meant for a 40 mm strip put a
        nine-metre blown-white rectangle in the middle of the frame. What a
        backlit reception wall actually is, is a dark surface with light
        escaping between its panels: the slots are the fitting, the wall is
        what you see.
      */}
      {/*
        Evenly spaced, and on the grid the wall is actually built to.

        The flutes behind this wall sit at 140 mm centres, so a run of LED
        slots at some arbitrary division of the panel width lines up with
        nothing — it reads as decoration applied to joinery rather than as
        joinery. Nine slots at seven flutes apiece is 980 mm, which divides
        the 8.6 m panel evenly and lands every slot on a flute line.
      */}
      {Array.from({ length: SLOTS }, (_, i) => {
        const sx = (w.x0 + w.x1) / 2 + (i - (SLOTS - 1) / 2) * SLOT_PITCH;
        return (
          <mesh
            key={`slot-${i}`}
            position={[sx, (w.y0 + w.y1) / 2, w.z + 0.2]}
            rotation={[0, 0, 0]}
          >
            <planeGeometry args={[0.05, w.y1 - w.y0 - 0.44]} />
            <primitive object={strip} attach="material" />
          </mesh>
        );
      })}
      {/*
        LED underglow at the desk plinth.

        The desk is recessed 90 mm at the floor, and this is the line that
        makes the recess read as deliberate rather than as a gap. It is also
        the one accent in the room a guest stands directly over, which is why
        it is aimed down at the stone rather than out into the space.
      */}
      <mesh
        position={[
          HL_PLAN.desk.x,
          0.075,
          HL_PLAN.desk.z + HL_PLAN.desk.d / 2 - 0.1,
        ]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[HL_PLAN.desk.len - 0.2, 0.035]} />
        <primitive object={strip} attach="material" />
      </mesh>
      {MOUNTED && 3 < budget.accents && (
        <rectAreaLight
          position={[HL_PLAN.desk.x, 0.06, HL_PLAN.desk.z + 0.1]}
          rotation={[-Math.PI / 2, 0, 0]}
          width={HL_PLAN.desk.len}
          height={0.5}
          intensity={GAIN.accent * 0.22 * out * gain}
          color={colour}
        />
      )}

      {/* The lit top of the desk itself. */}
      <mesh
        position={[
          HL_PLAN.desk.x,
          HL_PLAN.desk.h + 0.012,
          HL_PLAN.desk.z - 0.3,
        ]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[HL_PLAN.desk.len - 0.3, 0.06]} />
        <primitive object={strip} attach="material" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Feature                                                             */
/* ------------------------------------------------------------------ */

/** The cascade behind the water wall. RGB, and the one layer that owns colour. */
function Feature({ state, gain }: { state: LightState; gain: number }) {
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const w = HL_PLAN.water;

  return (
    <group>
      {/* The cascade itself. It lives with the lighting rather than with the
          joinery because it *is* the fitting — the water is the aperture. */}
      <WaterWall colour={colour} level={glow} />
      {/*
        The one new light the look pass was allowed, spent here: a blue point
        a metre off the sheet, so the sculpture rims in silhouette against it
        and the flanking stone and floor take a blue pool. Rides the feature
        circuit, so Closing takes it down with the water.
      */}
      {MOUNTED && (
        <pointLight
          position={[(w.x0 + w.x1) / 2, 2.4, w.z + 1.0]}
          color="#2b5bff"
          intensity={2.2 * out * gain}
          distance={6}
          decay={2}
        />
      )}
      {/* Same axis, same mistake: unrotated, this emitted along -Z — into
          the back wall it is mounted on. The room is at +Z of it. */}
      {MOUNTED && (
        <rectAreaLight
          position={[(w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2, w.z + 0.1]}
          rotation={[0, Math.PI, 0]}
          width={w.x1 - w.x0}
          height={w.y1 - w.y0}
          intensity={GAIN.feature * out * gain}
          color={colour}
        />
      )}
      {/* A pool of the same colour on the floor in front of it. */}
      {MOUNTED && (
        <pointLight
          position={[(w.x0 + w.x1) / 2, 0.5, w.z + 1.3]}
          intensity={GAIN.feature * 0.5 * out * gain}
          distance={9}
          decay={1.6}
          color={colour}
        />
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Façade                                                              */
/* ------------------------------------------------------------------ */

/** Column grazers and landscape heads on the driveway side of the glass. */
function Facade({ state, gain }: { state: LightState; gain: number }) {
  const budget = BUDGET[useQuality()];
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const mat = useEmissiveMaterial(colour, GAIN.facadeEmissive * glow);

  const heads = [
    { x: HL.w + 2.4, z: 5.0 },
    { x: HL.w + 2.4, z: 11.5 },
    { x: HL.w + 2.4, z: 18.0 },
  ];

  return (
    <group>
      {heads.map((h, i) => (
        <group key={`fx-${i}`}>
          <mesh position={[h.x, 0.08, h.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.13, 14]} />
            <primitive object={mat} attach="material" />
          </mesh>
          {MOUNTED && i === 1 && (
            <pointLight
              position={[h.x, 1.6, h.z]}
              intensity={GAIN.facade * out * gain}
              distance={13}
              decay={1.4}
              color={colour}
            />
          )}
        </group>
      ))}
      {/* The entrance canopy line, grazing back toward the glass. */}
      <mesh position={[HL.w + 1.15, 4.3, HL.d / 2]} rotation={[Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[HL.d - 4, 0.09]} />
        <primitive object={mat} attach="material" />
      </mesh>
      {MOUNTED && 0 < budget.facade && (
        <rectAreaLight
          position={[HL.w + 1.15, 4.2, HL.d / 2]}
          rotation={[Math.PI / 2, 0, Math.PI / 2]}
          width={HL.d - 4}
          height={0.5}
          intensity={GAIN.facade * 0.5 * out * gain}
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
 * Sun and sky through the façade.
 *
 * The directional light is not decoration. `rectAreaLight` casts no shadow in
 * three.js, so on a bright afternoon with the general layer harvested down,
 * the room had no shadows in it at all and read completely flat. The sun
 * carries the shadows; the area light on the glazing plane carries the soft
 * wrap and is what daylight harvesting has to harvest.
 */
function Daylight({ amount, transmission }: { amount: number; transmission: number }) {
  const strength = amount * transmission;
  if (strength <= 0.004) return null;
  const f = HL_PLAN.facade;

  return (
    <group>
      {/*
        Four times the first pass, and still only the sun.

        A 408 m² room with twenty-four metres of glazing on one side is lit by
        the sky at noon, not by its ceiling — that is the whole argument for
        daylight harvesting, and the room has to show it or Morning and Day
        are just Evening with a cooler white in them. The directional carries
        the shadows (`rectAreaLight` casts none in three.js), so without it a
        harvested room has no shadows at all and reads completely flat.
      */}
      <directionalLight
        position={[HL.w + 14, 22, HL.d / 2 - 5]}
        /**
         * Four and a half, not eight and a half.
         *
         * The sun lights the inside and the outside alike, and the outside is
         * pale stone two metres from the glass — so the figure that made the
         * floor read as daylit also made the canopy the brightest object in
         * the frame. The interior gets its level back from the area light on
         * the glazing plane, which only reaches inward.
         *
         * Raised to 22 m as well, so the shaft through the façade falls
         * steeply across the floor instead of raking the back wall in a hard
         * diagonal band.
         */
        /**
         * Two and a half, not three and eight.
         *
         * The sun reaches the first four metres of floor inside the glass and
         * nothing else, so it is the term that sets the exposure *at the
         * façade* while contributing little in the middle of the room — which
         * is precisely the complaint: a white band along the window with a
         * correctly exposed lobby behind it. The area light on the glazing
         * plane falls off with distance and does the general filling, so it
         * takes the level back.
         */
        intensity={1.45 * strength}
        color={new THREE.Color("#fff1da")}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0012}
        // Tighter than the room, because resolution is the budget: 2048 px
        // over a 32 m box is 6 cm a texel and every shadow edge is a
        // staircase.
        shadow-camera-left={-13}
        shadow-camera-right={13}
        shadow-camera-top={13}
        shadow-camera-bottom={-13}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
      {/*
        Facing into the room, which it was not.

        `rectAreaLight` emits along its local -Z, and a Y rotation of -90
        degrees sends that to +X — straight out of the building. So the sky
        light was pouring onto the glass, the blinds, the canopy and the
        driveway at an intensity meant to fill a 408 m² room, and none of it
        was reaching the room: the window clipped to flat white at rgb(250,
        251, 251) while the floor stayed dark, and every attempt to fix the
        exterior by moving the backdrop around failed because the backdrop was
        never what was white.

        +90 degrees sends -Z to -X, into the lobby. This is the seventh time
        this project has got this axis wrong, which is why the sign is now
        worked out in the comment rather than in somebody's head.
      */}
      {/*
        Set a metre back from the glass, not 200 mm.

        A 119 m² source half a metre from the floor slab beside it delivers
        far more there than it does eight metres in, and measured that left
        23 per cent of the floor by the window clipped to white while the
        middle of the room sat correctly at 163. Moving the source inboard
        flattens that falloff across the bay — the far end of the room barely
        notices a metre, and the near end notices it a great deal.
      */}
      <rectAreaLight
        position={[f.x - 1.1, (f.y0 + f.y1) / 2, (f.z0 + f.z1) / 2]}
        rotation={[0, Math.PI / 2, 0]}
        width={f.z1 - f.z0}
        height={f.y1 - f.y0}
        /**
         * Twelve, where it was fifty-eight.
         *
         * Both of those were measured — the first with the light facing out
         * of the building, where almost none of it reached anything. Pointed
         * the right way it is 119 m² of emitter, against the living room's
         * 15.6, and a `rectAreaLight` delivers its intensity *times its
         * area*. At the old figure the lobby came back at rgb(250, 250, 250)
         * wall to wall. Twelve puts the floor at about 200 with the glazing
         * brighter still, which is what a daylit room looks like.
         */
        intensity={7.2 * strength}
        color={new THREE.Color("#d5e4f6")}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */

export interface LobbyFixtures {
  general: LightState;
  cove: LightState;
  arch: LightState;
  decor: LightState;
  accent: LightState;
  feature: LightState;
  facade: LightState;
}

export function HotelLobbyLightRig({
  fixtures,
  gain = 1,
  daylight = 0,
  transmission = 1,
}: {
  fixtures: LobbyFixtures;
  gain?: number;
  /** 0..1 exterior brightness from the simulated clock. */
  daylight?: number;
  /** 0..1 fraction the blinds let through. */
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
      <Downlights state={fixtures.general} gain={gain} />
      <Architectural state={fixtures.arch} gain={gain} />
      <Decorative state={fixtures.decor} gain={gain} />
      <Accent state={fixtures.accent} gain={gain} />
      <Feature state={fixtures.feature} gain={gain} />
      <Facade state={fixtures.facade} gain={gain} />
    </group>
  );
}
