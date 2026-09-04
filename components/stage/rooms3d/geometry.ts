/**
 * Procedural geometry and textures for the 3D rooms.
 *
 * Everything here is generated in code. That is the whole point of choosing 3D
 * over layered renders: no file has to arrive from anyone before the room can be
 * lit, so the demo is never blocked on an art pipeline.
 */

import * as THREE from "three";

/**
 * A hanging curtain panel, as a folded surface in the Y–Z plane.
 *
 * The folds are what make fabric read as fabric — a flat plane with a fabric
 * colour looks like painted board no matter how good the material is, because
 * there is no shading variation across it. A sine displacement gives every fold
 * a lit face and a shadowed face, and that alone does most of the work.
 *
 * `gather` compresses the panel toward its start while deepening the folds,
 * which is how a real curtain opens: it does not shrink, it bunches.
 */
export function makeCurtainGeometry({
  length,
  height,
  folds,
  foldDepth,
  gather = 0,
  segments = 96,
}: {
  /** Span along Z when fully closed. */
  length: number;
  height: number;
  folds: number;
  foldDepth: number;
  /** 0 = fully closed and flat-ish, 1 = fully bunched to the start. */
  gather?: number;
  segments?: number;
}): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, height, segments, 2);
  const pos = g.attributes.position;

  // Bunching: the panel occupies less Z and the folds get deeper and tighter.
  const span = length * (1 - 0.82 * gather);
  const depth = foldDepth * (1 + 2.6 * gather);
  const cycles = folds * (1 + 1.4 * gather);

  for (let i = 0; i < pos.count; i++) {
    // PlaneGeometry spans -0.5..0.5 in X; remap to 0..span along Z.
    const u = pos.getX(i) + 0.5;
    const y = pos.getY(i) + height / 2;
    const z = u * span;
    const x = Math.sin(u * cycles * Math.PI * 2) * depth;
    pos.setXYZ(i, x, y, z);
  }

  g.computeVertexNormals();
  return g;
}

/**
 * The view through the glazing, drawn to a canvas.
 *
 * A night skyline is mostly small bright rectangles on a dark gradient, which is
 * exactly what a canvas is good at and what makes the reference video's window
 * read as a city at all. Deterministic seeding matters: an un-seeded random
 * layout would reshuffle the skyline on every React remount, and a building that
 * moves when you change a light is instantly noticeable.
 */
export function makeCityTexture(night: boolean, seed = 7): THREE.CanvasTexture {
  // 2048 wide, with correspondingly small features. At 1024 against a 14 m
  // plane each lit window covered ~7 cm of façade and read as a coarse block
  // through the narrow curtain gaps, which is exactly where it is most visible.
  const w = 2048;
  const h = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Cheap deterministic PRNG — no dependency, repeatable layout.
  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  if (night) {
    sky.addColorStop(0, "#0a1428");
    sky.addColorStop(0.62, "#16305a");
    sky.addColorStop(1, "#24507f");
  } else {
    sky.addColorStop(0, "#8fb6dd");
    sky.addColorStop(0.7, "#c3d6e8");
    sky.addColorStop(1, "#d9e4ee");
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Buildings, back layer to front, getting darker and taller toward the viewer.
  for (let layer = 0; layer < 3; layer++) {
    const baseY = h * (0.52 + layer * 0.14);
    const shade = night
      ? ["#0d1c33", "#0a1628", "#06101d"][layer]
      : ["#9db4c9", "#8ba4bb", "#7b95ae"][layer];
    let x = -40;
    while (x < w + 40) {
      const bw = 30 + rnd() * 74;
      const bh = (120 + rnd() * 420) * (1 - layer * 0.16);
      ctx.fillStyle = shade;
      ctx.fillRect(x, baseY - bh, bw, bh + h);

      if (night) {
        // Lit windows. Sparse, warm, and slightly irregular.
        const cols = Math.max(1, Math.floor(bw / 9));
        const rows = Math.max(1, Math.floor(bh / 13));
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            if (rnd() > 0.34) continue;
            const warm = rnd();
            ctx.fillStyle =
              warm > 0.75
                ? "rgba(255,236,190,0.95)"
                : warm > 0.4
                  ? "rgba(255,214,150,0.8)"
                  : "rgba(190,214,255,0.65)";
            ctx.fillRect(x + 3 + c * 9, baseY - bh + 5 + r * 13, 3.2, 4.4);
          }
        }
      }
      x += bw + 7 + rnd() * 16;
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
