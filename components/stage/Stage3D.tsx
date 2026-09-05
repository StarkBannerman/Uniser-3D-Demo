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

import { Suspense, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, Bloom, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";

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
  const fill = new THREE.Color(
    ambient.color[0] / 255,
    ambient.color[1] / 255,
    ambient.color[2] / 255,
  );
  // Floor bounce is the same light, warmer and much weaker.
  const ground = fill.clone().multiplyScalar(0.45).offsetHSL(0.02, 0.05, -0.12);
  return (
    <Canvas
      shadows="soft"
      // Capped so a retina laptop does not quietly render at 4x and drop to
      // 20fps mid-pitch. 1.6 is past the point of visible return here.
      dpr={[1, 1.6]}
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
        <EffectComposer multisampling={4}>
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
