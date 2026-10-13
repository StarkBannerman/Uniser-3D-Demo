"use client";

/**
 * Car look-dev harness. Development only — not part of the demo.
 *
 * One car, big in the frame, on a neutral ground under clean studio light.
 * Judging a body shape from a 200-pixel car in the corner of a dim showroom
 * is guesswork; this is the same geometry at a size where the silhouette,
 * the wheel arches and the greenhouse can actually be seen.
 *
 *   /carlook?kind=coupe&az=0.9&el=0.18&dist=9
 */

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Stage3D } from "@/components/stage/Stage3D";
import { Car } from "@/components/stage/rooms3d/CarShowroom3D";

function Harness() {
  const q = useSearchParams();
  const n = (k: string, d: number) => Number(q.get(k) ?? d);
  const kind = q.get("kind") ?? "coupe";
  const az = n("az", 0.95);
  const el = n("el", 0.2);
  const dist = n("dist", 9);

  return (
    <Stage3D
      camera={{
        position: [
          Math.sin(az) * Math.cos(el) * dist,
          Math.sin(el) * dist,
          Math.cos(az) * Math.cos(el) * dist,
        ],
        target: [0, 0.75, 0],
        fov: n("fov", 32),
      }}
      ambient={{ level: 0.28, color: [255, 250, 244] }}
      bloomIntensity={0.3}
      bloomThreshold={1.5}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[14, 48]} />
        <meshStandardMaterial color="#6e6b67" roughness={0.45} />
      </mesh>
      <hemisphereLight args={["#cfd8e2", "#4a4642", 0.6]} />
      <directionalLight
        position={[6, 9, 7]}
        intensity={2.6}
        castShadow
        shadow-bias={-0.0008}
        shadow-normalBias={0.03}
      />
      <directionalLight position={[-7, 5, -4]} intensity={1.1} />
      <directionalLight position={[2, 4, -9]} intensity={0.9} />
      <Car kind={kind} colour={q.get("colour") ?? "#aeb4bb"} lampsOn={q.get("lamps") === "1"} />
    </Stage3D>
  );
}

export default function Page() {
  return (
    <main className="fixed inset-0 bg-neutral-900">
      <Suspense fallback={null}>
        <Harness />
      </Suspense>
    </main>
  );
}
