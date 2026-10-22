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
import { Canvas, useThree } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { WebGLPathTracer } from "three-gpu-pathtracer";
import { useSim } from "@/lib/sim/store";
import { useTicker } from "@/lib/sim/useTicker";
import { carShowroom } from "@/lib/spaces/hospitality/car-showroom";
import { useShowroomState, ShowroomScene, SHOWROOM_CAMERA } from "@/components/stage/rooms3d/CarShowroomStage";

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
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // The composer normally owns tone mapping; there is no composer here.
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1;

    const tracer = new WebGLPathTracer(gl);
    tracer.setScene(scene, camera);
    (window as unknown as Record<string, unknown>).__bake = { samples: 0, done: false };

    let raf = 0;
    const tick = () => {
      tracer.renderSample();
      const w = (window as unknown as Record<string, { samples: number; done: boolean }>).__bake;
      w.samples = tracer.samples;
      onProgress(tracer.samples);
      if (tracer.samples >= samples) {
        w.done = true;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [gl, scene, camera, samples, onProgress]);

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
  const state = useShowroomState();

  useEffect(() => {
    const sim = useSim.getState();
    sim.loadSpace(carShowroom);
    sim.applyScene(sceneId);
    // Long enough for the longest staged scene plus its fades to settle.
    const t = setTimeout(() => setLoaded(true), 6000);
    return () => clearTimeout(t);
  }, [sceneId]);

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
        position: SHOWROOM_CAMERA.position,
        fov: SHOWROOM_CAMERA.fov,
        near: 0.1,
        far: 200,
      }}
      onCreated={({ camera }) => camera.lookAt(...SHOWROOM_CAMERA.target)}
    >
      <Environment preset="night" background={false} />
      <ShowroomScene state={state} />
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
