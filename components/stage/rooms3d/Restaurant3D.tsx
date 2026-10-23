"use client";

/**
 * The hotel restaurant, as geometry.
 *
 * Nothing here knows what the lights are doing. It builds the room and the
 * things in it; `RestaurantLightRig` lights them and `RestaurantStage` drives
 * both from the simulation.
 *
 * Built to the brief's frame: origin on the floor under the camera, -Z toward
 * the back wall, which the camera faces square on. The back wall is split -
 * glazing on the right half with the city behind it, walnut panelling on the
 * left carrying the bar - and that split IS the composition. The previous
 * build ran the glazing down the right-hand SIDE wall with the camera looking
 * along the length of the room, which is a different room photographed a
 * different way, and no amount of grading was going to make it match.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF, MeshReflectorMaterial } from "@react-three/drei";
import {
  makeFabricNormal,
  makeMarbleTexture,
  makeMatteMottle,
  makePlasterNormal,
} from "./geometry";
import { RS, RS_PLAN, SOFFIT_EDGE, TABLES, TOP_Y } from "./RestaurantPlan";

export { RS, RS_PLAN, TABLES, TOP_Y };

/* ------------------------------------------------------------------ */
/* Models                                                              */
/* ------------------------------------------------------------------ */

/**
 * The downloaded models, after decimation.
 *
 * None were usable as they arrived - the dining set was 194,790 triangles for
 * one cover and the bar 56,830 across seventy-four meshes. Through
 * gltf-transform they come out at 15,673 in 10 and 29,596 in 5.
 *
 * The dining set has no legs and, despite its name, no chairs: it is a laid
 * surface, so it is rested on a table built here rather than stood on a floor.
 */
const MODELS = {
  dining: "/models/restaurant/dining-set.glb",
  bar: "/models/restaurant/bar.glb",
  monstera: "/models/restaurant/monstera.glb",
} as const;

/**
 * Load a model, scale it to a size in metres, and rest it on a given level.
 *
 * These arrive in centimetres with node transforms on top, so what a scale of
 * 1 means differs per file. Measuring the bounding box after load lets a call
 * site say "this bar is 2.9 m tall" instead of carrying a magic number that
 * breaks the moment an asset is re-exported.
 */
function FittedModel({
  url,
  position,
  fitMetres,
  axis = "xz",
  rotY = 0,
}: {
  url: string;
  position: [number, number, number];
  fitMetres: number;
  axis?: "xz" | "y";
  rotY?: number;
}) {
  const { scene } = useGLTF(url);
  const fitted = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    const size = new THREE.Vector3();
    new THREE.Box3().setFromObject(c).getSize(size);
    const current = axis === "y" ? size.y : Math.max(size.x, size.z);
    c.scale.setScalar(current > 1e-4 ? fitMetres / current : 1);
    const after = new THREE.Box3().setFromObject(c);
    c.position.y = -after.min.y;
    return c;
  }, [scene, fitMetres, axis]);
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <primitive object={fitted} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

const M = {
  wall: new THREE.MeshStandardMaterial({ color: "#4e463a", roughness: 0.93 }),
  ceiling: new THREE.MeshStandardMaterial({ color: "#6d6353", roughness: 0.92 }),
  soffit: new THREE.MeshStandardMaterial({ color: "#6a6154", roughness: 0.9 }),
  walnut: new THREE.MeshStandardMaterial({ color: "#2b1d13", roughness: 0.62 }),
  walnutLight: new THREE.MeshStandardMaterial({ color: "#4a3320", roughness: 0.58 }),
  travertine: new THREE.MeshStandardMaterial({ color: "#7b7261", roughness: 0.44 }),
  brass: new THREE.MeshStandardMaterial({ color: "#b08d4f", roughness: 0.28, metalness: 0.9 }),
  metal: new THREE.MeshStandardMaterial({ color: "#15130f", roughness: 0.4, metalness: 0.75 }),
  /**
   * Barely there, and deliberately simple.
   *
   * This carried `transmission: 0.95` AND `opacity: 0.18`, which are two
   * different transparency mechanisms arguing: the transmission pass samples
   * what is behind, the alpha blend then mixes that result with the lit
   * surface again, and the lit surface here faces a warm room. Measured, the
   * sky came through at rgb(65,52,47) - warmer than the room's own walls -
   * against the reference's rgb(86,99,131). The backdrop was blue the whole
   * time; the window was painting over it.
   *
   * A window seen from inside at night is mostly just a hole with a faint
   * sheen on it. One mechanism, very low opacity, and the city arrives
   * intact.
   */
  glass: new THREE.MeshStandardMaterial({
    color: "#aebfc9",
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.07,
  }),
  /** Two upholstery tones, as the brief asks for. */
  seatMocha: new THREE.MeshPhysicalMaterial({
    color: "#5a4f41",
    roughness: 0.88,
    sheen: 0.35,
    sheenRoughness: 0.85,
    sheenColor: new THREE.Color("#6b5d49"),
  }),
  seatTaupe: new THREE.MeshPhysicalMaterial({
    color: "#6d6354",
    roughness: 0.88,
    sheen: 0.35,
    sheenRoughness: 0.85,
    sheenColor: new THREE.Color("#7d7059"),
  }),
  tableTop: new THREE.MeshPhysicalMaterial({
    color: "#231c16",
    roughness: 0.22,
    clearcoat: 0.6,
    clearcoatRoughness: 0.18,
  }),
  bottleGreen: new THREE.MeshPhysicalMaterial({
    color: "#233521",
    roughness: 0.12,
    transmission: 0.5,
    thickness: 0.06,
    ior: 1.5,
    transparent: true,
    opacity: 0.88,
  }),
  drape: new THREE.MeshPhysicalMaterial({
    color: "#8a7446",
    roughness: 0.74,
    sheen: 0.8,
    sheenColor: new THREE.Color("#d8bd82"),
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
  }),
};

/* ------------------------------------------------------------------ */
/* Shared geometry                                                     */
/* ------------------------------------------------------------------ */

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const key of ["position", "normal", "uv"] as const) {
    if (!flat[0].getAttribute(key)) continue;
    const size = flat[0].getAttribute(key).itemSize;
    let total = 0;
    for (const g of flat) total += g.getAttribute(key).count * size;
    const arr = new Float32Array(total);
    let at = 0;
    for (const g of flat) {
      arr.set(g.getAttribute(key).array as Float32Array, at);
      at += g.getAttribute(key).count * size;
    }
    out.setAttribute(key, new THREE.BufferAttribute(arr, size));
  }
  out.computeVertexNormals();
  return out;
}

/**
 * A dining chair with a wrap-around back.
 *
 * The brief is specific that nothing is box-shaped, and the chair is where
 * that is won or lost: it is the most repeated object in the room and the one
 * at eye level in the foreground. So the back is a partial cylinder shell
 * wrapping about 200 degrees with a rolled top rim, the seat is a rounded
 * pad, and the legs are tapered and splayed five degrees - which is what
 * stops a slim leg reading as spindly. 0.85 m tall on a 0.46 m seat.
 */
const CHAIR_GEOM = (() => {
  const parts: THREE.BufferGeometry[] = [];

  const seat = new THREE.CylinderGeometry(0.255, 0.235, 0.085, 20);
  seat.translate(0, 0.46, 0);
  parts.push(seat);

  const back = new THREE.CylinderGeometry(
    0.265, 0.25, 0.42, 20, 1, true,
    Math.PI * 0.42, Math.PI * 1.16,
  );
  back.translate(0, 0.70, 0);
  parts.push(back);

  const rim = new THREE.TorusGeometry(0.2575, 0.028, 8, 22, Math.PI * 1.16);
  rim.rotateX(Math.PI / 2);
  rim.rotateY(Math.PI / 2 - Math.PI * 0.42 - Math.PI * 1.16);
  rim.translate(0, 0.91, 0);
  parts.push(rim);

  for (const a of [0.78, 2.36, 3.93, 5.5]) {
    const leg = new THREE.CylinderGeometry(0.019, 0.012, 0.47, 8);
    leg.rotateX(Math.cos(a) * 0.087);
    leg.rotateZ(-Math.sin(a) * 0.087);
    leg.translate(Math.sin(a) * 0.17, 0.235, Math.cos(a) * 0.17);
    parts.push(leg);
  }
  return mergeAll(parts);
})();

const GEOM = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 28),
  chair: CHAIR_GEOM,
  bottle: (() => {
    const body = new THREE.CylinderGeometry(0.038, 0.038, 0.19, 10);
    body.translate(0, 0.095, 0);
    const neck = new THREE.CylinderGeometry(0.012, 0.03, 0.11, 8);
    neck.translate(0, 0.245, 0);
    return mergeAll([body, neck]);
  })(),
  /** A pedestal base: lathe-turned column on a flared foot. */
  pedestal: new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.275, 0),
      new THREE.Vector2(0.275, 0.022),
      new THREE.Vector2(0.14, 0.055),
      new THREE.Vector2(0.085, 0.16),
      new THREE.Vector2(0.075, TOP_Y - 0.06),
      new THREE.Vector2(0.16, TOP_Y - 0.03),
      new THREE.Vector2(0.001, TOP_Y - 0.03),
    ],
    24,
  ),
};

/* ------------------------------------------------------------------ */
/* Texturing                                                           */
/* ------------------------------------------------------------------ */

function Surfaces() {
  useLayoutEffect(() => {
    const stone = makeMarbleTexture("#8c8371", "#5a5244", 8123);
    stone.repeat.set(1, 2.2);
    M.travertine.map = stone;
    M.travertine.color.set("#ffffff");
    M.travertine.needsUpdate = true;

    const plaster = makePlasterNormal(28, 5501);
    const mottleWall = makeMatteMottle(22, 0.13, 6173);
    const mottleSoft = makeMatteMottle(14, 0.07, 2287);
    const put = (
      mat: THREE.MeshStandardMaterial,
      normalScale: number,
      albedo: THREE.Texture,
      repeat: number,
    ) => {
      const n = plaster.clone();
      n.needsUpdate = true;
      n.repeat.set(repeat, repeat);
      mat.normalMap = n;
      mat.normalScale = new THREE.Vector2(normalScale, normalScale);
      const a = albedo.clone();
      a.needsUpdate = true;
      a.repeat.set(repeat, repeat);
      mat.map = a;
      mat.needsUpdate = true;
    };
    put(M.wall, 0.5, mottleWall, 2.6);
    put(M.soffit, 0.4, mottleWall, 2.2);
    put(M.ceiling, 0.22, mottleSoft, 1.8);

    const weave = makeFabricNormal(9, 0.62, 3313);
    for (const m of [M.seatMocha, M.seatTaupe]) {
      const w = weave.clone();
      w.needsUpdate = true;
      w.repeat.set(4, 4);
      m.normalMap = w;
      m.normalScale = new THREE.Vector2(0.8, 0.8);
      m.needsUpdate = true;
    }
  }, []);
  return null;
}

/* ------------------------------------------------------------------ */
/* Skyline                                                             */
/* ------------------------------------------------------------------ */

const SKY_CACHE = new Map<number, HTMLCanvasElement>();

/**
 * Blue hour across the water, drawn to a canvas.
 *
 * A backdrop rather than geometry: there is nothing out there to walk to, and
 * fifty lit towers as real meshes would cost more than the dining room does.
 * The gradient runs deep indigo through violet to a peach band at the
 * horizon, and that warm band is what reads as the hour - a sky without one
 * reads as midnight, and this room is set at a quarter to seven.
 */
function skylineCanvas(step: number): HTMLCanvasElement {
  const hit = SKY_CACHE.get(step);
  if (hit) return hit;
  const w = 2048;
  const h = 1024;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  let s = 20261;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const d = Math.min(Math.max(step, 0), 1);
  const mix = (a: number[], b: number[], t: number) =>
    a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const css = (v: number[]) => "rgb(" + v[0] + "," + v[1] + "," + v[2] + ")";

  /*
   * Dusk is reached at 0.012, not 0.06.
   *
   * Evening is set at 18:45, ten minutes before this site's sunset, and its
   * daylight value quantises to 0.0156. Against a 0.06 threshold that is
   * `dusk = 0.26`, so the sky rendered as three-quarters NIGHT - and the
   * window came back a dark warm-neutral no matter what the dusk colours
   * were set to, because they were barely being mixed in. Two passes of
   * brightening those colours moved the frame by one value, which is the
   * tell: the knob being turned was not in the path.
   *
   * Lux collapses very fast around sunset - this is the same trap the lobby's
   * sky had, where the whole dusk ramp sat inside one quantiser bucket - so
   * the band that means "blue hour" has to be narrow and low. Dinner, Fine
   * Dining and Party all quantise to 0 and stay night, which is correct for
   * 20:15 onward, and Day and Lunch still clamp to full daylight.
   */
  const dusk = Math.min(d / 0.012, 1);
  const day = Math.min(Math.max(0, (d - 0.012) / 0.388), 1);
  const NIGHT_TOP = [8, 11, 26];
  const DUSK_TOP = [30, 44, 112];
  const DAY_TOP = [96, 152, 226];
  const NIGHT_MID = [20, 20, 44];
  const DUSK_MID = [84, 112, 176];
  const DAY_MID = [150, 184, 226];
  const NIGHT_HOR = [38, 28, 40];
  const DUSK_HOR = [214, 150, 128];
  const DAY_HOR = [222, 236, 247];

  const top = dusk < 1 ? mix(NIGHT_TOP, DUSK_TOP, dusk) : mix(DUSK_TOP, DAY_TOP, day);
  const mid = dusk < 1 ? mix(NIGHT_MID, DUSK_MID, dusk) : mix(DUSK_MID, DAY_MID, day);
  const hor = dusk < 1 ? mix(NIGHT_HOR, DUSK_HOR, dusk) : mix(DUSK_HOR, DAY_HOR, day);

  /** The horizon sits at 0.6 of the texture, which lands just under the rail. */
  const HOR = 0.655;
  /*
   * The warm band is a waterline, and the sky above it is authored bright.
   *
   * Measured through the glazing with the glass hidden, the backdrop came
   * back rgb(32,23,29) where its authored sky is around rgb(111,111,153) -
   * roughly a quarter of its value, and warm rather than blue. The second
   * part says the sample was landing in the horizon band rather than in the
   * sky, so the band is pushed down to the last four per cent; the first
   * says whatever the tone map and the texture's colour space do between
   * here and the screen costs about two stops, so the authored colours go up
   * to pay for it.
   *
   * Driven by the measurement rather than by working out which of the two
   * conversions is responsible - the number that matters is what reaches the
   * frame, and that is the one being checked.
   *
   * With the mid stop at 0.62 the peach occupied the top third of the sky's
   * height, and the part of it a 4.7 m window actually frames - about 4.5 m
   * up at 55 m out, texture v 0.53 - landed inside it. The window came back
   * rgb(82,70,64), warmer than the room, against the reference's
   * rgb(86,99,131). The sky was not the wrong colour; the wrong part of it
   * was in the window.
   *
   */
  const sky = g.createLinearGradient(0, 0, 0, h * HOR);
  sky.addColorStop(0, css(top));
  sky.addColorStop(0.96, css(mid));
  sky.addColorStop(1, css(hor));
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h * HOR);

  const water = g.createLinearGradient(0, h * HOR, 0, h);
  water.addColorStop(0, css(mix(hor, [10, 12, 22], 0.45)));
  water.addColorStop(1, css(mix(NIGHT_MID, [6, 7, 14], 0.6)));
  g.fillStyle = water;
  g.fillRect(0, h * HOR, w, h * (1 - HOR));

  const night = 1 - Math.min(d / 0.35, 1);

  const band = (count: number, maxH: number, tint: number[], lit: number) => {
    for (let i = 0; i < count; i++) {
      const bw = 18 + rnd() * 54;
      const bx = rnd() * w;
      const bh = (0.25 + rnd() * 0.75) * maxH;
      g.fillStyle = css(mix(tint, top, 0.25 + rnd() * 0.2));
      g.fillRect(bx, h * HOR - bh, bw, bh);
      if (night > 0.05) {
        for (let y = h * HOR - bh + 8; y < h * HOR - 8; y += 11) {
          for (let x = bx + 4; x < bx + bw - 5; x += 9) {
            if (rnd() > lit) continue;
            g.fillStyle = "rgba(255,208,140," + (0.35 + rnd() * 0.5) * night + ")";
            g.fillRect(x, y, 4, 5);
          }
        }
      }
    }
  };
  /*
   * Short towers, because the window is a letterbox.
   *
   * A 4.7 m window at 55 m frames roughly 15 m of the backdrop's height, and
   * at h*0.2 and h*0.3 the skyline filled nearly all of it - so the glazing
   * came back a field of warm lit windows rather than a city under a blue
   * sky. Measured, blueness -13 against the reference's +45, with the city
   * detail right and the colour wrong because the sky was behind the towers
   * instead of above them.
   *
   * At a tenth and a sixth the skyline sits in the lower third of what the
   * window shows and the rest is sky, which is the proportion the reference
   * has and the reason it reads as blue hour.
   */
  band(34, h * 0.055, [16, 18, 34], 0.5);
  band(26, h * 0.095, [11, 13, 26], 0.44);

  /**
   * The pointed tower the acceptance table puts at screen x 0.745-0.765.
   *
   * Drawn at the u that lands in front of the glazing, not at the u that
   * matches the screen fraction - the texture wraps twice around the
   * backdrop, so those are different numbers and using the second one puts
   * the tower behind the column.
   */
  const tx = w * 0.655;
  const th = h * 0.125;
  g.fillStyle = css(mix([14, 16, 32], top, 0.3));
  g.fillRect(tx, h * HOR - th, 46, th);
  g.beginPath();
  g.moveTo(tx, h * HOR - th);
  g.lineTo(tx + 23, h * HOR - th - 64);
  g.lineTo(tx + 46, h * HOR - th);
  g.closePath();
  g.fill();
  if (night > 0.05) {
    for (let y = h * HOR - th + 10; y < h * HOR - 10; y += 12) {
      for (let x = tx + 5; x < tx + 41; x += 9) {
        if (rnd() > 0.8) continue;
        g.fillStyle = "rgba(255,214,150," + (0.4 + rnd() * 0.5) * night + ")";
        g.fillRect(x, y, 4, 5);
      }
    }
  }

  if (night > 0.05) {
    for (let i = 0; i < 180; i++) {
      const x = rnd() * w;
      g.fillStyle = "rgba(255,198,130," + (0.3 + rnd() * 0.5) * night + ")";
      g.fillRect(x, h * HOR - 3, 3, 3);
      const len = 20 + rnd() * 90;
      const grad = g.createLinearGradient(0, h * HOR, 0, h * HOR + len);
      grad.addColorStop(0, "rgba(255,190,120," + 0.22 * night + ")");
      grad.addColorStop(1, "rgba(255,190,120,0)");
      g.fillStyle = grad;
      g.fillRect(x, h * HOR, 2, len);
    }
  }

  SKY_CACHE.set(step, c);
  return c;
}

function Skyline({ skyStep }: { skyStep: number }) {
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ side: THREE.BackSide, toneMapped: false }),
    [],
  );
  useLayoutEffect(() => {
    const tex = new THREE.CanvasTexture(skylineCanvas(skyStep));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    mat.map = tex;
    mat.needsUpdate = true;
  }, [skyStep, mat]);
  /*
   * Inside the far plane, which is the whole trick.
   *
   * `Stage3D` builds its camera with far = 80, and the first version of this
   * put the backdrop's far side at z = -127. It was clipped away entirely,
   * and what showed through the glass was the glass itself lit by the room -
   * sampled, rgb(42,40,39) against the reference's rgb(87,90,114), with a
   * tenth of its variation. It did not look like a bug, it looked like a
   * tastefully dim window, which is how it survived a look.
   *
   * Centred on the glazing with a 55 m radius, the far wall of the cylinder
   * sits 55 m beyond it and comfortably inside the clip. That is a little
   * nearer than the brief's "about 60 m", and it is the one number here that
   * the renderer rather than the brief decides.
   */
  return (
    <mesh position={[0, 6, RS.zBack]}>
      <cylinderGeometry args={[55, 55, 50, 56, 1, true]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

/**
 * The free-form drop soffit.
 *
 * A kidney sweeping from the top-left of the frame down through the centre
 * and back up to the right - the dominant glowing line in the reference.
 * Built as an extruded `Shape` in plan and laid flat, because a spline is the
 * only way to get an edge that curves in plan rather than in section, and the
 * cove sits on its rim so the line the camera reads IS the curve.
 */
function Soffit() {
  const geom = useMemo(() => {
    // Built from the same sampled curve the cove runs along, so the glowing
    // line and the edge it is tucked behind cannot drift apart.
    const s = new THREE.Shape();
    s.moveTo(RS.xMin, RS.zBack + 0.2);
    for (const p of SOFFIT_EDGE) s.lineTo(p.x, p.y);
    s.lineTo(RS.xMax, RS.zBack + 0.2);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: RS.soffitDrop, bevelEnabled: false });
  }, []);
  return (
    <mesh geometry={geom} rotation={[Math.PI / 2, 0, 0]} position={[0, RS.h, 0]} receiveShadow>
      <primitive object={M.soffit} attach="material" />
    </mesh>
  );
}

function Shell({ reflections }: { reflections: boolean }) {
  const w = RS.xMax - RS.xMin;
  const d = RS.zFront - RS.zBack;
  const cx = (RS.xMin + RS.xMax) / 2;
  const cz = (RS.zFront + RS.zBack) / 2;
  const g = RS_PLAN.glass;
  const p = RS_PLAN.panelling;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]} receiveShadow>
        <planeGeometry args={[w, d]} />
        {reflections ? (
          <MeshReflectorMaterial
            resolution={1024}
            mixBlur={1}
            mixStrength={1.5}
            blur={[300, 100]}
            /*
             * A sheen, not a second ceiling.
             *
             * At 0.42 the cove's reflection came back as bright as the cove,
             * so the frame had two glowing arcs in it and the eye could not
             * tell which was the light. Polished stone does reflect - it is
             * half of why these rooms photograph well - but it returns a
             * dimmed, blurred suggestion, and the real one has to stay the
             * brighter of the two.
             */
            mirror={0.22}
            depthScale={0.9}
            minDepthThreshold={0.35}
            maxDepthThreshold={1.3}
            color="#4a443b"
            roughness={0.17}
            metalness={0.1}
          />
        ) : (
          <meshStandardMaterial color="#3b352e" roughness={0.3} />
        )}
      </mesh>

      <mesh rotation={[Math.PI / 2, 0, 0]} position={[cx, RS.h, cz]}>
        <planeGeometry args={[w, d]} />
        <primitive object={M.ceiling} attach="material" />
      </mesh>

      <mesh rotation={[0, Math.PI / 2, 0]} position={[RS.xMin, RS.h / 2, cz]}>
        <planeGeometry args={[d, RS.h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>
      <mesh rotation={[0, -Math.PI / 2, 0]} position={[RS.xMax, RS.h / 2, cz]}>
        <planeGeometry args={[d, RS.h]} />
        <primitive object={M.wall} attach="material" />
      </mesh>

      <mesh position={[(p.x0 + p.x1) / 2, RS.h / 2, p.z]}>
        <planeGeometry args={[p.x1 - p.x0, RS.h]} />
        <primitive object={M.walnut} attach="material" />
      </mesh>

      <mesh position={[(g.x0 + g.x1) / 2, RS.h / 2, g.z]}>
        <planeGeometry args={[g.x1 - g.x0, RS.h]} />
        <primitive object={M.glass} attach="material" />
      </mesh>
      {g.mullions.map((x, i) => (
        <mesh key={i} position={[x, RS.h / 2, g.z + 0.03]}>
          <boxGeometry args={[0.06, RS.h, 0.06]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
      {[0.08, RS.h - 0.1].map((y, i) => (
        <mesh key={i} position={[(g.x0 + g.x1) / 2, y, g.z + 0.03]}>
          <boxGeometry args={[g.x1 - g.x0, 0.14, 0.08]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
      <mesh position={[(g.x0 + g.x1) / 2, g.railY, g.z + 0.14]}>
        <boxGeometry args={[g.x1 - g.x0, 0.045, 0.045]} />
        <primitive object={M.metal} attach="material" />
      </mesh>

      <Soffit />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Back wall furniture                                                 */
/* ------------------------------------------------------------------ */

function Bar() {
  const b = RS_PLAN.bar;
  const bays = [b.x0 + 1.4, b.x0 + 3.2, b.x0 + 5.0];
  return (
    <group>
      {bays.map((x, i) => (
        <FittedModel key={i} url={MODELS.bar} position={[x, 0, b.z + 0.9]} fitMetres={2.9} axis="y" />
      ))}
      <mesh position={[(b.x0 + b.x1) / 2, b.counterY / 2, b.z + 2.1]} castShadow receiveShadow>
        <boxGeometry args={[b.x1 - b.x0, b.counterY, 0.72]} />
        <primitive object={M.walnut} attach="material" />
      </mesh>
      <mesh position={[(b.x0 + b.x1) / 2, b.counterY + 0.02, b.z + 2.1]}>
        <boxGeometry args={[b.x1 - b.x0 + 0.1, 0.05, 0.82]} />
        <primitive object={M.travertine} attach="material" />
      </mesh>
    </group>
  );
}

function Drape() {
  const d = RS_PLAN.drape;
  return (
    <mesh position={[(d.x0 + d.x1) / 2, RS.h / 2, d.z + 0.12]}>
      <planeGeometry args={[d.x1 - d.x0, RS.h]} />
      <primitive object={M.drape} attach="material" />
    </mesh>
  );
}

function WineCabinet() {
  const v = RS_PLAN.wine;
  const ref = useRef<THREE.InstancedMesh>(null);
  const COLS = 14;
  const ROWS = 8;
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    const one = new THREE.Vector3(1, 1, 1);
    const pos = new THREE.Vector3();
    let i = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        pos.set(
          v.x - v.w / 2 + 0.17 + (c / (COLS - 1)) * (v.w - 0.34),
          0.42 + (r / (ROWS - 1)) * (v.h - 0.8),
          v.z + 0.12,
        );
        m.compose(pos, q, one);
        mesh.setMatrixAt(i++, m);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [v]);
  return (
    <group>
      <mesh position={[v.x, v.h / 2, v.z - 0.2]} castShadow receiveShadow>
        <boxGeometry args={[v.w + 0.16, v.h, 0.16]} />
        <primitive object={M.metal} attach="material" />
      </mesh>
      {[-1, 1].map((s, i) => (
        <mesh key={i} position={[v.x + s * (v.w / 2 + 0.06), v.h / 2, v.z]}>
          <boxGeometry args={[0.1, v.h, v.d + 0.1]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
      {Array.from({ length: ROWS }, (_, r) => (
        <mesh key={r} position={[v.x, 0.36 + (r / (ROWS - 1)) * (v.h - 0.8), v.z]}>
          <boxGeometry args={[v.w, 0.025, v.d]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
      <instancedMesh ref={ref} args={[GEOM.bottle, M.bottleGreen, COLS * ROWS]}>
        <primitive object={GEOM.bottle} attach="geometry" />
      </instancedMesh>
      <mesh position={[v.x, v.h / 2, v.z + v.d / 2 + 0.02]}>
        <planeGeometry args={[v.w, v.h - 0.1]} />
        <primitive object={M.glass} attach="material" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Stone, slats and the left niche                                     */
/* ------------------------------------------------------------------ */

function Stonework() {
  const c = RS_PLAN.column;
  const p = RS_PLAN.pilaster;
  const s = RS_PLAN.slats;
  const fins = useRef<THREE.InstancedMesh>(null);
  const pitch = s.fin + s.gap;
  const count = Math.floor((s.x1 - s.x0) / pitch);
  useLayoutEffect(() => {
    const mesh = fins.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      m.makeScale(s.fin, 0.17, s.z1 - s.z0);
      m.setPosition(s.x0 + i * pitch, RS.h - 0.09, (s.z0 + s.z1) / 2);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [count, pitch, s]);
  return (
    <group>
      <mesh position={[c.x, RS.h / 2, c.z]} castShadow receiveShadow>
        <boxGeometry args={[c.w, RS.h, c.d]} />
        <primitive object={M.travertine} attach="material" />
      </mesh>
      <mesh position={[p.x, RS.h / 2, p.z]} castShadow receiveShadow>
        <boxGeometry args={[p.w, RS.h, p.d]} />
        <primitive object={M.travertine} attach="material" />
      </mesh>
      <instancedMesh ref={fins} args={[GEOM.box, M.walnutLight, count]} castShadow>
        <primitive object={GEOM.box} attach="geometry" />
      </instancedMesh>
    </group>
  );
}

function LeftNiche() {
  const n = RS_PLAN.niche;
  const mid = (n.x0 + n.x1) / 2;
  return (
    <group>
      <mesh position={[mid, RS.h / 2, n.z]} castShadow receiveShadow>
        <boxGeometry args={[n.x1 - n.x0 + 1.1, RS.h, 0.3]} />
        <primitive object={M.walnut} attach="material" />
      </mesh>
      <mesh position={[mid, (n.y0 + n.y1) / 2, n.z + 0.17]}>
        <planeGeometry args={[n.x1 - n.x0, n.y1 - n.y0]} />
        <primitive object={M.travertine} attach="material" />
      </mesh>
      {[-1, 1].map((s, i) => (
        <mesh key={i} position={[mid + s * ((n.x1 - n.x0) / 2 + 0.22), RS.h / 2, n.z + 0.18]}>
          <boxGeometry args={[0.3, RS.h, 0.12]} />
          <primitive object={M.walnut} attach="material" />
        </mesh>
      ))}
      <mesh position={[RS.xMin + 0.75, 0.38, n.z + 1.4]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.06, 0.42]} />
        <primitive object={M.walnut} attach="material" />
      </mesh>
      {[-0.6, 0.6].map((dx, i) => (
        <mesh key={i} position={[RS.xMin + 0.75 + dx, 0.19, n.z + 1.4]}>
          <boxGeometry args={[0.05, 0.38, 0.05]} />
          <primitive object={M.metal} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* The dining floor                                                    */
/* ------------------------------------------------------------------ */

function DiningFloor() {
  const tops = useRef<THREE.InstancedMesh>(null);
  const bases = useRef<THREE.InstancedMesh>(null);
  const chairsA = useRef<THREE.InstancedMesh>(null);
  const chairsB = useRef<THREE.InstancedMesh>(null);

  // Two tones alternating, split by index so each is one instanced draw.
  const seats = useMemo(() => {
    const a: { x: number; z: number; rot: number }[] = [];
    const b: { x: number; z: number; rot: number }[] = [];
    TABLES.forEach((t, ti) => {
      for (let s = 0; s < t.seats; s++) {
        const ang = t.rot + (s / t.seats) * Math.PI * 2;
        const rad = t.r + 0.44;
        const seat = {
          x: t.x + Math.sin(ang) * rad,
          z: t.z + Math.cos(ang) * rad,
          rot: ang + Math.PI,
        };
        ((ti + s) % 2 === 0 ? a : b).push(seat);
      }
    });
    return { a, b };
  }, []);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);

    const topM = tops.current;
    const baseM = bases.current;
    if (topM && baseM) {
      TABLES.forEach((t, i) => {
        scl.set(t.r * 2, 0.04, t.r * 2);
        pos.set(t.x, TOP_Y - 0.02, t.z);
        m.compose(pos, new THREE.Quaternion(), scl);
        topM.setMatrixAt(i, m);
        pos.set(t.x, 0, t.z);
        m.compose(pos, new THREE.Quaternion(), one);
        baseM.setMatrixAt(i, m);
      });
      topM.instanceMatrix.needsUpdate = true;
      baseM.instanceMatrix.needsUpdate = true;
    }

    for (const [ref, list] of [
      [chairsA, seats.a],
      [chairsB, seats.b],
    ] as const) {
      const mesh = ref.current;
      if (!mesh) continue;
      list.forEach((s, i) => {
        e.set(0, s.rot, 0);
        q.setFromEuler(e);
        pos.set(s.x, 0, s.z);
        m.compose(pos, q, one);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, [seats]);

  return (
    <group>
      <instancedMesh ref={tops} args={[GEOM.cyl, M.tableTop, TABLES.length]} castShadow receiveShadow>
        <primitive object={GEOM.cyl} attach="geometry" />
      </instancedMesh>
      <instancedMesh ref={bases} args={[GEOM.pedestal, M.metal, TABLES.length]} castShadow>
        <primitive object={GEOM.pedestal} attach="geometry" />
      </instancedMesh>
      {TABLES.map((t, i) => (
        <FittedModel
          key={i}
          url={MODELS.dining}
          position={[t.x, TOP_Y, t.z]}
          fitMetres={t.r * 1.75}
          rotY={t.rot}
        />
      ))}
      <instancedMesh ref={chairsA} args={[GEOM.chair, M.seatMocha, seats.a.length]} castShadow receiveShadow>
        <primitive object={GEOM.chair} attach="geometry" />
      </instancedMesh>
      <instancedMesh ref={chairsB} args={[GEOM.chair, M.seatTaupe, seats.b.length]} castShadow receiveShadow>
        <primitive object={GEOM.chair} attach="geometry" />
      </instancedMesh>
    </group>
  );
}

function Planting() {
  const at: { p: [number, number, number]; h: number; r: number }[] = [
    { p: [-7.2, 0, -10.2], h: 2.6, r: 0.4 },
    { p: [-9.9, 0, -6.2], h: 1.9, r: 2.1 },
    { p: [9.6, 0, -9.0], h: 2.3, r: -0.8 },
    { p: [2.9, 0, -15.6], h: 1.6, r: 1.3 },
  ];
  return (
    <group>
      {at.map((m, i) => (
        <FittedModel key={i} url={MODELS.monstera} position={m.p} fitMetres={m.h} axis="y" rotY={m.r} />
      ))}
    </group>
  );
}

Object.values(MODELS).forEach((u) => useGLTF.preload(u));

/* ------------------------------------------------------------------ */

export function Restaurant3D({
  skyStep,
  reflections = true,
}: {
  skyStep: number;
  reflections?: boolean;
}) {
  return (
    <group>
      <Surfaces />
      <Skyline skyStep={skyStep} />
      <Shell reflections={reflections} />
      <Bar />
      <Drape />
      <WineCabinet />
      <Stonework />
      <LeftNiche />
      <DiningFloor />
      <Planting />
    </group>
  );
}
