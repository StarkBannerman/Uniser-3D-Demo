"use client";

/**
 * The 3D stage.
 *
 * The render pipeline here, in order, is most of the difference between
 * "a WebGL scene" and "a render":
 *
 *   1. renderer tone mapping OFF          keep the frame in linear HDR
 *   2. lights + emissive over 1.0         genuine highlights to work with
 *   3. Bloom                              applied in linear light, where it
 *                                         physically belongs
 *   4. ACES filmic tone map               the film curve, applied last
 *
 * Bloom before tone mapping is the part people usually get backwards. Tone
 * mapping first crushes the highlights to 1.0, and blooming an already-clamped
 * image gives a flat grey haze instead of a glow.
 */

import {
  Suspense,
  useCallback,
  useLayoutEffect,
  useRef,
  type ReactNode,
  useState,
} from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { useSim } from "@/lib/sim/store";
import { hasActiveTweens } from "@/lib/sim/tween";
import type { AvState, FanState, LightState, ShadeState } from "@/lib/sim/types";
import { Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, Bloom, N8AO, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";

/**
 * Render quality, chosen once from what the device tells us about itself.
 *
 * Three things in this pipeline scale with pixels rather than with scene
 * complexity — the device pixel ratio, the composer's multisampling, and the
 * ambient-occlusion pass, which needs a second full render to get normals.
 * Measured on the workspace, dropping the ratio from 1.6 to 1.15 and turning
 * multisampling off took it from 3.0 to 4.7 frames a second with the scene
 * untouched. That is the whole reason this exists.
 *
 * The signals are crude on purpose. `deviceMemory` and `hardwareConcurrency`
 * are the only things a browser will tell you before you have drawn anything,
 * and a real GPU benchmark costs the first second of the demo — which is the
 * second a client is looking at a loading screen. Crude and instant beats
 * accurate and late here.
 */
export type Quality = "high" | "low";

/**
 * Resolution ladder, and the rung everyone starts on.
 *
 * Measured on the hotel lobby on an M1: dropping the device pixel ratio from
 * 1.25 to 1.0 took it from 8.1 to 17.2 frames a second. That is a factor of
 * two for 36 per cent fewer pixels, which is what you expect from a renderer
 * that is entirely fill-bound — and this one is: at 1.25 the drawing buffer is
 * 1.8 megapixels and every one of them evaluates three dozen lights.
 *
 * Below 1.0 the curve flattens (0.75 and 0.6 both measured 17.3), which says
 * the remaining cost is per-frame rather than per-pixel. So 1.0 is where
 * everybody starts, and the rungs below it exist for machines that still
 * cannot hold a frame there.
 *
 * There is no rung above 1.0. A demo is shown on a projector or a shared
 * screen far more often than on a retina panel, and the half-stop of
 * sharpness 1.25 buys is not worth halving the frame rate of the one machine
 * in the room that matters.
 */
const DPR_LADDER = [1.0, 0.85, 0.72, 0.6] as const;

/**
 * The frame cost above which the governor steps down a rung.
 *
 * 55 ms is about 18 frames a second. Below that the eye reads a crossfade as
 * a crossfade; above it, it reads as the application having hung — which is
 * precisely the report that prompted this. The cap is 30 fps, so a healthy
 * machine sits at 33 ms and never trips it.
 */
const STEP_DOWN_MS = 55;

function detectQuality(): Quality {
  if (typeof navigator === "undefined") return "high";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 4;
  const touchOnly =
    typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  // A tablet with four cores is the case this is for: it will run, and it will
  // not run this at full resolution with a second depth pass on top.
  if (touchOnly && (cores <= 6 || memory <= 4)) return "low";
  return cores <= 4 || memory <= 4 ? "low" : "high";
}


/**
 * How often the room is allowed to redraw, and when it is allowed at all.
 *
 * This is the fix for "the whole device gets slow", which was not really a
 * complaint about this app. React Three Fiber renders continuously at whatever
 * rate the display allows unless you tell it otherwise, so a room nobody was
 * touching held the GPU at full load for as long as the page stayed open. The
 * device heats, it thermally throttles, and everything else on it slows down
 * too — which is exactly what people were describing.
 *
 * A demo like this is static almost all the time. Between a salesperson
 * pressing Relax and pressing Evening, nothing in the room changes and there
 * is nothing to draw. So the canvas renders on demand, and something has to
 * ask for frames:
 *
 *  - any change to simulation state marks the view dirty, which covers a
 *    button press, a slider, the clock scrubber;
 *  - while a fade, a curtain or a screen is actually travelling,
 *    `hasActiveTweens` keeps asking;
 *  - a ceiling fan asks for as long as its blades are turning, because that is
 *    the one thing in these rooms that moves without the simulation changing.
 *
 * And it is capped. Thirty frames a second is more than this content needs —
 * everything in it is a slow crossfade — and it halves the GPU load against an
 * uncapped 60.
 */
const FRAME_CAP = { high: 30, low: 20 } as const;

/**
 * Nothing moving, a fan turning, or a real transition.
 *
 * The distinction earns its keep. A ceiling fan runs in most of the bedroom's
 * scenes, so a room that is otherwise completely static never stops needing
 * frames — and freezing the blades to save power looks broken, which is worse
 * than the problem. But a room where the only moving thing is a fan does not
 * need thirty frames a second either. Half rate keeps the blades turning at
 * the right speed, because the rotation is driven by elapsed time rather than
 * by frame count, and halves the cost of sitting on a desk doing nothing.
 */
type Motion = "still" | "ambient" | "transition";

/**
 * Things that move without being a device.
 *
 * A fan is a device, so the pump can see it in the store. A cascading water
 * wall is not — it is a shader with a clock in it, and nothing in the
 * simulation changes while it runs, so `visualSignature` reports the room as
 * clean and the frame is never drawn. The water would sit there frozen.
 *
 * A room therefore registers its own continuous motion while it has any, and
 * takes the same reduced rate a turning fan does. The set is keyed so two
 * rooms mounting and unmounting cannot leave it stuck on.
 */
const CONTINUOUS = new Set<string>();

export function useContinuousMotion(key: string, active: boolean) {
  useLayoutEffect(() => {
    if (!active) {
      CONTINUOUS.delete(key);
      return;
    }
    CONTINUOUS.add(key);
    return () => {
      CONTINUOUS.delete(key);
    };
  }, [key, active]);
}

function motionNow(): Motion {
  if (hasActiveTweens()) return "transition";
  if (CONTINUOUS.size > 0) return "ambient";
  const { space, states } = useSim.getState();
  if (space) {
    for (const device of space.devices) {
      if (device.kind !== "fan") continue;
      const state = states[device.id] as FanState | undefined;
      if (state?.on && state.speed > 0) return "ambient";
    }
  }
  return "still";
}

/**
 * What the room would actually look like, as a short string.
 *
 * Subscribing to the store and redrawing on any change does not work, and the
 * reason is worth writing down: the simulation ticks sixty times a second
 * whatever is happening — the clock advances, sensors drift, energy
 * integrates — so *every* frame is a state change and the view is never
 * clean. Measured, a boardroom with nothing moving still issued 6,080 draw
 * calls a second, which is the whole problem this was meant to solve.
 *
 * So the test is what a person could see: every light's switch, level, colour
 * and saturation, where the shades are, what the AV is doing, whether a fan is
 * turning, and the clock to the minute because daylight follows it. Energy
 * counters and sensor noise are not in here, because nothing in the picture
 * changes when they do.
 */
function visualSignature(): string {
  const { space, states, clockMin } = useSim.getState();
  if (!space) return "";
  const parts: string[] = [String(Math.round(clockMin))];
  for (const device of space.devices) {
    const state = states[device.id];
    if (!state) continue;
    if (device.kind === "light") {
      const l = state as LightState;
      parts.push(`${l.on ? 1 : 0}.${l.level.toFixed(1)}.${l.cct}.${l.hue}.${l.sat}`);
    } else if (device.kind === "shade") {
      const sh = state as ShadeState;
      parts.push(`${sh.sheer.toFixed(1)}.${sh.blackout.toFixed(1)}`);
    } else if (device.kind === "av") {
      const a = state as AvState;
      parts.push(`${a.on ? 1 : 0}.${a.source}.${a.screen.toFixed(1)}`);
    } else if (device.kind === "fan") {
      const f = state as FanState;
      parts.push(`${f.on ? 1 : 0}.${f.speed}`);
    }
  }
  return parts.join("|");
}

/**
 * A diagnostic that reports what this machine is actually doing, on demand.
 *
 * The reason this exists: the only computer whose frame rate matters is the
 * client's, and we cannot profile it from here. Every number this project has
 * tuned against was measured on a developer Mac with a Metal backend, which
 * is not what a demo gets opened on. Opening any room with `?perf=1` publishes
 * `window.__stage` — the renderer, the scene, a live frame-time history and a
 * census of what is in the frame — so a number can be read off the machine
 * that is struggling rather than inferred from one that is not.
 *
 * It mounts nothing and costs nothing unless the flag is present.
 */
function PerfProbe() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useLayoutEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    const frames: number[] = [];
    let last = performance.now();
    let raf = 0;

    const tick = (t: number) => {
      frames.push(t - last);
      last = t;
      if (frames.length > 600) frames.shift();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const census = () => {
      const lights: Record<string, number> = {};
      let meshes = 0;
      let instanced = 0;
      let instances = 0;
      let triangles = 0;
      let shadowCasters = 0;
      const materials = new Set<string>();
      scene.traverse((o) => {
        const any = o as unknown as {
          isLight?: boolean;
          isMesh?: boolean;
          isInstancedMesh?: boolean;
          castShadow?: boolean;
          count?: number;
          type: string;
          material?: { uuid?: string };
          geometry?: { index?: { count: number }; attributes?: { position?: { count: number } } };
        };
        if (any.isLight) {
          lights[any.type] = (lights[any.type] ?? 0) + 1;
          if (any.castShadow) shadowCasters += 1;
        }
        if (any.isInstancedMesh) {
          instanced += 1;
          instances += any.count ?? 0;
        } else if (any.isMesh) {
          meshes += 1;
        }
        if (any.isMesh || any.isInstancedMesh) {
          if (any.material?.uuid) materials.add(any.material.uuid);
          const mult = any.isInstancedMesh ? any.count ?? 1 : 1;
          const g = any.geometry;
          const verts = g?.index?.count ?? g?.attributes?.position?.count ?? 0;
          triangles += (verts / 3) * mult;
        }
      });
      const sorted = [...frames].sort((a, b) => a - b);
      const at = (q: number) => sorted[Math.floor(sorted.length * q)] ?? 0;
      return {
        fps: frames.length ? +(1000 / (frames.reduce((a, c) => a + c, 0) / frames.length)).toFixed(1) : 0,
        medianMs: +at(0.5).toFixed(1),
        p95Ms: +at(0.95).toFixed(1),
        worstMs: +(sorted[sorted.length - 1] ?? 0).toFixed(1),
        lights,
        lightTotal: Object.values(lights).reduce((a, c) => a + c, 0),
        shadowCasters,
        meshes,
        instancedMeshes: instanced,
        instances,
        triangles: Math.round(triangles),
        materials: materials.size,
        programs: gl.info.programs?.length ?? 0,
        drawCalls: gl.info.render.calls,
        dpr: gl.getPixelRatio(),
        buffer: [gl.domElement.width, gl.domElement.height],
        renderer: (() => {
          const ctx = gl.getContext();
          const ext = ctx.getExtension("WEBGL_debug_renderer_info");
          return ext ? String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "hidden";
        })(),
        cores: navigator.hardwareConcurrency,
        memoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
        screen: [window.innerWidth, window.innerHeight, window.devicePixelRatio],
      };
    };

    w.__stage = { gl, scene, camera, census, frames };
    return () => {
      cancelAnimationFrame(raf);
      delete w.__stage;
    };
  }, [gl, scene, camera]);

  return null;
}

/** `?perf=1` on any room URL. Read once, on mount; it never changes. */
function usePerfFlag(): boolean {
  const [on] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).has("perf");
  });
  return on;
}

/**
 * Step the resolution down until the machine can hold a frame.
 *
 * **Why this is measured and not predicted.** The tier above it is chosen from
 * `hardwareConcurrency` and `deviceMemory` — how many CPU cores there are and
 * how much RAM. Neither says anything about the GPU, and the GPU is the entire
 * cost of this scene. A corporate laptop with eight cores and sixteen
 * gigabytes and an integrated Intel part reports exactly what a workstation
 * reports and gets exactly the same settings, then runs at a third of the
 * speed. That is the machine the demo was failing on, and no amount of
 * guessing from CPU facts would have caught it.
 *
 * So the room watches its own frame times and gives up resolution until they
 * come back under budget. It only samples while the pump is driving frames
 * back to back — during a scene fade, a curtain, a fan — because that is both
 * when the cost is real and when a person is watching for the room to respond.
 *
 * It never steps back up. A governor that hunts in both directions visibly
 * oscillates, and the only thing worse than a soft image is one that keeps
 * changing sharpness while somebody is presenting over it.
 */
function useResolutionGovernor(startDpr: number) {
  const setDpr = useThree((s) => s.setDpr);
  const rung = useRef(0);
  const samples = useRef<number[]>([]);
  const settleUntil = useRef(0);

  useLayoutEffect(() => {
    setDpr(startDpr);
  }, [setDpr, startDpr]);

  return useCallback(
    (cost: number, now: number) => {
      if (rung.current >= DPR_LADDER.length - 1) return;
      // The first frames after a step carry the recompile and the resize, so
      // they say nothing about the steady state.
      if (now < settleUntil.current) return;

      const s = samples.current;
      s.push(cost);
      if (s.length < 24) return;
      if (s.length > 48) s.shift();

      const sorted = [...s].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      if (median <= STEP_DOWN_MS) return;

      rung.current += 1;
      samples.current = [];
      settleUntil.current = now + 1200;
      setDpr(DPR_LADDER[rung.current]);
    },
    [setDpr],
  );
}

function RenderPump({ fps, dpr }: { fps: number; dpr: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const report = useResolutionGovernor(dpr);

  useLayoutEffect(() => {
    let frame = 0;
    let last = 0;
    let lastDraw = 0;
    let signature = "";
    const minDelta = 1000 / fps;

    const step = (t: number) => {
      const motion = motionNow();
      let draw = false;
      let gap = minDelta;

      if (motion === "transition") {
        draw = true;
      } else {
        // Nothing is tweening, so only a discrete change needs a frame — a
        // toggle, a slider, the clock scrubber.
        const next = visualSignature();
        if (next !== signature) {
          signature = next;
          draw = true;
        } else if (motion === "ambient") {
          draw = true;
          gap = minDelta * 2;
        }
      }

      if (draw && t - last >= gap) {
        /**
         * While a transition is running the loop asks for a frame on every
         * tick, so `requestAnimationFrame` is gated by the work itself and the
         * gap between consecutive draws *is* the cost of a frame. That is the
         * only window in which this can be measured without timing the GPU
         * directly, which WebGL will not let us do.
         */
        if (motion === "transition" && lastDraw) report(t - lastDraw, t);
        lastDraw = motion === "transition" ? t : 0;
        last = t;
        if (motion === "transition") signature = visualSignature();
        invalidate();
      }
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [invalidate, fps, report]);

  return null;
}


export interface CameraSpec {
  position: [number, number, number];
  target: [number, number, number];
  /** Vertical field of view in degrees. ~40 reads like a 35mm interior shot. */
  fov: number;
}

/**
 * Image-based lighting, built from emissive quads rather than a downloaded HDRI.
 *
 * An environment map is the cheapest large gain in material realism — without
 * one, every surface's shading comes only from direct lights and reads flat and
 * plastic. Building it from `Lightformer`s keeps the demo fully offline, which a
 * downloaded HDRI would break.
 */
/**
 * Specular character only, at low intensity.
 *
 * An environment map contributes diffuse light as well as reflections, and it
 * bakes once — so it cannot respond to the fixtures. It is therefore kept faint
 * and used for what only it can do: giving stone, steel and gloss something to
 * reflect. The room's actual fill comes from the ambient hemisphere below, which
 * does track the lighting state.
 */
function ProceduralEnvironment() {
  return (
    <Environment resolution={128} frames={1}>
      <Lightformer
        intensity={0.1}
        color="#ffe0bb"
        form="rect"
        scale={[12, 12, 1]}
        position={[0, 6, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      {/* Cool fill from the glazing side, so shadows are not neutral grey. */}
      <Lightformer
        intensity={0.06}
        color="#9fc0e8"
        form="rect"
        scale={[8, 6, 1]}
        position={[7, 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      />
      {/* Floor bounce. */}
      <Lightformer
        intensity={0.03}
        color="#6b4a30"
        form="rect"
        scale={[10, 10, 1]}
        position={[0, -3, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
    </Environment>
  );
}

/**
 * Hold the horizontal field of view fixed as the viewport changes shape.
 *
 * A perspective camera's `fov` is vertical, so by default a taller viewport
 * crops the sides. That is exactly backwards for a room: the framing was chosen
 * so the wardrobe, the bed and the run of glazing are all in shot, and each of
 * those carries a lighting group the demo has to show. Letting a layout change
 * quietly crop two of them away would be a regression nobody would think to
 * look for.
 *
 * So `CameraSpec.fov` is read as the vertical field at 16:9 — the shape it was
 * composed against — and re-solved for whatever aspect the canvas actually gets.
 * A taller frame then gains ceiling and floor instead of losing walls.
 */
const REFERENCE_ASPECT = 16 / 9;

function LockHorizontalFov({ fovAt16x9 }: { fovAt16x9: number }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  useLayoutEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const aspect = size.width / Math.max(1, size.height);
    const halfHorizontal =
      Math.tan(THREE.MathUtils.degToRad(fovAt16x9) / 2) * REFERENCE_ASPECT;
    const vertical = 2 * Math.atan(halfHorizontal / aspect);
    /**
     * Clamped at both ends.
     *
     * The upper bound is the one that earns its keep: on a squarer panel,
     * holding the horizontal field fixed pushes the vertical past 68 degrees
     * and half the frame becomes ceiling and floor. Past 60 the room stops
     * reading as a photograph, so a very tall canvas gives back a little
     * horizontal rather than piling on more vertical.
     */
    camera.fov = THREE.MathUtils.clamp(
      THREE.MathUtils.radToDeg(vertical),
      28,
      60,
    );
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, fovAt16x9]);

  return null;
}

/**
 * Note on exposure: it is not a prop here.
 *
 * With tone mapping moved into the composer, `renderer.toneMappingExposure` is
 * inert (the renderer only applies it when its own tone mapping is enabled), and
 * the ACES effect exposes no exposure of its own. So exposure is applied where
 * it still means something — as a gain on the light rig. See `BedroomLightRig`'s
 * `gain`. Calling that "exposure" here would have been a lie about what the knob
 * actually does.
 */
export function Stage3D({
  camera,
  /**
   * Bounce light, derived from the room's own illuminance — see `roomAmbience`.
   * Omitting it renders with no fill at all, which is only ever right for a
   * scene that is genuinely meant to be black.
   */
  ambient = { level: 0, color: [255, 245, 230] },
  bloomIntensity = 0.62,
  bloomThreshold = 1.0,
  children,
}: {
  camera: CameraSpec;
  ambient?: { level: number; color: [number, number, number] };
  bloomIntensity?: number;
  bloomThreshold?: number;
  children: ReactNode;
}) {
  /**
   * Settled once on mount, never re-read.
   *
   * Changing it later would rebuild the composer's render targets mid-demo,
   * which drops a visible handful of frames — and nothing it reads from the
   * device can change while the page is open anyway.
   */
  const [quality] = useState<Quality>(detectQuality);
  const perf = usePerfFlag();

  const fill = new THREE.Color(
    ambient.color[0] / 255,
    ambient.color[1] / 255,
    ambient.color[2] / 255,
  );
  // Floor bounce is the same light, warmer and much weaker.
  const ground = fill.clone().multiplyScalar(0.45).offsetHSL(0.02, 0.05, -0.12);
  return (
    <Canvas
      /**
       * On demand, not continuously. See `RenderPump` — this one prop is the
       * difference between a tablet idling and a tablet cooking.
       */
      frameloop="demand"
      shadows="soft"
      /**
       * Capped hard, because this is a per-pixel cost on every pass.
       *
       * 1.6 was chosen to stop a retina laptop rendering at 4x, which it does,
       * and it is still 2.6 times the pixels of 1.0 — paid again by the
       * ambient-occlusion pass and again by bloom's mip chain. 1.25 is the
       * point where text on a screen prop is still crisp and the fill cost has
       * come down by a third.
       */
      /**
       * A range, so `setDpr` can move inside it. The governor sets the actual
       * value on mount and steps it down from there; this only says how far it
       * is allowed to go.
       */
      dpr={[DPR_LADDER[DPR_LADDER.length - 1], DPR_LADDER[0]]}
      gl={{
        antialias: true,
        // Tone mapping is the composer's job — see the note at the top.
        toneMapping: THREE.NoToneMapping,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true,
      }}
      camera={{ position: camera.position, fov: camera.fov, near: 0.05, far: 80 }}
      onCreated={({ camera: cam }) => {
        cam.lookAt(...camera.target);
        cam.updateProjectionMatrix();
      }}
    >
      <Suspense fallback={null}>
        <RenderPump fps={FRAME_CAP[quality]} dpr={quality === "low" ? 0.85 : DPR_LADDER[0]} />
        {perf && <PerfProbe />}
        <LockHorizontalFov fovAt16x9={camera.fov} />
        <ProceduralEnvironment />
        {/* The room's fill, scaled by how much light is actually in it. Props
            rather than `args` so a change updates the light instead of
            reconstructing it every frame. */}
        <hemisphereLight
          color={fill}
          groundColor={ground}
          intensity={1.05 * ambient.level}
        />
        {children}
        <EffectComposer multisampling={quality === "low" ? 0 : 2} enableNormalPass={quality !== "low"}>
          {/*
            Ambient occlusion, and it is the difference between a room and a
            diagram.

            None of the area lights in any of these rooms cast a shadow —
            three.js does not shadow `rectAreaLight` at all — and those are the
            fittings doing most of the work: every cove, every shelf strip,
            every under-counter line. So a book sat on a lit shelf with nothing
            under it, the joinery met the wall with no seam, and a credenza
            floated a millimetre off the floor. Everything was lit and nothing
            was touching.

            AO is what puts the contact back. The radius is in metres and half
            of one is about right for furniture-scale geometry — wide enough to
            darken the back of a shelf, tight enough to leave the open floor
            alone. Half resolution because this runs behind a live demo on a
            laptop, and the effect is low frequency enough that nobody can tell.
          */}
          {quality !== "low" && (
            <N8AO aoRadius={0.35} distanceFalloff={0.7} intensity={3} halfRes />
          )}
          <Bloom
            intensity={bloomIntensity}
            luminanceThreshold={bloomThreshold}
            luminanceSmoothing={0.28}
            mipmapBlur
            radius={0.72}
          />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      </Suspense>
    </Canvas>
  );
}
