"use client";

/**
 * Offline path-trace of a room, for baking backplates. Development only.
 *
 *   /bake?scene=premium&samples=400
 *
 * The live stage rasterises: every light is evaluated per fragment, nothing
 * bounces, and the bounce is faked with a single hemisphere term. That is the
 * right trade for sixty frames a second and the wrong one for a still. Here
 * the same scene — same geometry, same rig, same fixture states, pulled from
 * `useShowroomState` so the two cannot drift — is handed to a path tracer,
 * which computes the bounce for real and has all the time in the world.
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
import { useSim } from "@/lib/sim/store";
import { useTicker } from "@/lib/sim/useTicker";
import { carShowroom } from "@/lib/spaces/hospitality/car-showroom";
import { hotelLobby } from "@/lib/spaces/hospitality/hotel-lobby";
import { useShowroomState, ShowroomScene, SHOWROOM_CAMERA } from "@/components/stage/rooms3d/CarShowroomStage";
import { LobbyScene, LOBBY_CAMERA } from "@/components/stage/rooms3d/HotelLobbyStage";

/**
 * Which room to trace. `?room=lobby` or the showroom by default.
 *
 * Both entries mount the same scene component the live stage does, so the
 * trace is of the shipping room and not of a second model of it.
 */
const ROOMS = {
  showroom: { space: carShowroom, camera: SHOWROOM_CAMERA },
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
  const substitute = (root: THREE.Object3D) => {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const list = Array.isArray(m.material) ? m.material : [m.material];
      m.material = list.map((mat) => {
        const t = mat as THREE.Material & { uniforms?: Record<string, { value: unknown }> };
        if (!(t as THREE.ShaderMaterial).isShaderMaterial) return mat;
        const u = t.uniforms?.uColor?.value;
        const col = u instanceof THREE.Color ? u : new THREE.Color("#2a55c8");
        return new THREE.MeshStandardMaterial({
          color: col,
          emissive: col,
          emissiveIntensity: 1.4,
          roughness: 0.3,
        });
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
  const roomKey = (q.get("room") === "lobby" ? "lobby" : "showroom") as keyof typeof ROOMS;
  const room = ROOMS[roomKey];
  const state = useShowroomState();

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
      {roomKey === "lobby" ? <LobbyScene /> : <ShowroomScene state={state} />}
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
