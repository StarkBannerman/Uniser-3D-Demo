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
import { useEmissiveMaterial } from "./lightMaterials";
import { Spot } from "./Spot";
import { COFFER, HL, HL_PLAN, LAMPS, WaterWall } from "./HotelLobby3D";

const GAIN = {
  cove: 46,
  coveEmissive: 4.4,
  downlight: 46,
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

const EMITTERS = [
  { x: 4.4, z: 4.7 },
  { x: 10.0, z: 4.7 },
  { x: 4.4, z: 10.5 },
  { x: 10.0, z: 10.5 },
  { x: 13.0, z: 7.6 },
  { x: 4.4, z: 16.3 },
  { x: 10.0, z: 16.3 },
  { x: 13.0, z: 19.2 },
  { x: 7.2, z: 21.0 },
  { x: 2.0, z: 19.2 },
] as const;

function Downlights({ state, gain }: { state: LightState; gain: number }) {
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
              castShadow={i === 6}
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
                {/* Only the two long runs carry a light. */}
                {MOUNTED && r.along === "z" && (
                  <rectAreaLight
                    position={r.pos as unknown as [number, number, number]}
                    rotation={[Math.PI / 2, 0, Math.PI / 2]}
                    width={r.len}
                    height={0.34}
                    intensity={GAIN.cove * out * gain}
                    color={colour}
                  />
                )}
                {MOUNTED && r.along === "x" && i === 1 && (
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
          <mesh position={[0.075, y, HL.d / 2]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[HL.d - 0.6, 0.045]} />
            <primitive object={mat} attach="material" />
          </mesh>
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
          {MOUNTED && (i === 1 || i === 3) && (
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
  const radius = 0.35 + Math.sqrt(t) * 1.55 * (0.82 + a * 0.36);
  return {
    dx: Math.cos(turn) * radius,
    dz: Math.sin(turn) * radius,
    // Deepest in the middle, shortening outward — the classic cluster form.
    y: 5.42 - (1.0 - t) * 2.35 - b * 0.55,
    r: 0.1 + c * 0.075,
  };
});

function Decorative({ state, gain }: { state: LightState; gain: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cords = useRef<THREE.InstancedMesh>(null);
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const { x, z } = HL_PLAN.chandelier;

  const globeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        // Amber smoked glass: it keeps a body colour when the channel is off
        // instead of vanishing, which is what a real glass globe does.
        color: "#5a4128",
        emissive: new THREE.Color("#ffffff"),
        emissiveIntensity: 0,
        roughness: 0.2,
        metalness: 0,
        transparent: true,
        opacity: 0.88,
        toneMapped: false,
      }),
    [],
  );
  useLayoutEffect(() => {
    globeMat.emissive.copy(colour);
    globeMat.emissiveIntensity = GAIN.decorativeGlobe * glow;
  });

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    GLOBES.forEach((g, i) => {
      sc.setScalar(g.r);
      m.compose(new THREE.Vector3(x + g.dx, g.y, z + g.dz), q, sc);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;

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

  /** Table and floor lamps: shade apertures, lit from a shared pair of points. */
  const shade = useEmissiveMaterial(colour, 2.6 * glow);

  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, globeMat, GLOBES.length]}>
        <sphereGeometry args={[1, 14, 12]} />
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
          <pointLight
            position={[x, 5.1, z]}
            intensity={GAIN.decorative * 0.7 * out * gain}
            distance={13}
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
          {MOUNTED && (i === 0 || i === 3) && (
            <pointLight
              position={[0, l.y, 0]}
              intensity={GAIN.decorative * 0.35 * out * gain}
              distance={6}
              decay={1.7}
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
  const colour = colourOf(state);
  const out = output(state);
  const glow = aperture(state);
  const strip = useEmissiveMaterial(colour, GAIN.accentEmissive * glow);
  const a = HL_PLAN.art;
  const w = HL_PLAN.deskWall;

  return (
    <group>
      {/* On the artwork. */}
      {MOUNTED && (
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
      {MOUNTED && (
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
      {MOUNTED && (
        <rectAreaLight
          position={[0.6, w.y1 + 0.1, (w.z0 + w.z1) / 2]}
          rotation={[0, Math.PI / 2, 0]}
          width={w.z1 - w.z0}
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
      {[0, 1, 2, 3, 4].map((i) => {
        const span = w.z1 - w.z0 - 1.2;
        const z = w.z0 + 0.6 + (span / 4) * i;
        return (
          <mesh
            key={`slot-${i}`}
            position={[w.x + 0.33, (w.y0 + w.y1) / 2, z]}
            rotation={[0, Math.PI / 2, 0]}
          >
            <planeGeometry args={[0.055, w.y1 - w.y0 - 0.5]} />
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
          HL_PLAN.desk.x + HL_PLAN.desk.d / 2 - 0.1,
          0.075,
          (HL_PLAN.desk.z0 + HL_PLAN.desk.z1) / 2,
        ]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[0.035, HL_PLAN.desk.z1 - HL_PLAN.desk.z0 - 0.2]} />
        <primitive object={strip} attach="material" />
      </mesh>
      {MOUNTED && (
        <rectAreaLight
          position={[
            HL_PLAN.desk.x + 0.1,
            0.06,
            (HL_PLAN.desk.z0 + HL_PLAN.desk.z1) / 2,
          ]}
          rotation={[-Math.PI / 2, 0, Math.PI / 2]}
          width={HL_PLAN.desk.z1 - HL_PLAN.desk.z0}
          height={0.5}
          intensity={GAIN.accent * 0.22 * out * gain}
          color={colour}
        />
      )}

      {/* The lit top of the desk itself. */}
      <mesh
        position={[HL_PLAN.desk.x + 0.44, HL_PLAN.desk.h + 0.012, (HL_PLAN.desk.z0 + HL_PLAN.desk.z1) / 2]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[0.06, HL_PLAN.desk.z1 - HL_PLAN.desk.z0 - 0.3]} />
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
      {MOUNTED && (
        <rectAreaLight
          position={[(w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2, w.z + 0.1]}
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
          {MOUNTED && i !== 1 && (
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
      {MOUNTED && (
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
      <directionalLight
        position={[HL.w + 18, 13, HL.d / 2 - 5]}
        intensity={2.1 * strength}
        color={new THREE.Color("#fff1da")}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0012}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
      <rectAreaLight
        position={[f.x - 0.2, (f.y0 + f.y1) / 2, (f.z0 + f.z1) / 2]}
        rotation={[0, -Math.PI / 2, 0]}
        width={f.z1 - f.z0}
        height={f.y1 - f.y0}
        intensity={13 * strength}
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
