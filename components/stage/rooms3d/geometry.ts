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
  const g = new THREE.PlaneGeometry(1, height, segments, 6);
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

    /**
     * Two things make this read as cloth rather than as a shutter.
     *
     * The fold is a softened sine — raising it to a fractional power rounds the
     * crests and deepens the troughs, which is how gathered fabric actually
     * sits. A pure sine gives evenly spaced ridges of identical width, and that
     * is exactly what a vertical blind looks like.
     *
     * And the fold shallows toward the top, where the fabric is held by the
     * track, and swells toward the floor where it is free. A fold of constant
     * depth from head to hem is the other half of the blind impression.
     */
    const t = y / height;
    const swell = 0.45 + 0.55 * Math.pow(t < 1 ? 1 - t : 0, 0.7);
    const raw = Math.sin(u * cycles * Math.PI * 2);
    const soft = Math.sign(raw) * Math.pow(Math.abs(raw), 0.62);
    // A slow second wave, so the folds are not all the same size.
    const drift = Math.sin(u * cycles * Math.PI * 0.6 + 1.1) * 0.35;
    const x = (soft + drift) * depth * swell;
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

/** What a screen is showing. Each scene wants a different one. */
export type ScreenContent = "streaming" | "presentation" | "game" | "desktop";

/**
 * What is on the screen.
 *
 * A gradient placeholder was the single biggest thing making Movie,
 * Presentation and Gaming read as "same room, slightly different light". The
 * screen is the one object in a media room that tells you what the room is
 * *for*, so it gets a real interface: a streaming home page with a hero banner
 * and a row of posters, a slide deck, a game, or a desktop.
 *
 * Drawn rather than loaded so the demo stays offline, and deterministic so the
 * tiles do not reshuffle on a remount.
 */
export function makeScreenTexture(kind: ScreenContent = "streaming"): THREE.CanvasTexture {
  const w = 1280;
  const h = 720;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  let seed = 20250925;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const round = (x: number, y: number, ww: number, hh: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, r);
    ctx.arcTo(x + ww, y + hh, x, y + hh, r);
    ctx.arcTo(x, y + hh, x, y, r);
    ctx.arcTo(x, y, x + ww, y, r);
    ctx.closePath();
  };

  if (kind === "presentation") {
    // Not paper-white. A projected slide in a dim room is a light grey at best
    // — a beamer cannot make white brighter than its own output, and painting
    // it at #f4f2ed then pushing it through an emissive channel clipped the
    // whole rectangle to a featureless block with the text lost inside it.
    ctx.fillStyle = "#cfccc4";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#171f29";
    ctx.font = "600 62px system-ui, sans-serif";
    ctx.fillText("Lighting as", 90, 190);
    ctx.fillText("infrastructure", 90, 262);
    ctx.fillStyle = "#5d6a7a";
    ctx.font = "400 30px system-ui, sans-serif";
    ctx.fillText("Residential programme  ·  Q3 review", 90, 322);
    ctx.fillStyle = "#c8a24a";
    ctx.fillRect(90, 352, 120, 5);
    // A bar chart, because a slide with no data on it reads as a placeholder.
    const bars = [0.42, 0.61, 0.55, 0.78, 0.9];
    bars.forEach((v, i) => {
      const bh = v * 230;
      ctx.fillStyle = i === bars.length - 1 ? "#b08a33" : "#6d7e92";
      round(760 + i * 92, 560 - bh, 62, bh, 6);
      ctx.fill();
    });
    ctx.strokeStyle = "#a8b0ba";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(740, 562);
    ctx.lineTo(1210, 562);
    ctx.stroke();
  } else if (kind === "game") {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#160b2e");
    g.addColorStop(0.5, "#2b1055");
    g.addColorStop(1, "#06111f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // A horizon and a road, which is all a racing frame needs to read as one.
    ctx.fillStyle = "#0b1a2b";
    ctx.fillRect(0, h * 0.58, w, h * 0.42);
    ctx.strokeStyle = "rgba(255,90,190,0.8)";
    ctx.lineWidth = 3;
    for (let i = 0; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo(w / 2, h * 0.58);
      ctx.lineTo((i / 10) * w * 2 - w * 0.5, h);
      ctx.stroke();
    }
    for (let i = 1; i < 7; i++) {
      const y = h * 0.58 + Math.pow(i / 7, 2.2) * h * 0.42;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "700 34px system-ui, sans-serif";
    ctx.fillText("LAP 3 / 8", 70, 90);
    ctx.font = "700 76px system-ui, sans-serif";
    ctx.fillText("241", 70, 178);
    ctx.font = "500 26px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("KM / H", 200, 178);
  } else if (kind === "desktop") {
    ctx.fillStyle = "#121821";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1b2531";
    ctx.fillRect(0, 0, w, 46);
    ["#e06c5a", "#e0b85a", "#6cc06c"].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(34 + i * 26, 23, 8, 0, Math.PI * 2);
      ctx.fill();
    });
    // A code editor, which is what a den desk is actually used for.
    const widths = [0.52, 0.34, 0.68, 0.24, 0.46, 0.6, 0.3, 0.55, 0.4, 0.66, 0.28, 0.5];
    widths.forEach((v, i) => {
      ctx.fillStyle = ["#7fa7d4", "#c9a06a", "#8fbf87", "#a89ac4"][i % 4];
      ctx.globalAlpha = 0.85;
      round(120, 96 + i * 44, v * 760, 16, 5);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#6b7784";
      ctx.fillText(String(i + 1), 74, 110 + i * 44);
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = "#1b2531";
    ctx.fillRect(960, 46, w - 960, h - 46);
    ctx.fillStyle = "#2b3745";
    for (let i = 0; i < 9; i++) round(990, 90 + i * 52, 250, 30, 6), ctx.fill();
  } else {
    // Streaming home page.
    ctx.fillStyle = "#0b0d10";
    ctx.fillRect(0, 0, w, h);

    // Hero banner: a still, a title and two buttons.
    const hero = ctx.createLinearGradient(0, 0, 0, h * 0.62);
    hero.addColorStop(0, "#2f5f86");
    hero.addColorStop(0.55, "#1d3a55");
    hero.addColorStop(1, "#0b0d10");
    ctx.fillStyle = hero;
    ctx.fillRect(0, 0, w, h * 0.62);
    ctx.fillStyle = "rgba(10,14,20,0.55)";
    ctx.beginPath();
    ctx.moveTo(0, h * 0.44);
    for (let x = 0; x <= w; x += 20) {
      ctx.lineTo(x, h * 0.44 - Math.sin(x / 190) * 36 - Math.sin(x / 61) * 12);
    }
    ctx.lineTo(w, h * 0.62);
    ctx.lineTo(0, h * 0.62);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#e5322d";
    ctx.font = "800 30px system-ui, sans-serif";
    ctx.fillText("● ● ●", 62, 66);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 62px system-ui, sans-serif";
    ctx.fillText("A BRIGHTER", 62, 236);
    ctx.fillText("TOMORROW", 62, 302);
    ctx.font = "400 24px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fillText("2026  ·  Documentary  ·  1h 48m", 62, 344);

    ctx.fillStyle = "#ffffff";
    round(62, 372, 148, 46, 6);
    ctx.fill();
    ctx.fillStyle = "#101418";
    ctx.font = "600 22px system-ui, sans-serif";
    ctx.fillText("▶  Play", 92, 402);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    round(224, 372, 168, 46, 6);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText("+  My List", 250, 402);

    // A row of posters. Two rows, the second clipped by the frame edge, which
    // is what a home page actually looks like.
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "600 24px system-ui, sans-serif";
    ctx.fillText("Top 10 today", 62, h * 0.66 + 4);
    const palette = [
      ["#7c2230", "#d2515f"], ["#1d4a5e", "#3f9fb8"], ["#4a3a1e", "#c39b4a"],
      ["#2d2148", "#7a5fb0"], ["#123425", "#3f9468"], ["#4a1f2b", "#b05068"],
      ["#1b2a44", "#5678b0"],
    ];
    for (let i = 0; i < 7; i++) {
      const x = 62 + i * 176;
      const y = h * 0.7;
      const g2 = ctx.createLinearGradient(x, y, x, y + 172);
      g2.addColorStop(0, palette[i][1]);
      g2.addColorStop(1, palette[i][0]);
      ctx.fillStyle = g2;
      round(x, y, 152, 172, 8);
      ctx.fill();
      // A rank numeral, as the streaming services print.
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "800 54px system-ui, sans-serif";
      ctx.fillText(String(i + 1), x + 12, y + 158);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(x + 66, y + 130, 70 * (0.4 + rnd() * 0.6), 6);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * A large abstract relief panel, for the feature wall.
 *
 * The client's sheet hangs one of these on the long blank wall and points its
 * "Accent Lighting — highlight artwork, textures and feature elements" callout
 * straight at it. So the artwork is not decoration here: it is the thing that
 * callout is about, and a bare plaster wall leaves the accent device with
 * nothing to accent.
 *
 * Drawn rather than loaded, so the demo stays offline. Overlapping soft forms
 * in close-valued off-whites, which is what reads as sculptural plaster under a
 * raking light.
 */
export function makeArtTexture(seed = 11): THREE.CanvasTexture {
  const w = 1024;
  const h = 640;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, "#e8e3d9");
  base.addColorStop(1, "#cfc8bb");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // Overlapping petals, each with a light side and a shadowed side, so the
  // panel reads as relief rather than as a printed pattern.
  for (let i = 0; i < 34; i++) {
    const cx = w * (0.12 + rnd() * 0.76);
    const cy = h * (0.14 + rnd() * 0.72);
    const r = 40 + rnd() * 120;
    const rot = rnd() * Math.PI * 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, "rgba(255,253,246,0.85)");
    g.addColorStop(0.55, "rgba(226,219,206,0.7)");
    g.addColorStop(1, "rgba(168,158,142,0.55)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * (0.42 + rnd() * 0.3), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(150,140,124,0.35)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  // A soft vignette, so the panel does not fight the wall at its edges.
  const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.8);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(60,54,46,0.28)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
