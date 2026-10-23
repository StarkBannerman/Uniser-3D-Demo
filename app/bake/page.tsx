"use client";

/**
 * Offline path-trace of a room, for baking backplates. Development only.
 *
 *   /bake?samples=400
 *
 * The live stage rasterises: every light is evaluated per fragment, nothing
 * bounces, and the bounce is faked with a single hemisphere term. That is the
 * right trade for sixty frames a second and the wrong one for a still. Here
 * the same scene — the component the live stage mounts, not a second copy of
 * the room — is handed to a path tracer, which computes the bounce for real
 * and has all the time in the world.
 *
 * The fake bounce is deliberately *not* added. `Stage3D` mounts a hemisphere
 * light scaled from `roomAmbience` to stand in for inter-reflection; a path
 * tracer computes inter-reflection properly, so leaving it in would light the
 * room twice.
 */

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { WebGLPathTracer } from "three-gpu-pathtracer";
import { LockHorizontalFov } from "@/components/stage/Stage3D";
import { useSim } from "@/lib/sim/store";
import { useTicker } from "@/lib/sim/useTicker";
import { hotelLobby } from "@/lib/spaces/hospitality/hotel-lobby";
import { LobbyScene, LOBBY_CAMERA } from "@/components/stage/rooms3d/HotelLobbyStage";

/**
 * Which room to trace.
 *
 * The lobby, since the car showroom retired — it mounts the same scene
 * component the live stage does, so the trace is of the shipping room and
 * not of a second model of it. A room added here needs the same property.
 */
const ROOMS = {
  lobby: { space: hotelLobby, camera: LOBBY_CAMERA },
} as const;

function Tracer({
  samples,
  onProgress,
}: {
  samples: number;
  onProgress: (n: number) => void;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const tracer = useRef<WebGLPathTracer | null>(null);
  const swapped = useRef(false);

  /**
   * Stand in for materials the tracer cannot read.
   *
   * `three-gpu-pathtracer` walks every material expecting the PBR fields of a
   * standard or physical material. The lobby's cascade is a `ShaderMaterial`
   * with uniforms and no `.color`, so the walk died on `.color.r` before a
   * single sample was taken - the bake came back as the rasterised frame with
   * "0 / 220 samples" still on it, which looks like a slow trace rather than
   * a dead one.
   *
   * Substituted rather than skipped, because the cascade is a light source in
   * this room: dropping it would bake a lobby whose feature wall is off. An
   * emissive stand-in of roughly the right colour puts the same light into
   * the room, which is all the bake needs from it.
   */
  /**
   * The emissive stand-in both substitutions build. Roughness is high and
   * metalness zero on purpose: the surface is only ever a carrier for the
   * emission, and a glossy one would add a highlight the original never had.
   *
   * `gain` is a stand-in too, not a measurement. The rasterised room drives
   * these surfaces well past white and lets bloom do the rest, so there is no
   * single number here that is "correct" - these want calibrating against the
   * raster once the comparison is being read seriously.
   */
  const standIn = (col: THREE.Color, gain: number) =>
    new THREE.MeshStandardMaterial({
      color: col,
      emissive: col,
      emissiveIntensity: gain,
      roughness: 0.3,
    });

  const substitute = (root: THREE.Object3D) => {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const list = Array.isArray(m.material) ? m.material : [m.material];
      m.material = list.map((mat) => {
        const t = mat as THREE.Material & { uniforms?: Record<string, { value: unknown }> };
        if ((t as THREE.ShaderMaterial).isShaderMaterial) {
          const u = t.uniforms?.uColor?.value;
          const col = u instanceof THREE.Color ? u : new THREE.Color("#2a55c8");
          return standIn(col, 1.4);
        }
        /**
         * A material with no `.emissive` field is not a dim emitter in the
         * tracer, it is a guaranteed non-emitter: `MaterialsTexture` guards
         * that field with `'emissive' in m` and writes black when it is
         * absent. `MeshBasicMaterial` has no such field.
         *
         * In this project an untone-mapped `MeshBasicMaterial` is never a flat
         * white surface - it is always an aperture, the bright core inside a
         * fixture. The chandelier is the clearest case, and the one that
         * exposed this: its core is basic, its own rig notes that "the core
         * carries most of the brightness", and the glass shell around it is
         * only 0.42 opaque. Leaving the core dark did not dim the chandelier
         * in the first lobby trace, it removed it from the image.
         */
        const basic = t as unknown as THREE.MeshBasicMaterial;
        if (basic.isMeshBasicMaterial && basic.toneMapped === false) {
          return standIn(basic.color, 3);
        }
        return mat;
      })[0] as THREE.Material;
    });
  };

  /**
   * Built inside the render loop, not inside an effect.
   *
   * `next dev` runs React in StrictMode, which mounts, tears down and remounts
   * every effect. Across that, R3F hands back a renderer whose WebGL context
   * has already been disposed — so `getContextAttributes()` returns null and
   * the path tracer's constructor dies on `premultipliedAlpha`. Guarding the
   * effect with a ref made it worse: the second pass skipped while the tracer
   * from the first stayed bound to the dead context. Guarding on the context
   * instead stopped the crash and then nothing ran at all, because the
   * renderer never came back to life.
   *
   * `useFrame` has no such lifecycle. It runs with whatever renderer is
   * actually live this frame, so the tracer is built on the first frame that
   * has a usable context and nothing has to be torn down. Priority 1 takes
   * the render loop over from R3F, which is what we want: the path tracer
   * draws, not the rasteriser.
   *
   * This only ever failed in dev, which is the only place the tool is used,
   * and I had tested it against a production build.
   */
  useFrame(() => {
    if (!swapped.current) {
      swapped.current = true;
      substitute(scene);
    }
    if (!tracer.current) {
      const ctx = gl.getContext();
      if (!ctx || ctx.isContextLost()) return;
      // The composer normally owns tone mapping; there is no composer here.
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = 1;
      const t = new WebGLPathTracer(gl);
      t.setScene(scene, camera);
      tracer.current = t;
      (window as unknown as Record<string, unknown>).__bake = {
        samples: 0,
        done: false,
      };
    }
    const t = tracer.current;
    const w = (window as unknown as Record<string, { samples: number; done: boolean }>)
      .__bake;
    if (t.samples >= samples) {
      w.done = true;
      return;
    }
    t.renderSample();
    w.samples = t.samples;
    onProgress(t.samples);
  }, 1);

  return null;
}

function Bake() {
  const q = useSearchParams();
  const sceneId = q.get("scene") ?? "showroom-open";
  const samples = Number(q.get("samples") ?? 300);
  const [loaded, setLoaded] = useState(false);
  const [done, setDone] = useState(0);
  /**
   * The simulation has to actually run.
   *
   * Without this the store never ticks: fades never advance and a *staged*
   * scene never leaves stage zero, so the bake renders the room as it looks
   * in the first frame of the transition. The first attempt at this traced
   * Showroom Open for five minutes and produced a nearly black image, because
   * at stage zero its spotlights and product lighting are still switched off.
   */
  useTicker();
  const roomKey = "lobby" as keyof typeof ROOMS;
  const room = ROOMS[roomKey];

  useEffect(() => {
    const sim = useSim.getState();
    sim.loadSpace(room.space);
    sim.applyScene(sceneId);
    // Long enough for the longest staged scene plus its fades to settle.
    const t = setTimeout(() => setLoaded(true), 6000);
    return () => clearTimeout(t);
  }, [sceneId, room.space]);

  return (
    <>
      {/*
        A bake takes minutes and gets quietly cleaner, which is
        indistinguishable from being broken. The counter is the difference
        between "it is working" and "something has hung".
      */}
      <div className="pointer-events-none fixed left-4 top-4 z-10 rounded bg-black/60 px-3 py-2 font-mono text-xs text-white/80">
        {!loaded
          ? "settling the scene…"
          : `${Math.floor(done)} / ${samples} samples${done >= samples ? " — done, right-click to save" : ""}`}
      </div>
    <Canvas
      gl={{ antialias: false, preserveDrawingBuffer: true }}
      dpr={1}
      camera={{
        position: room.camera.position,
        fov: room.camera.fov,
        near: 0.1,
        far: 200,
      }}
      onCreated={({ camera }) => camera.lookAt(...room.camera.target)}
    >
      {/*
        In its own boundary, because it fetches an HDRI.
        A suspending sibling suspends the whole Canvas subtree, so with the
        environment inline the tracer never mounted and `useFrame` never ran
        a single frame — silently, with no error to go on. The image wants
        the environment for its ambient term, but not at the price of the
        room never rendering if a CDN is slow or blocked.
      */}
      <Suspense fallback={null}>
        <Environment preset="night" background={false} />
      </Suspense>
      <LobbyScene />
      {/*
        The live stage reads `CameraSpec.fov` as the vertical field *at 16:9*
        and re-solves it for the real aspect, so the sides never crop. Setting
        it raw on the Canvas above is therefore not the same camera: at
        1264x843 the stage solves to ~56.8 vertical where the raw value is 49,
        and the trace came back a fifth more zoomed in with the chandelier
        cropped off the top. It read as a missing fixture rather than a
        tighter lens, which is the kind of mismatch that makes a bake
        comparison quietly worthless.
      */}
      <LockHorizontalFov fovAt16x9={room.camera.fov} />
      {loaded && <Tracer samples={samples} onProgress={setDone} />}
    </Canvas>
    </>
  );
}

export default function Page() {
  return (
    <main className="fixed inset-0 bg-black">
      <Suspense fallback={null}>
        <Bake />
      </Suspense>
    </main>
  );
}
