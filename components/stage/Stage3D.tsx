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
  useEffect,
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
import { StageStatus } from "./StageStatus";
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
 * One device pixel ratio, for everybody.
 *
 * Measured on the hotel lobby on an M1: 1.25 to 1.0 took it from 8.1 to 9.2
 * frames a second. Fourteen per cent for thirty-six per cent fewer pixels,
 * which says most of the cost is not per-pixel at all — three.js uploads
 * every light's uniforms on every draw call, and that is paid per draw, not
 * per fragment. Cutting the light count is what actually moved this room, by
 * a factor of four.
 *
 * There is no rung above 1.0. A demo is shown on a projector or a shared
 * screen far more often than on a retina panel, and the half-stop of
 * sharpness 1.25 buys is not worth it on the one machine in the room that
 * matters.
 *
 * **And there is no longer a ladder below it.** There was: a governor that
 * watched frame times and stepped the resolution down. It had to go, and the
 * reason is worth keeping. `<Canvas dpr={[min, max]} />` hands R3F a *range*,
 * and R3F then owns the value inside it — so every time the governor called
 * `setDpr`, the next Canvas render put it back. Traced: the governor dropped
 * to 0.6 at t=23805 ms, the canvas went black at 23905, and R3F restored 1.0
 * at 23932. Two owners, one number, and a visible blank every time they
 * disagreed. That blank is what a client reported as "part of the screen goes
 * blank for a second".
 *
 * A correct version would make this component the single owner and drive the
 * Canvas from state. It is not worth it yet: the measured prize is fourteen
 * per cent, and the room it was written to protect now runs at forty frames a
 * second without it.
 */
const DPR = 1.0;

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
 * Hold the room back until it is genuinely ready to be looked at.
 *
 * three.js compiles a material's shader the first time it draws with it, so
 * opening a room used to mean watching it assemble: a black box, then a
 * partial scene, then a few seconds of stutter as 49 programs came up one at a
 * time. Measured on this machine that is about 98 shader compiles, and a
 * slower machine spends correspondingly longer doing it in full view of a
 * client.
 *
 * `compileAsync` does all of it up front. Where the browser supports
 * `KHR_parallel_shader_compile` it hands the work to the driver and returns a
 * promise, so the page stays responsive instead of freezing — which is the
 * whole reason for preferring it to the synchronous `compile`.
 *
 * Then two frames: the first draws, the second proves the first was not a
 * one-off. Only then is the room uncovered, and it is uncovered finished.
 */
function ReadyGate({ onReady }: { onReady: (ready: boolean) => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const renderer = gl as THREE.WebGLRenderer & {
          compileAsync?: (
            scene: THREE.Object3D,
            camera: THREE.Camera,
          ) => Promise<unknown>;
        };
        if (typeof renderer.compileAsync === "function") {
          await renderer.compileAsync(scene, camera);
        } else {
          gl.compile(scene, camera);
        }
      } catch {
        // A driver that refuses to pre-compile is not a reason never to show
        // the room; it just means the stutter comes back.
      }
      if (cancelled) return;
      invalidate();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!cancelled) onReady(true);
        }),
      );
    };

    // A tick, so every child has committed its objects into the scene graph
    // before the renderer is asked to compile what is in it.
    const t = setTimeout(run, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [gl, scene, camera, invalidate, onReady]);

  return null;
}

/**
 * The room arrives rather than loading.
 *
 * This was a branded panel — name, bar, "Building the room…" — and it worked,
 * but it announced a wait. A demo should not tell a client it is busy; it
 * should simply not be seen until it is ready, which is the same gate with
 * none of the furniture. So: a plain cover in the stage's own background
 * colour that fades once `ReadyGate` says the shaders are compiled and two
 * frames have drawn.
 *
 * On a fast machine nothing appears to happen at all — the room is simply
 * there. On a slow one there is a held beat and then a room, instead of a
 * black box assembling itself in front of somebody.
 */
function RoomReveal({ gone }: { gone: boolean }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-30 bg-shell-950 transition-opacity duration-700 ease-out ${
        gone ? "opacity-0" : "opacity-100"
      }`}
    />
  );
}

function RenderPump({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate);

  useLayoutEffect(() => {
    let frame = 0;
    let last = 0;
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
        last = t;
        if (motion === "transition") signature = visualSignature();
        invalidate();
      }
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [invalidate, fps]);

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
  const [ready, setReady] = useState(false);

  const fill = new THREE.Color(
    ambient.color[0] / 255,
    ambient.color[1] / 255,
    ambient.color[2] / 255,
  );
  // Floor bounce is the same light, warmer and much weaker.
  const ground = fill.clone().multiplyScalar(0.45).offsetHSL(0.02, 0.05, -0.12);
  return (
    <div className="relative h-full w-full">
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
       * One number, not a range. A range makes R3F the owner of the value
       * inside it, and a second owner is what caused the blanking described
       * above `DPR`.
       */
      dpr={quality === "low" ? 0.85 : DPR}
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
        <RenderPump fps={FRAME_CAP[quality]} />
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
        {/* After the children, so the scene graph is populated when it runs. */}
        <ReadyGate onReady={setReady} />
      </Suspense>
    </Canvas>
      <RoomReveal gone={ready} />
      <StageStatus />
    </div>
  );
}
