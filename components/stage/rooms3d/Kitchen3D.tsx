"use client";

/**
 * Kitchen — geometry only.
 *
 * From the client's reference photograph: a run of cabinets on the back wall
 * with the under-cabinet strip, a tall column of fridge and ovens to the left,
 * glazing to a balcony on the right behind a roman blind, an island with two
 * pendants and stools, ceiling fan and a wall-mounted split unit.
 *
 * The camera looks square down the room at the cabinet run, which is how the
 * reference is framed and how kitchens are photographed generally — the run is
 * the product.
 *
 * Coordinates in metres. Cabinet run is z = 0, glazing is x = KT.w.
 */

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

export const KT = {
  w: 7.0,
  d: 5.5,
  h: 2.85,
  /** Worktop height, and the underside of the wall units above it. */
  counter: 0.9,
  upper: 1.45,
} as const;

/** Cabinet run along the back wall. */
export const KT_RUN = { x0: 2.25, x1: 6.35, depth: 0.62 };
/** Tall column of appliances at the left end. */
export const KT_COLUMN = { x0: 0.85, x1: 2.25, depth: 0.68 };
/** Island. */
export const KT_ISLAND = { x: 3.9, z: 2.5, w: 2.5, d: 1.15, h: 0.9 };
/** Glazing to the balcony. */
export const KT_GLASS = { z0: 0.7, z1: 4.6, y0: 0.05, y1: KT.h - 0.42 };
/** Pendant drops over the island. */
export const KT_PENDANTS = [
  { x: KT_ISLAND.x - 0.62, z: KT_ISLAND.z, y: 1.78 },
  { x: KT_ISLAND.x + 0.62, z: KT_ISLAND.z, y: 1.78 },
] as const;

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

const M = {
  ceiling: new THREE.MeshStandardMaterial({ color: "#eeece7", roughness: 0.96 }),
  wall: new THREE.MeshStandardMaterial({ color: "#e2dbcf", roughness: 0.94 }),
  splash: new THREE.MeshStandardMaterial({ color: "#e8e3d9", roughness: 0.55 }),
  // Large-format pale tile with a faint sheen, as in the reference.
  floor: new THREE.MeshStandardMaterial({
    color: "#d6d2cb",
    roughness: 0.42,
    metalness: 0.02,
  }),
  grout: new THREE.MeshStandardMaterial({ color: "#c2beb6", roughness: 0.7 }),
  cabinetPale: new THREE.MeshStandardMaterial({ color: "#dad5c9", roughness: 0.52 }),
  cabinetWood: new THREE.MeshStandardMaterial({ color: "#8a5f3c", roughness: 0.48 }),
  stone: new THREE.MeshStandardMaterial({ color: "#ded9d0", roughness: 0.34 }),
  steel: new THREE.MeshStandardMaterial({
    color: "#b9bcc0",
    roughness: 0.28,
    metalness: 0.82,
  }),
  darkGlass: new THREE.MeshStandardMaterial({
    color: "#16181c",
    roughness: 0.16,
    metalness: 0.4,
  }),
  black: new THREE.MeshStandardMaterial({ color: "#1b1d21", roughness: 0.42 }),
  brass: new THREE.MeshStandardMaterial({
    color: "#b98f4e",
    roughness: 0.32,
    metalness: 0.85,
  }),
  stoolFabric: new THREE.MeshStandardMaterial({ color: "#77767a", roughness: 0.92 }),
  blind: new THREE.MeshStandardMaterial({ color: "#d9cfbe", roughness: 0.9 }),
  doorWood: new THREE.MeshStandardMaterial({ color: "#7a4c28", roughness: 0.46 }),
  foliage: new THREE.MeshStandardMaterial({ color: "#4e6f47", roughness: 0.8 }),
  pot: new THREE.MeshStandardMaterial({ color: "#eae7e0", roughness: 0.7 }),
  fan: new THREE.MeshStandardMaterial({ color: "#f0efec", roughness: 0.5 }),
};

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

function Shell() {
  const { w, d, h } = KT;

  // Tile joints. Large format, so few lines — but without them the floor is a
  // grey plane and the room loses its sense of scale entirely.
  const tiles = useMemo(() => {
    const step = 1.2;
    return {
      x: Array.from({ length: Math.ceil(w / step) }, (_, i) => (i + 1) * step),
      z: Array.from({ length: Math.ceil(d / step) }, (_, i) => (i + 1) * step),
    };
  }, [w, d]);

  return (
    <group>
      <mesh position={[w / 2, 0, d / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <primitive object={M.floor} attach="material" />
      </mesh>
      {tiles.x.map((x) => (
        <mesh key={`tx-${x}`} position={[x, 0.002, d / 2]}>
          <boxGeometry args={[0.01, 0.002, d]} />
          <primitive object={M.grout} attach="material" />
        </mesh>
      ))}
      {tiles.z.map((z) => (
        <mesh key={`tz-${z}`} position={[w / 2, 0.002, z]}>
          <boxGeometry args={[w, 0.002, 0.01]} />
          <primitive object={M.grout} attach="material" />
        </mesh>
      ))}

      <mesh position={[w / 2, h, d / 2]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <primitive object={M.ceiling} attach="material" />
      </mesh>

      <mesh position={[w / 2, h / 2, 0]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      <mesh position={[0, h / 2, d / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      <mesh position={[w, h / 2, d / 2]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>

      {/* Bulkhead over the cabinet run, which is what the reference's ceiling
          step actually is. */}
      <mesh position={[w / 2, h - 0.13, 0.42]} receiveShadow castShadow>
        <boxGeometry args={[w, 0.26, 0.84]} />
        <primitive object={M.ceiling} attach="material" />
      </mesh>

      {/* Timber door on the left wall. */}
      <mesh position={[0.05, 1.05, 4.5]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <boxGeometry args={[0.95, 2.1, 0.06]} />
        <primitive object={M.doorWood} attach="material" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Cabinet run                                                         */
/* ------------------------------------------------------------------ */

function CabinetRun() {
  const { x0, x1, depth } = KT_RUN;
  const width = x1 - x0;
  const cx = (x0 + x1) / 2;

  // Door joints on the base units, so the run reads as cabinetry not a slab.
  const doors = useMemo(
    () => Array.from({ length: 6 }, (_, i) => x0 + (width / 6) * (i + 0.5)),
    [x0, width],
  );

  return (
    <group>
      {/* Base units, set back on a recessed plinth. */}
      <mesh position={[cx, 0.06, depth / 2 - 0.04]}>
        <boxGeometry args={[width, 0.12, depth - 0.08]} />
        <primitive object={M.black} attach="material" />
      </mesh>
      <mesh position={[cx, 0.49, depth / 2]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.74, depth]} />
        <primitive object={M.cabinetWood} attach="material" />
      </mesh>
      {doors.map((x) => (
        <mesh key={`bd-${x}`} position={[x, 0.49, depth + 0.002]}>
          <boxGeometry args={[0.012, 0.72, 0.004]} />
          <primitive object={M.black} attach="material" />
        </mesh>
      ))}

      {/* Worktop */}
      <mesh position={[cx, KT.counter - 0.02, depth / 2 + 0.02]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.06, 0.045, depth + 0.05]} />
        <primitive object={M.stone} attach="material" />
      </mesh>

      {/* Backsplash */}
      <mesh position={[cx, (KT.counter + KT.upper) / 2, 0.012]}>
        <planeGeometry args={[width, KT.upper - KT.counter]} />
        <primitive object={M.splash} attach="material" />
      </mesh>

      {/* Wall units, split around the hood. */}
      {[
        { x: x0 + 0.72, w: 1.44 },
        { x: x1 - 0.98, w: 1.96 },
      ].map((u) => (
        <group key={`wu-${u.x}`}>
          <mesh position={[u.x, (KT.upper + 2.35) / 2, 0.18]} castShadow receiveShadow>
            <boxGeometry args={[u.w, 2.35 - KT.upper, 0.36]} />
            <primitive object={M.cabinetPale} attach="material" />
          </mesh>
        </group>
      ))}
      {/* Centre wall unit above the hood, shallower. */}
      <mesh position={[4.15, 2.06, 0.18]} castShadow receiveShadow>
        <boxGeometry args={[1.1, 0.58, 0.36]} />
        <primitive object={M.cabinetPale} attach="material" />
      </mesh>

      {/* Hob and chimney hood. */}
      <mesh position={[4.15, KT.counter + 0.01, 0.34]}>
        <boxGeometry args={[0.78, 0.02, 0.46]} />
        <primitive object={M.darkGlass} attach="material" />
      </mesh>
      {[-0.19, 0.19].map((dx) =>
        [-0.12, 0.12].map((dz) => (
          <mesh key={`burner-${dx}-${dz}`} position={[4.15 + dx, KT.counter + 0.03, 0.34 + dz]}>
            <cylinderGeometry args={[0.07, 0.07, 0.02, 14]} />
            <primitive object={M.black} attach="material" />
          </mesh>
        )),
      )}
      <mesh position={[4.15, KT.upper + 0.14, 0.2]} castShadow>
        <boxGeometry args={[1.12, 0.14, 0.42]} />
        <primitive object={M.darkGlass} attach="material" />
      </mesh>

      {/* Sink and mixer tap. */}
      <mesh position={[5.65, KT.counter - 0.03, 0.34]}>
        <boxGeometry args={[0.62, 0.03, 0.42]} />
        <primitive object={M.steel} attach="material" />
      </mesh>
      <mesh position={[5.65, KT.counter + 0.14, 0.14]}>
        <cylinderGeometry args={[0.016, 0.016, 0.28, 10]} />
        <primitive object={M.steel} attach="material" />
      </mesh>
      <mesh position={[5.65, KT.counter + 0.28, 0.22]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 0.18, 10]} />
        <primitive object={M.steel} attach="material" />
      </mesh>

      {/* Counter plants and jars. */}
      {[2.9, 5.05].map((x) => (
        <group key={`plant-${x}`} position={[x, KT.counter + 0.06, 0.3]}>
          <mesh>
            <cylinderGeometry args={[0.08, 0.065, 0.12, 14]} />
            <primitive object={M.pot} attach="material" />
          </mesh>
          <mesh position={[0, 0.13, 0]}>
            <sphereGeometry args={[0.12, 12, 9]} />
            <primitive object={M.foliage} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Tall appliance column                                               */
/* ------------------------------------------------------------------ */

function ApplianceColumn() {
  const { x0, x1, depth } = KT_COLUMN;

  return (
    <group>
      {/* Carcass */}
      <mesh position={[(x0 + x1) / 2, 1.18, depth / 2]} castShadow receiveShadow>
        <boxGeometry args={[x1 - x0, 2.36, depth]} />
        <primitive object={M.cabinetPale} attach="material" />
      </mesh>

      {/* Fridge: stainless doors with a water dispenser. */}
      <mesh position={[x0 + 0.42, 0.92, depth + 0.01]} castShadow>
        <boxGeometry args={[0.78, 1.84, 0.06]} />
        <primitive object={M.steel} attach="material" />
      </mesh>
      <mesh position={[x0 + 0.42, 1.5, depth + 0.045]}>
        <boxGeometry args={[0.012, 1.1, 0.01]} />
        <primitive object={M.black} attach="material" />
      </mesh>
      <mesh position={[x0 + 0.26, 1.42, depth + 0.05]}>
        <boxGeometry args={[0.16, 0.26, 0.02]} />
        <primitive object={M.darkGlass} attach="material" />
      </mesh>

      {/* Built-in ovens. */}
      {[1.02, 1.62].map((y) => (
        <mesh key={`oven-${y}`} position={[x1 - 0.32, y, depth + 0.01]} castShadow>
          <boxGeometry args={[0.56, 0.52, 0.05]} />
          <primitive object={M.darkGlass} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Island and stools                                                   */
/* ------------------------------------------------------------------ */

function Island() {
  const { x, z, w, d, h } = KT_ISLAND;

  return (
    <group>
      <mesh position={[x, 0.06, z]}>
        <boxGeometry args={[w - 0.16, 0.12, d - 0.14]} />
        <primitive object={M.black} attach="material" />
      </mesh>
      <mesh position={[x, h / 2 + 0.06, z]} castShadow receiveShadow>
        <boxGeometry args={[w, h - 0.12, d]} />
        <primitive object={M.cabinetWood} attach="material" />
      </mesh>
      {/* Stone top with an overhang on the seating side. */}
      <mesh position={[x, h + 0.02, z + 0.06]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.14, 0.05, d + 0.26]} />
        <primitive object={M.stone} attach="material" />
      </mesh>
      <mesh position={[x - 0.72, h + 0.12, z - 0.1]}>
        <cylinderGeometry args={[0.09, 0.07, 0.14, 14]} />
        <primitive object={M.pot} attach="material" />
      </mesh>
      <mesh position={[x - 0.72, h + 0.26, z - 0.1]}>
        <sphereGeometry args={[0.13, 12, 9]} />
        <primitive object={M.foliage} attach="material" />
      </mesh>

      {/* Two bar stools on the near side. */}
      {[x - 0.5, x + 0.5].map((sx) => (
        <group key={`stool-${sx}`} position={[sx, 0, z + 0.85]}>
          <mesh position={[0, 0.66, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.42, 0.1, 0.4]} />
            <primitive object={M.stoolFabric} attach="material" />
          </mesh>
          <mesh position={[0, 0.92, 0.17]} rotation={[0.12, 0, 0]} castShadow>
            <boxGeometry args={[0.42, 0.42, 0.1]} />
            <primitive object={M.stoolFabric} attach="material" />
          </mesh>
          {[[-0.17, -0.15], [0.17, -0.15], [-0.17, 0.15], [0.17, 0.15]].map(([dx, dz], i) => (
            <mesh key={`leg-${i}`} position={[dx, 0.33, dz]}>
              <boxGeometry args={[0.022, 0.66, 0.022]} />
              <primitive object={M.black} attach="material" />
            </mesh>
          ))}
          <mesh position={[0, 0.24, 0]}>
            <boxGeometry args={[0.36, 0.018, 0.018]} />
            <primitive object={M.black} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Glazing, blind and balcony                                          */
/* ------------------------------------------------------------------ */

function Glazing({ blind, daylight }: { blind: number; daylight: number }) {
  const span = KT_GLASS.z1 - KT_GLASS.z0;
  const height = KT_GLASS.y1 - KT_GLASS.y0;
  const cz = (KT_GLASS.z0 + KT_GLASS.z1) / 2;

  const outside = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#e6f0f7").multiplyScalar(0.2 + daylight * 0.78),
        toneMapped: false,
      }),
    [daylight],
  );

  // A roman blind lowers from the head rather than drawing sideways.
  const drop = (height + 0.1) * Math.max(0, Math.min(1, blind / 100));

  return (
    <group>
      <mesh position={[KT.w + 1.6, KT.h / 2 + 0.2, cz]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[span + 3, height + 2]} />
        <primitive object={outside} attach="material" />
      </mesh>

      {/* Balcony rail and a potted tree beyond the glass. */}
      <mesh position={[KT.w + 0.95, 0.55, cz]}>
        <boxGeometry args={[0.04, 0.04, span]} />
        <primitive object={M.black} attach="material" />
      </mesh>
      <group position={[KT.w + 0.6, 0, cz - 1.1]}>
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.2, 0.16, 0.44, 16]} />
          <primitive object={M.pot} attach="material" />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh
            key={`lf-${i}`}
            position={[Math.sin(i * 1.1) * 0.16, 0.85 + (i % 3) * 0.22, Math.cos(i * 1.1) * 0.16]}
          >
            <sphereGeometry args={[0.24, 10, 7]} />
            <primitive object={M.foliage} attach="material" />
          </mesh>
        ))}
      </group>

      {/* Sliding frame and mullions. */}
      {[KT_GLASS.z0, cz, KT_GLASS.z1].map((z, i) => (
        <mesh key={`mul-${i}`} position={[KT.w - 0.04, (KT_GLASS.y0 + KT_GLASS.y1) / 2, z]}>
          <boxGeometry args={[0.07, height, 0.06]} />
          <primitive object={M.steel} attach="material" />
        </mesh>
      ))}
      <mesh position={[KT.w - 0.04, KT_GLASS.y0, cz]}>
        <boxGeometry args={[0.08, 0.06, span]} />
        <primitive object={M.steel} attach="material" />
      </mesh>

      {/* Blind: pelmet plus the fabric that lowers from it. */}
      <mesh position={[KT.w - 0.16, KT_GLASS.y1 + 0.1, cz]}>
        <boxGeometry args={[0.2, 0.16, span + 0.2]} />
        <primitive object={M.blind} attach="material" />
      </mesh>
      {drop > 0.02 && (
        <mesh position={[KT.w - 0.14, KT_GLASS.y1 + 0.04 - drop / 2, cz]} castShadow>
          <boxGeometry args={[0.03, drop, span]} />
          <primitive object={M.blind} attach="material" />
        </mesh>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Ceiling fan and split unit                                          */
/* ------------------------------------------------------------------ */

function CeilingFan({ speed }: { speed: number }) {
  const blades = useRef<THREE.Group>(null);

  // Spin scales with the device's speed setting. A still fan in a kitchen reads
  // as a photograph; a turning one reads as a live room, which is most of what
  // this demo is trying to prove.
  useFrame((_, dt) => {
    if (blades.current) blades.current.rotation.y += dt * speed * 3.2;
  });

  return (
    <group position={[3.5, KT.h - 0.3, 3.55]}>
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 0.32, 10]} />
        <primitive object={M.fan} attach="material" />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.1, 0.13, 0.1, 16]} />
        <primitive object={M.fan} attach="material" />
      </mesh>
      <group ref={blades}>
        {[0, 1, 2].map((i) => (
          <mesh
            key={`blade-${i}`}
            position={[Math.cos((i * 2 * Math.PI) / 3) * 0.62, -0.02, Math.sin((i * 2 * Math.PI) / 3) * 0.62]}
            rotation={[0, -(i * 2 * Math.PI) / 3, 0.05]}
            castShadow
          >
            <boxGeometry args={[1.16, 0.014, 0.19]} />
            <primitive object={M.fan} attach="material" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function SplitUnit() {
  return (
    <group position={[KT.w - 0.24, KT.h - 0.36, 1.15]}>
      <mesh castShadow>
        <boxGeometry args={[0.34, 0.32, 1.0]} />
        <primitive object={M.fan} attach="material" />
      </mesh>
      <mesh position={[-0.08, -0.15, 0]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[0.2, 0.02, 0.92]} />
        <primitive object={M.cabinetPale} attach="material" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */

export function Kitchen3D({
  blind,
  fanSpeed,
  daylight,
}: {
  blind: number;
  /** 0 when off, else 1..3. Drives the blade rotation. */
  fanSpeed: number;
  daylight: number;
}) {
  return (
    <group>
      <Shell />
      <CabinetRun />
      <ApplianceColumn />
      <Island />
      <Glazing blind={blind} daylight={daylight} />
      <CeilingFan speed={fanSpeed} />
      <SplitUnit />
    </group>
  );
}
