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
/**
 * The view out of the window.
 *
 * Rewritten from a field of flat grey boxes into something that reads as a
 * city: layered towers with aerial perspective, a tree canopy along the
 * bottom, and a sky that actually changes through the day.
 *
 * `daylight` is 0..1 from the simulation, so dusk is a real state rather than
 * a boolean between day and night — which matters here because three of the
 * seven scenes in the executive cabin are set at or after sunset and the
 * window is a third of the frame in all of them.
 *
 * Drawn rather than loaded, so the demo still works offline, and seeded so the
 * skyline does not reshuffle on a remount.
 */
/**
 * Built skylines, kept.
 *
 * This draws a 2048 x 1024 canvas: three bands of towers, their lit windows,
 * and four hundred and sixty tree crowns. Measured, that is roughly 600 ms of
 * main-thread work — and the callers quantise `daylight` to eight steps, so a
 * scene that moves the clock across a step boundary rebuilt the whole thing
 * mid-transition. Pressing Reading froze the worst frame for 635 ms with no
 * shader compilation involved at all; it was this.
 *
 * Eight steps and a couple of seeds is a handful of canvases for the life of
 * the page, so they are simply kept. `makeScreenTexture` already does this for
 * the same reason.
 *
 * What is cached is the *canvas*, not the texture, and that distinction
 * matters: the workspace sets `repeat` on the view it is given, and `repeat`
 * lives on the texture. Handing two rooms the same texture would hand one of
 * them the other's tiling. A fresh `CanvasTexture` over a drawn canvas costs
 * an upload and nothing else.
 */
const CITY_CACHE = new Map<string, HTMLCanvasElement>();

function cityTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function makeCityTexture(daylight: number, seed = 7): THREE.CanvasTexture {
  const cacheKey = `${daylight}|${seed}`;
  const cached = CITY_CACHE.get(cacheKey);
  if (cached) return cityTexture(cached);

  const w = 2048;
  const h = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;

  let s = seed * 7919;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const d = Math.min(Math.max(daylight, 0), 1);
  const mix = (a: number[], b: number[], t: number) =>
    `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;

  /* Sky. Night -> dusk at 0.18, dusk -> day above it: the horizon warms long
     before the zenith does, which is what makes a dusk sky read as dusk. */
  const duskT = Math.min(d / 0.18, 1);
  const dayT = Math.max(0, (d - 0.18) / 0.82);
  const zenith = mix(
    [11, 16, 32],
    duskT < 1 ? [38, 44, 78] : [122, 168, 219],
    duskT < 1 ? duskT : dayT,
  );
  const horizon = mix(
    [28, 26, 44],
    duskT < 1 ? [223, 126, 74] : [198, 216, 234],
    duskT < 1 ? duskT : dayT,
  );
  const sky = g.createLinearGradient(0, 0, 0, h * 0.78);
  sky.addColorStop(0, zenith);
  sky.addColorStop(1, horizon);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  // A low sun, strongest at dusk.
  const sunStrength = duskT < 1 ? duskT : Math.max(0, 1 - dayT * 1.6);
  if (sunStrength > 0.02) {
    const sg = g.createRadialGradient(w * 0.26, h * 0.7, 0, w * 0.26, h * 0.7, h * 0.62);
    sg.addColorStop(0, `rgba(255,196,128,${0.5 * sunStrength})`);
    sg.addColorStop(1, "rgba(255,190,120,0)");
    g.fillStyle = sg;
    g.fillRect(0, 0, w, h);
  }

  /**
   * Three bands of towers, far to near.
   *
   * Aerial perspective is the whole trick: distant buildings are not smaller
   * versions of near ones, they are *paler* — they sit behind more air. Each
   * band is drawn closer to the sky colour than the one in front of it, and
   * that alone turns a row of rectangles into a skyline.
   */
  const skyline = h * 0.72;
  /**
   * The haze numbers were set when this room opened at 17:20, where a low sun
   * damps them through the `1 - night * 0.7` term. Opened at mid-morning
   * instead they run at full strength and the whole city dissolves into the
   * sky, so they come down to suit the hour the room actually opens at.
   */
  const bands = [
    { haze: 0.56, base: [96, 110, 134], top: skyline - h * 0.34, lo: 26, hi: 70 },
    { haze: 0.32, base: [62, 72, 92], top: skyline - h * 0.42, lo: 34, hi: 96 },
    { haze: 0.1, base: [34, 40, 54], top: skyline - h * 0.5, lo: 44, hi: 128 },
  ];

  for (const band of bands) {
    const night = 1 - Math.min(d / 0.3, 1);
    let x = -40;
    while (x < w + 40) {
      const bw = band.lo + rnd() * band.hi;
      const bh = (0.28 + rnd() * 0.72) * (skyline - band.top);
      const y = skyline - bh;
      /**
       * Each tower gets its own tint, and its own top-to-bottom gradient.
       *
       * A band drawn in one flat colour is a paper cut-out however good the
       * haze between bands is — real towers differ from their neighbours in
       * facade and in how much sky they are reflecting, and each one is
       * paler at the top where it has more sky above it. Without that this
       * read as three grey slabs.
       */
      const j = (rnd() - 0.5) * 26;
      const facade = band.base.map((v) => v + j);
      const tint = mix(facade, [198, 216, 234], band.haze * (1 - night * 0.7));
      const tintTop = mix(facade, [198, 216, 234], Math.min(1, (band.haze + 0.12) * (1 - night * 0.7)));
      const col = g.createLinearGradient(0, y, 0, skyline);
      col.addColorStop(0, tintTop);
      col.addColorStop(1, tint);
      g.fillStyle = col;
      g.fillRect(x, y, bw, bh + 10);
      // A few get a setback or a crown, so the roofline is not a flat comb.
      if (rnd() < 0.3) {
        g.fillRect(x + bw * 0.28, y - bh * 0.16, bw * 0.44, bh * 0.18);
      }
      // Lit windows, mostly after dark.
      const lit = night * 0.85 + 0.04;
      if (lit > 0.06 && band.haze < 0.6) {
        const cols = Math.max(1, Math.floor(bw / 13));
        const rows = Math.max(1, Math.floor(bh / 17));
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            if (rnd() > lit * 0.5) continue;
            g.fillStyle = `rgba(255,214,150,${0.35 + rnd() * 0.5})`;
            g.fillRect(x + 5 + c * 13, y + 7 + r * 17, 5, 7);
          }
        }
      }
      x += bw + 3 + rnd() * 14;
    }
  }

  /**
   * Tree canopy along the bottom.
   *
   * The reference looks out over a park, and it is the one element that stops
   * the view reading as a generic stock skyline — a band of green below the
   * towers places the building somewhere.
   */
  const canopy = 1 - Math.min(d / 0.25, 1);
  /**
   * The green was the most synthetic thing in the view and the colour was
   * never the reason — sampled off the render it came back rgb(59,100,46),
   * which is a muted olive. It looked fluorescent because four hundred
   * circles were stamped in a single tint and averaged into one flat slab
   * with a hard horizontal edge, sitting next to a city drawn in greys.
   *
   * What makes a treetop canopy read is that no two crowns are the same
   * colour and the far ones are washed out by the air in front of them. So
   * every blob now jitters in hue and value, and the ones nearer the skyline
   * are mixed toward the horizon colour. The band is laid down back to front
   * so the near crowns overlap the far ones.
   */
  const trees: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 460; i++) {
    trees.push({
      x: rnd() * w,
      y: skyline + 6 + rnd() * (h - skyline - 6),
      r: 22 + rnd() * 54,
    });
  }
  trees.sort((a, b) => a.y - b.y);
  for (const t of trees) {
    // 0 at the skyline, 1 at the bottom of the frame: how near the crown is.
    const near = Math.min(1, (t.y - skyline) / Math.max(1, h - skyline));
    const base = [
      20 + rnd() * 16 + near * 14,
      38 + rnd() * 26 + near * 22,
      22 + rnd() * 14 + near * 10,
    ];
    const lit = mix([12, 20, 14], base, 1 - canopy * 0.85);
    // Aerial perspective: the far edge of the park sits behind more air.
    g.fillStyle = mix(
      lit.slice(4, -1).split(",").map(Number),
      [182, 198, 206],
      (1 - near) * 0.5 * (1 - canopy * 0.8),
    );
    g.globalAlpha = 0.42 + rnd() * 0.42;
    g.beginPath();
    g.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  // Haze along the skyline, which is what sells the distance.
  const hz = g.createLinearGradient(0, skyline - h * 0.2, 0, skyline + 24);
  hz.addColorStop(0, "rgba(0,0,0,0)");
  hz.addColorStop(1, mix([20, 22, 34], [206, 222, 238], Math.min(d * 2, 1)).replace("rgb", "rgba").replace(")", ",0.5)"));
  g.fillStyle = hz;
  g.fillRect(0, skyline - h * 0.2, w, h * 0.2 + 24);

  CITY_CACHE.set(cacheKey, canvas);
  return cityTexture(canvas);
}

/**
 * Venetian blind slats, as a texture rather than geometry.
 *
 * Thirty slats across five bays is a hundred and fifty boxes for something
 * read at four metres through glass. A striped albedo with a matching normal
 * gives the same picture for one draw call, which is the right trade in a room
 * that already carries sixteen lights.
 */
export function makeBlindTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const slat = 16;
  for (let y = 0; y < h; y += slat) {
    const grd = g.createLinearGradient(0, y, 0, y + slat);
    grd.addColorStop(0, "#9a958c");
    grd.addColorStop(0.55, "#cac5ba");
    grd.addColorStop(0.92, "#6e6a63");
    grd.addColorStop(1, "#4a4743");
    g.fillStyle = grd;
    g.fillRect(0, y, w, slat);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

export type ScreenContent =
  | "streaming"
  | "presentation"
  | "game"
  | "desktop"
  | "conference";

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
/**
 * One texture per content type, for the life of the page.
 *
 * Each of these is a 1280x720 canvas with a few hundred draw operations on it,
 * followed by an upload to the GPU — and it was being rebuilt every time a
 * scene changed what was on a screen. That is a stall on the exact frame a
 * person is watching the room change, which is the worst possible frame to
 * spend it on. There are five of them and they never vary, so they are built
 * once and handed out.
 */
const SCREEN_CACHE = new Map<ScreenContent, THREE.CanvasTexture>();

export function makeScreenTexture(kind: ScreenContent = "streaming"): THREE.CanvasTexture {
  const cached = SCREEN_CACHE.get(kind);
  if (cached) return cached;
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

  if (kind === "conference") {
    /**
     * A video call: a speaker tile and a strip of participants.
     *
     * Needed because the boardroom's Video Conference scene is one of six, and
     * on a slide deck it was indistinguishable from Presentation — which made
     * the one scene whose entire argument is *how the room is lit for a camera*
     * look like a lighting change and nothing else.
     */
    ctx.fillStyle = "#14171d";
    ctx.fillRect(0, 0, w, h);

    const tileH = 150;
    const speakerH = h - tileH - 54;
    ctx.fillStyle = "#273246";
    round(28, 26, w - 56, speakerH, 14);
    ctx.fill();

    // A head and shoulders, abstracted. Enough to read as a person at distance.
    const cx = w / 2;
    const base = 26 + speakerH;
    ctx.fillStyle = "#53647f";
    ctx.beginPath();
    ctx.ellipse(cx, base - 118, 128, 104, 0, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, base - 232, 68, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(10,14,20,0.72)";
    round(52, base - 56, 240, 38, 8);
    ctx.fill();
    ctx.fillStyle = "#e7edf6";
    ctx.font = "600 21px system-ui, sans-serif";
    ctx.fillText("Mumbai — Board", 70, base - 30);

    // Live pip, top right.
    ctx.fillStyle = "#e2584b";
    ctx.beginPath();
    ctx.arc(w - 74, 62, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e7edf6";
    ctx.font = "600 18px system-ui, sans-serif";
    ctx.fillText("LIVE", w - 58, 69);

    // Participant strip.
    const cols = 6;
    const gap = 16;
    const tw = (w - 56 - gap * (cols - 1)) / cols;
    for (let i = 0; i < cols; i++) {
      const x = 28 + i * (tw + gap);
      const y = h - tileH - 14;
      ctx.fillStyle = i === 2 ? "#33415c" : "#1d2430";
      round(x, y, tw, tileH, 10);
      ctx.fill();
      ctx.fillStyle = `hsl(${205 + rnd() * 40}, 22%, ${34 + rnd() * 16}%)`;
      ctx.beginPath();
      ctx.arc(x + tw / 2, y + tileH * 0.44, tileH * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + tw / 2, y + tileH * 0.98, tileH * 0.32, tileH * 0.26, 0, Math.PI, 0);
      ctx.fill();
      if (i === 2) {
        ctx.strokeStyle = "#5e9bd8";
        ctx.lineWidth = 3;
        round(x, y, tw, tileH, 10);
        ctx.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    SCREEN_CACHE.set(kind, tex);
    return tex;
  }

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
  SCREEN_CACHE.set(kind, tex);
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
/**
 * Stacked wordmark on a wall, as both commercial rooms have.
 *
 * Canvas rather than geometry: at the distance these are read from, a texture
 * is indistinguishable from cut letters and costs one draw call instead of a
 * few hundred.
 */
export function makeWordsTexture(
  lines: string[],
  bg: string,
  fg: string,
  opts: { size?: number; spacing?: number; transparent?: boolean } = {},
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 512;
  const g = c.getContext("2d")!;
  if (!opts.transparent) {
    g.fillStyle = bg;
    g.fillRect(0, 0, c.width, c.height);
  }
  g.fillStyle = fg;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `600 ${opts.size ?? 34}px system-ui, sans-serif`;
  g.letterSpacing = `${opts.spacing ?? 6}px`;
  const step = c.height / (lines.length + 1);
  lines.forEach((line, i) => g.fillText(line, c.width / 2, step * (i + 1)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Veined stone, for a feature wall or a desk top.
 *
 * Drawn rather than loaded, so the demo stays offline, and deterministic so the
 * veining does not reshuffle on a remount. The veins are a random walk with a
 * decaying branch at each step — which is close enough to how a mineral seam
 * actually propagates that the result reads as stone rather than as marbling.
 */
export function makeMarbleTexture(
  base = "#3a3531",
  vein = "#8d8176",
  seed = 4211,
): THREE.CanvasTexture {
  const w = 768;
  const h = 768;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  g.fillStyle = base;
  g.fillRect(0, 0, w, h);

  // Broad tonal drift, so the slab is not flat before the veins go on.
  for (let i = 0; i < 26; i++) {
    const r = 120 + rnd() * 260;
    const grd = g.createRadialGradient(rnd() * w, rnd() * h, 0, rnd() * w, rnd() * h, r);
    grd.addColorStop(0, `rgba(255,255,255,${0.012 + rnd() * 0.022})`);
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }

  const walk = (x: number, y: number, angle: number, width: number, life: number) => {
    if (life <= 0 || width < 0.35) return;
    g.strokeStyle = vein;
    g.globalAlpha = Math.min(0.5, width / 5);
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(x, y);
    let a = angle;
    for (let i = 0; i < life; i++) {
      a += (rnd() - 0.5) * 0.42;
      x += Math.cos(a) * 9;
      y += Math.sin(a) * 9;
      g.lineTo(x, y);
      if (rnd() < 0.035) walk(x, y, a + (rnd() - 0.5) * 1.5, width * 0.5, life * 0.45);
    }
    g.stroke();
    g.globalAlpha = 1;
  };

  for (let i = 0; i < 7; i++) {
    walk(rnd() * w, rnd() * h, Math.PI * 0.18 + (rnd() - 0.5) * 0.7, 2.6 + rnd() * 2.4, 70 + rnd() * 60);
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * A straight-laid plank floor.
 *
 * The one warm surface in a dark room, and the thing that stops near-black
 * joinery reading as a cave.
 *
 * It was a herringbone, and the loop drawing it swapped the plank's *position*
 * where it meant to swap its *dimensions* — so every other stave landed
 * somewhere unrelated and the floor came out as a chequerboard. Straight planks
 * are what an executive floor usually is anyway, and there is nothing in them
 * to get wrong.
 */
export function makeParquetTexture(seed = 3307): THREE.CanvasTexture {
  const n = 1024;
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const g = c.getContext("2d")!;
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const boardH = 74;
  const rows = Math.ceil(n / boardH);
  const tones = ["#7c5835", "#6c4b2d", "#875f39", "#5d4125", "#745030", "#8a6540"];

  g.fillStyle = "#2a1f17";
  g.fillRect(0, 0, n, n);

  for (let r = 0; r < rows; r++) {
    const y = r * boardH;
    // Stagger the end joints, as a laid floor does.
    let x = -rnd() * 300;
    while (x < n) {
      const len = 220 + rnd() * 320;
      g.fillStyle = tones[Math.floor(rnd() * tones.length)];
      g.fillRect(x + 2, y + 2, len - 4, boardH - 4);
      // Grain along the board.
      for (let k = 0; k < 5; k++) {
        g.strokeStyle = `rgba(0,0,0,${0.04 + rnd() * 0.08})`;
        g.lineWidth = 1 + rnd();
        const gy = y + 6 + rnd() * (boardH - 12);
        g.beginPath();
        g.moveTo(x + 4, gy);
        g.bezierCurveTo(x + len * 0.3, gy + (rnd() - 0.5) * 6, x + len * 0.7, gy + (rnd() - 0.5) * 6, x + len - 4, gy);
        g.stroke();
      }
      x += len;
    }
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/**
 * A distressed abstract rug, as the reference has.
 *
 * Soft blotches over a pale ground with the edges eaten away — a flat colour
 * under furniture is the fastest way to make a room look untextured, and this
 * costs one canvas.
 */
export function makeRugTexture(
  seed = 8821,
  /** Ground colour. */
  base = "#8d8679",
  /**
   * How far the blotches travel from it, 0..1.
   *
   * At full strength this is a dark, heavily mottled wool — right under the
   * near-black joinery of a media room, and completely wrong in a pale living
   * room, where it landed as a puddle of mud across the middle of the frame.
   * The pattern was never the problem; its contrast was.
   */
  contrast = 1,
): THREE.CanvasTexture {
  const n = 512;
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const g = c.getContext("2d")!;
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  g.fillStyle = base;
  g.fillRect(0, 0, n, n);
  for (let i = 0; i < 260; i++) {
    const r = 10 + rnd() * 70;
    const x = rnd() * n;
    const y = rnd() * n;
    const dark = rnd() < 0.55;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(
      0,
      dark
        ? `rgba(30,26,22,${(0.14 + rnd() * 0.36) * contrast})`
        : `rgba(208,199,182,${(0.1 + rnd() * 0.3) * contrast})`,
    );
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // A worn border, so it reads as a rug and not as a painted rectangle.
  g.strokeStyle = `rgba(42,36,30,${0.3 * contrast})`;
  g.lineWidth = 16;
  g.strokeRect(22, 22, n - 44, n - 44);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

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

/**
 * A tangent-space normal map for woven upholstery.
 *
 * Sheen gets fabric most of the way — it is the pale fuzz along a grazing edge
 * — but sheen is a lobe, not a surface, so a sofa with sheen alone still
 * shades like a perfectly smooth object that happens to be fluffy. What is
 * missing is the weave: bouclé and chenille are *bumpy* at a scale of two or
 * three millimetres, and that bumpiness is what breaks up a highlight into the
 * grain you recognise as cloth.
 *
 * Built as a height field first — a plain weave crossed with lumped noise, the
 * lumps being the slubs that make bouclé bouclé — then differentiated into
 * normals. Differentiating a height field is the only way to get a normal map
 * that is internally consistent; painting RGB directly produces lighting that
 * contradicts itself across a seam.
 */
export function makeFabricNormal(
  /** Weave pitch in pixels. Smaller is a tighter, finer cloth. */
  pitch = 7,
  /** How lumpy: 0 is flat linen, 1 is heavy bouclé. */
  slub = 0.55,
  seed = 1777,
): THREE.CanvasTexture {
  const n = 512;
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const g = c.getContext("2d")!;

  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  // Value noise on a coarse lattice, bilinearly interpolated — the slubs.
  const lat = 32;
  const grid = new Float32Array(lat * lat);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const noise = (x: number, y: number) => {
    const fx = (x / n) * lat;
    const fy = (y / n) * lat;
    const x0 = Math.floor(fx) % lat;
    const y0 = Math.floor(fy) % lat;
    const x1 = (x0 + 1) % lat;
    const y1 = (y0 + 1) % lat;
    const tx = fx - Math.floor(fx);
    const ty = fy - Math.floor(fy);
    // Smoothstep, so the lattice does not show as diamonds.
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = grid[y0 * lat + x0] * (1 - sx) + grid[y0 * lat + x1] * sx;
    const b = grid[y1 * lat + x0] * (1 - sx) + grid[y1 * lat + x1] * sx;
    return a * (1 - sy) + b * sy;
  };

  const height = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      // Plain weave: warp over weft, alternating every pitch.
      const u = (x % pitch) / pitch;
      const v = (y % pitch) / pitch;
      const warpOver = (Math.floor(x / pitch) + Math.floor(y / pitch)) % 2 === 0;
      const thread = warpOver ? Math.sin(v * Math.PI) : Math.sin(u * Math.PI);
      height[y * n + x] = thread * (1 - slub) + noise(x, y) * slub * 1.6;
    }
  }

  const img = g.createImageData(n, n);
  // Sobel on the height field. The strength here is a slope scale: too high and
  // the cloth reads as corrugated iron, which is a failure the bedroom already
  // made once with duvet folds.
  const strength = 2.6;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const at = (dx: number, dy: number) =>
        height[(((y + dy) % n) + n) % n * n + ((((x + dx) % n) + n) % n)];
      const dX = at(1, 0) - at(-1, 0);
      const dY = at(0, 1) - at(0, -1);
      let nx = -dX * strength;
      let ny = -dY * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      const i = (y * n + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / len) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  const t = new THREE.CanvasTexture(c);
  // A normal map is data, not colour. Through the sRGB decode it would read as
  // a different vector field entirely — and a subtly wrong one, which is worse.
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * A hotel's mark, drawn to a canvas.
 *
 * Invented, and deliberately so: the demo is shown to prospects who are not
 * this hotel, and a real chain's name on a reception wall is both a trademark
 * problem and a distraction from the lighting. "The Meridian" is generic in
 * the way a plan's placeholder should be — it reads as a five-star lobby
 * without being anybody's.
 *
 * **Resolution is the whole job here.** At 1024 x 512 over a 3.5 m sign this
 * was 290 pixels per metre; the camera sees that sign across ten metres of
 * lobby in a 1500 px frame, so every letter landed on four or five pixels and
 * came back as a smudge. At 2560 x 1280 with anisotropic filtering it is 730
 * per metre and the serif reads. The glyphs are also drawn with a shadow
 * behind them and a highlight above, which is what a solid brass letter
 * standing proud of a dark panel actually does — a flat fill reads as a
 * printed sign, and a printed sign is not what a lobby has.
 */
export function makeLogoTexture(name = "THE MERIDIAN"): THREE.CanvasTexture {
  const w = 2560;
  const h = 1280;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;

  g.fillStyle = "#0e0b08";
  g.fillRect(0, 0, w, h);

  const brass = "#d8b273";
  const brassDeep = "#8a6a34";
  const cx = w / 2;

  // A monogram: two interlocking arcs over a bar, which is about as much
  // device as a wordmark of this kind ever carries.
  const cy = 390;
  const arcs = (stroke: string, dx: number, dy: number, lw: number) => {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.beginPath();
    g.arc(cx - 62 + dx, cy + dy, 124, Math.PI * 0.75, Math.PI * 2.05);
    g.stroke();
    g.beginPath();
    g.arc(cx + 62 + dx, cy + dy, 124, Math.PI * 0.95, Math.PI * 2.25);
    g.stroke();
    g.beginPath();
    g.moveTo(cx - 176 + dx, cy + 166 + dy);
    g.lineTo(cx + 176 + dx, cy + 166 + dy);
    g.stroke();
  };
  arcs(brassDeep, 5, 6, 15);
  arcs(brass, 0, 0, 15);

  g.textAlign = "center";
  g.textBaseline = "middle";
  /**
   * Letter-spaced by hand.
   *
   * Wide tracking is the single strongest signal of a luxury wordmark and
   * canvas has no `letter-spacing`, so each glyph is placed individually. The
   * same pass draws the drop shadow and the top highlight, which is what
   * turns a flat fill into a letter with a thickness.
   */
  const track = (text: string, y: number, size: number, spacing: number) => {
    g.font = `300 ${size}px Georgia, "Times New Roman", serif`;
    const widths = [...text].map((ch) => g.measureText(ch).width + spacing);
    const total = widths.reduce((a, b) => a + b, 0) - spacing;
    let x = cx - total / 2;
    const glyphs: { ch: string; cx: number }[] = [];
    [...text].forEach((ch, i) => {
      glyphs.push({ ch, cx: x + widths[i] / 2 - spacing / 2 });
      x += widths[i];
    });
    g.fillStyle = "#000000";
    g.globalAlpha = 0.55;
    glyphs.forEach((gl) => g.fillText(gl.ch, gl.cx + size * 0.035, y + size * 0.04));
    g.globalAlpha = 1;
    g.fillStyle = brass;
    glyphs.forEach((gl) => g.fillText(gl.ch, gl.cx, y));
    g.fillStyle = "#f3dcb4";
    g.globalAlpha = 0.5;
    glyphs.forEach((gl) => g.fillText(gl.ch, gl.cx - size * 0.012, y - size * 0.016));
    g.globalAlpha = 1;
  };
  /**
   * The wordmark only, and larger.
   *
   * There was a "HOTEL & RESIDENCES" line under it at 64 px, which on a
   * 4.8 m sign is 110 mm of letter — about five pixels tall on screen from
   * where the camera stands. No amount of texture resolution fixes that,
   * because the limit is the frame, not the map: five pixels cannot hold a
   * serif. It is gone, and the name is 40 per cent bigger for the space.
   */
  /**
   * 215 px, not 272.
   *
   * Georgia's uppercase advance is about 0.68 em, so "THE MERIDIAN" at 272
   * with 64 px of tracking measures roughly 2,730 px — on a 2,560 px canvas,
   * which clipped the T and the N straight off the ends. 215 and 42 comes to
   * about 2,170 and leaves a margin either side.
   */
  track(name, 800, 215, 42);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // A sign seen at a grazing angle across a lobby is exactly the case
  // anisotropic filtering exists for.
  t.anisotropy = 16;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  return t;
}

/**
 * A hand-drawn abstract rug: deep navy ground, gold and cream brushwork.
 *
 * `makeRugTexture` is a blotch field — soft radial gradients with no edges —
 * which is right for a worn wool rug under a sofa and wrong for the one object
 * in a hotel lobby that is supposed to be a *pattern*. Blown up to eight
 * metres under a bright window it read as damp.
 *
 * So this draws strokes instead of stains. Every mark has an edge: long
 * sweeping arcs laid down with a round cap, a few straight bands, and a fine
 * warp-and-weft grid over the top at one-pixel width. The grid is what stops
 * the flat areas being flat, and it is the detail that survives being seen
 * from across a room when the blotches do not.
 */
export function makeLobbyRugTexture(seed = 5521): THREE.CanvasTexture {
  const n = 1536;
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const g = c.getContext("2d")!;
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  // Ground, with a slow teal drift through it so it is never one value.
  g.fillStyle = "#1c3c4c";
  g.fillRect(0, 0, n, n);
  for (let i = 0; i < 18; i++) {
    const x = rnd() * n;
    const y = rnd() * n;
    const r = 260 + rnd() * 420;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(26,78,92,${0.1 + rnd() * 0.16})`);
    grd.addColorStop(1, "rgba(26,78,92,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, n, n);
  }

  const palette = ["#c9a362", "#e4dcc8", "#2f7f8c", "#8c7a4a"];

  // Sweeping arcs: the motif. Round caps, because a brush has one.
  g.lineCap = "round";
  for (let i = 0; i < 26; i++) {
    const cx = rnd() * n;
    const cy = rnd() * n;
    const r = 160 + rnd() * 520;
    const a0 = rnd() * Math.PI * 2;
    const a1 = a0 + 0.5 + rnd() * 1.9;
    g.strokeStyle = palette[Math.floor(rnd() * palette.length)];
    g.globalAlpha = 0.16 + rnd() * 0.44;
    g.lineWidth = 3 + rnd() * 22;
    g.beginPath();
    g.arc(cx, cy, r, a0, a1);
    g.stroke();
  }

  // A few straight bands crossing them, which is what keeps an abstract from
  // reading as a scribble.
  for (let i = 0; i < 7; i++) {
    const x0 = rnd() * n;
    const y0 = rnd() * n;
    const a = rnd() * Math.PI;
    const len = 300 + rnd() * 900;
    g.strokeStyle = palette[Math.floor(rnd() * 2)];
    g.globalAlpha = 0.2 + rnd() * 0.3;
    g.lineWidth = 2 + rnd() * 9;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len);
    g.stroke();
  }
  g.globalAlpha = 1;

  // Warp and weft. One pixel, low alpha, both directions: this is the whole
  // of "woven" at any distance you would actually look at a rug from.
  g.globalAlpha = 0.07;
  g.strokeStyle = "#000000";
  g.lineWidth = 1;
  for (let i = 0; i < n; i += 3) {
    g.beginPath();
    g.moveTo(i + 0.5, 0);
    g.lineTo(i + 0.5, n);
    g.stroke();
  }
  g.strokeStyle = "#ffffff";
  g.globalAlpha = 0.05;
  for (let i = 0; i < n; i += 3) {
    g.beginPath();
    g.moveTo(0, i + 0.5);
    g.lineTo(n, i + 0.5);
    g.stroke();
  }
  g.globalAlpha = 1;

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * A surface of revolution swept through part of a turn.
 *
 * Which is what a curved sofa is. Built from nine straight segments it reads
 * as nine boxes on an arc no matter how much the corners are rounded, because
 * the silhouette has nine corners in it — and a silhouette is what the eye
 * uses to decide whether something is one object. Sweeping a cross-section
 * instead gives a single continuous shell with a smooth outline, and costs
 * one draw call rather than thirty-six.
 *
 * `profile` is [radial offset from `radius`, height], ordered along the
 * cross-section. Normals are computed, so the profile only has to be right in
 * two dimensions.
 */
export function sweepProfile(
  profile: readonly (readonly [number, number])[],
  radius: number,
  from: number,
  to: number,
  segments = 84,
): THREE.BufferGeometry {
  const rows = profile.length;
  const cols = segments + 1;
  const pos = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);

  for (let j = 0; j < cols; j++) {
    const t = j / segments;
    const a = from + (to - from) * t;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let i = 0; i < rows; i++) {
      const [dr, y] = profile[i];
      const r = radius + dr;
      const k = (i * cols + j) * 3;
      pos[k] = ca * r;
      pos[k + 1] = y;
      pos[k + 2] = sa * r;
      const m = (i * cols + j) * 2;
      // Four repeats around the arc and one up the section, so a fabric
      // normal map lands at a believable scale without further thought.
      uv[m] = t * 4;
      uv[m + 1] = i / (rows - 1);
    }
  }

  const index: number[] = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/**
 * A thin slab with a softly bevelled edge — a rug, essentially.
 *
 * A box reads as a plinth at any thickness, because what the eye uses to
 * judge "is this lying on the floor" is the edge: a 90 degree corner says
 * "block", a chamfer that meets the floor says "textile". `ExtrudeGeometry`
 * with a bevel gives exactly that, and the whole thing stays 11 mm thick.
 *
 * Built in the XY plane and tipped flat by the caller, so the UVs come out
 * running along the rug rather than around its edge.
 */
export function makeRugSlab(
  width: number,
  depth: number,
  thickness = 0.011,
  bevel = 0.045,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const w = width / 2 - bevel;
  const d = depth / 2 - bevel;
  shape.moveTo(-w, -d);
  shape.lineTo(w, -d);
  shape.lineTo(w, d);
  shape.lineTo(-w, d);
  shape.closePath();

  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, thickness - bevel * 0.2),
    bevelEnabled: true,
    bevelThickness: bevel * 0.2,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 1,
  });
  g.center();

  // ExtrudeGeometry's UVs run in world units; remap to 0..1 over the face so
  // one pattern covers the rug exactly once.
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / width + 0.5;
    uv[i * 2 + 1] = pos.getY(i) / depth + 0.5;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/**
 * A painted contact shadow: dark along a rectangle's edge, fading outward.
 *
 * An 11 mm rug casts a shadow a centimetre wide, which no shadow map in this
 * project has the resolution to find and which screen-space AO at these
 * radii will also miss. Without one the rug looks printed on the floor.
 *
 * The blur is built from concentric strokes rather than `ctx.filter`, which
 * is not reliable across the browsers this demo gets opened in.
 */
export function makeContactShadow(
  /** Rug footprint as a fraction of the texture, 0..0.5 from the centre. */
  inset = 0.12,
  steps = 26,
): THREE.CanvasTexture {
  const n = 512;
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, n, n);

  const x0 = inset * n;
  const y0 = inset * n;
  const w = n - 2 * x0;
  const h = n - 2 * y0;

  // Darkest right at the edge, falling off over the inset.
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    const grow = t * inset * n;
    g.strokeStyle = `rgba(0,0,0,${0.055 * (1 - t) ** 1.6})`;
    g.lineWidth = (inset * n) / steps + 1.5;
    g.strokeRect(x0 - grow, y0 - grow, w + grow * 2, h + grow * 2);
  }
  // A solid core under the rug itself, so the floor beneath is not brighter
  // than the floor beside it.
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.fillRect(x0, y0, w, h);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * A car body, skinned from cross-sections along its length.
 *
 * The first version of this lofted one closed tube from the sill all the way
 * over the roof, and every car came out a bar of soap. Two things were wrong
 * with it, and they are the two things that make a car read as a car:
 *
 * **The greenhouse was inside the paint.** A single tube means the roof is
 * body-coloured all the way across and the glass shell drawn inside it can
 * never be seen. A car's cabin is a *separate, narrower volume* standing on
 * the beltline — the step from flank to glass is the strongest horizontal in
 * the whole silhouette. So the paint now stops at the shoulder and closes
 * across with a crowned deck (which is the bonnet at the front, the beltline
 * through the doors and the boot lid at the back), and the glass is its own
 * loft sitting on top of it with a painted roof cap over that.
 *
 * **The sill was almost constant**, so the body met the floor in a straight
 * line and the wheels were discs parked beside it. A real car's lower edge
 * *arches over each axle*, and that arch is the strongest cue in the
 * silhouette — stronger than the roofline. The arches here span a full wheel
 * diameter with five stations each, so they are curves rather than notches,
 * and the wheels are set to sit just inside them.
 *
 * No marque, no grille, no badge: the parameters make a coupé, a saloon or a
 * tall estate, and nothing in here is anybody's design.
 */
export interface CarStation {
  /** Position along the car, 0 at the nose to 1 at the tail. */
  t: number;
  /** Half-width of the flank at its widest. */
  hw: number;
  /** The rocker line — the bottom of the body. Climbs over each axle. */
  sill: number;
  /** Shoulder line: bonnet top, door top, boot lid. */
  shoulder: number;
  /** Roof height. Equal to `shoulder` anywhere there is no cabin. */
  roof: number;
  /** Half-width at the roof. */
  roofHw: number;
}

/** Which of the three skins to build from a station set. */
export type CarPart = "body" | "glass" | "roof";

/** Fraction of the shoulder-to-roof height that is glass; the rest is roof. */
const GLASS_FRACTION = 0.8;
/** Below this, a station has no cabin and its glass and roof rings collapse. */
const CABIN_MIN = 0.03;
/** Where the deck meets the flank. The glass stands on the same line. */
const BELT = 0.88;

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
/** A half-section collapsed onto the centreline: `n` points, zero area. */
const flat = (n: number, y: number): [number, number][] =>
  Array.from({ length: n }, () => [0, y] as [number, number]);

export function makeCarBody(
  stations: readonly CarStation[],
  length: number,
  part: CarPart = "body",
): THREE.BufferGeometry {
  /** One loop: out along the left, over the top, back down the right. */
  const section = (s: CarStation): [number, number][] => {
    const cabin = s.roof - s.shoulder;
    const gh = Math.max(0, cabin) * GLASS_FRACTION;
    const glassTop = s.shoulder + gh;
    const belt = s.hw * BELT;

    let half: [number, number][];
    if (part === "body") {
      const rise = s.shoulder - s.sill;
      half = [
        [0, s.sill - 0.01],
        [s.hw * 0.62, s.sill - 0.03],
        // The tuck finishes quickly, so the flank above it is nearly vertical.
        // The first version eased it over the whole rise, which gave every car
        // a barrel cross-section — and a barrel has no flat side to catch a
        // highlight, which is most of why they read as soap.
        //
        // Proportional to the rise rather than absolute, because over a wheel
        // arch the rise is only 170 mm: fixed offsets there ran the section's
        // own points past each other and folded the loop inside out.
        [s.hw * 0.88, s.sill + rise * 0.03],
        [s.hw * 0.975, s.sill + rise * 0.14],
        [s.hw, s.sill + rise * 0.42],
        // A character line. Three points close together put a crease in the
        // flank, and the crease is what carries the long highlight down the
        // side of the car in every showroom photograph ever taken.
        [s.hw * 0.998, s.sill + rise * 0.52],
        [s.hw * 0.972, s.sill + rise * 0.6],
        [s.hw * 0.985, s.shoulder - 0.14],
        [s.hw * 0.945, s.shoulder - 0.02],
        [belt, s.shoulder],
        [s.hw * 0.7, s.shoulder + 0.02],
        [s.hw * 0.38, s.shoulder + 0.03],
        [0, s.shoulder + 0.034],
      ];
    } else if (part === "glass") {
      // No cabin here: collapse to a zero-area ring on the centreline, just
      // clear of the deck. Cheaper than slicing the loft, and invisible.
      //
      // It has to be built from a *half* of the usual length, not returned
      // as a ring directly: `cols` comes from the first station, so a
      // collapsed ring with its own point count silently writes past the end
      // of its row and indexes vertices belonging to the next one. That is
      // what left every car but the hero with no cabin at all.
      half = flat(6, s.shoulder + 0.004);
      if (cabin >= CABIN_MIN) half = [
        [belt, s.shoulder],
        [lerp(belt, s.roofHw, 0.45), s.shoulder + gh * 0.34],
        [lerp(belt, s.roofHw, 0.82), s.shoulder + gh * 0.7],
        [s.roofHw, glassTop],
        [s.roofHw * 0.55, glassTop + 0.01],
        [0, glassTop + 0.014],
      ];
    } else {
      const base = glassTop - 0.006;
      half = flat(5, s.shoulder + 0.006);
      if (cabin >= CABIN_MIN) half = [
        [s.roofHw * 1.014, base],
        [s.roofHw * 1.016, base + (s.roof - base) * 0.42],
        [s.roofHw * 0.95, s.roof - 0.012],
        [s.roofHw * 0.55, s.roof],
        [0, s.roof + 0.004],
      ];
    }

    const pts: [number, number][] = [];
    half.forEach(([z, y]) => pts.push([-z, y]));
    for (let i = half.length - 2; i >= 1; i--) pts.push([half[i][0], half[i][1]]);
    return pts;
  };

  const rows = stations.length;
  const loops = stations.map(section);
  const cols = loops[0].length;
  /**
   * The nose and the tail get their own ring of vertices, fanned into a cap.
   *
   * Without them the loft is an open tube, and a car with an open nose is not
   * a subtle fault: the first build of this showed the inside of the far side
   * of the body through the front of every car, tail lamp included. The cap
   * vertices are duplicated rather than shared so `computeVertexNormals`
   * gives them a flat face instead of averaging them into the flank.
   */
  const capped = part === "body";
  const total = rows * cols + (capped ? cols * 2 : 0);

  const pos = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const put = (n: number, x: number, y: number, z: number, u: number, v: number) => {
    pos[n * 3] = x;
    pos[n * 3 + 1] = y;
    pos[n * 3 + 2] = z;
    uv[n * 2] = u;
    uv[n * 2 + 1] = v;
  };

  for (let i = 0; i < rows; i++) {
    const x = (stations[i].t - 0.5) * length;
    for (let j = 0; j < cols; j++) {
      const [z, y] = loops[i][j];
      put(i * cols + j, x, y, z, stations[i].t, j / (cols - 1));
    }
  }

  const index: number[] = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      index.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
    }
  }

  if (capped) {
    [0, rows - 1].forEach((row, end) => {
      const base = rows * cols + end * cols;
      const x = (stations[row].t - 0.5) * length;
      for (let j = 0; j < cols; j++) {
        const [z, y] = loops[row][j];
        put(base + j, x, y, z, stations[row].t, j / (cols - 1));
      }
      for (let j = 1; j < cols - 1; j++) {
        if (end === 0) index.push(base, base + j + 1, base + j);
        else index.push(base, base + j, base + j + 1);
      }
    });
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/**
 * Panel gaps, drawn into a map rather than modelled.
 *
 * The loft already carries a useful parameterisation — `u` runs nose to tail
 * and `v` runs around the section — so a shut line is a vertical bar in a
 * texture, and it follows the curvature of the flank exactly. Modelled gaps
 * would be four extra meshes a car and would clip through a doubly curved
 * panel at every one of them.
 *
 * The map is greyscale and multiplies the paint, so one texture serves every
 * colour: white leaves the paint alone and the bars darken it, which is what
 * a shadowed gap is.
 */
export function makeCarPanelMap(doors: 2 | 4): THREE.CanvasTexture {
  const w = 1024;
  const h = 256;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, w, h);

  /**
   * v = 0 is the centre of the underside and v = 0.5 the centre of the deck,
   * so the two flanks are the bands either side of those. Bars are drawn over
   * the flank for a door shut and across the deck for a bonnet or boot.
   */
  const bar = (u: number, v0: number, v1: number, px = 2.4, a = 0.55) => {
    g.fillStyle = `rgba(28,28,30,${a})`;
    g.fillRect(u * w - px / 2, v0 * h, px, (v1 - v0) * h);
  };
  const flanks = (u: number, lo: number, hi: number, px?: number, a?: number) => {
    bar(u, lo, hi, px, a);
    bar(u, 1 - hi, 1 - lo, px, a);
  };

  /**
   * The rocker, in shadow for its whole length.
   *
   * v runs around the section, so the band just above the underside is the
   * bottom 60 mm of the flank — the part of a real car that lives under the
   * doors and never catches a ceiling fitting. Without it the body meets the
   * floor at the same value it has at the beltline, and a flank lit evenly
   * from sill to shoulder is the other half of why these read as mouldings.
   */
  g.fillStyle = "rgba(0,0,0,0.28)";
  g.fillRect(0, 0.1 * h, w, 0.055 * h);
  g.fillRect(0, 0.845 * h, w, 0.055 * h);

  // Bonnet trailing edge, right across the deck.
  bar(0.288, 0.4, 0.6, 2.6, 0.5);
  // Boot leading edge.
  bar(0.765, 0.4, 0.6, 2.6, 0.5);
  if (doors === 2) {
    flanks(0.345, 0.1, 0.44);
    flanks(0.655, 0.1, 0.44);
  } else {
    flanks(0.335, 0.1, 0.44);
    flanks(0.545, 0.1, 0.44);
    flanks(0.755, 0.1, 0.44);
  }
  // Door handles: a short horizontal nick just under the beltline.
  const handle = (u0: number, u1: number) => {
    g.fillStyle = "rgba(40,40,44,0.5)";
    [0.37, 0.63].forEach((v) => g.fillRect(u0 * w, v * h - 1.6, (u1 - u0) * w, 3.2));
  };
  if (doors === 2) handle(0.6, 0.645);
  else {
    handle(0.495, 0.538);
    handle(0.705, 0.748);
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * Nose-to-tail station sets. Proportion is the whole of what makes these read.
 *
 * The axles sit at t = 0.19 and t = 0.81, the classic fractions, and the
 * `sill` column over each one traces a *circle around the wheel* rather than
 * a notch: nine stations on an arc of radius wheelR + 48 mm. At 70 mm the
 * arch cleared the tyre by a visible crescent of empty wheel well and every
 * car looked lifted; 48 is about what a road car runs. The first pass
 * at this had the arches in the data and they still did not read, because
 * the rocker between them sat 190 mm off the floor — a car whose body hangs
 * down to the axle centres has no arch to see however the sill is shaped.
 * Raising the rocker to 300 mm and taking the arch peak up to wheelR + 355 mm
 * leaves the thin band of metal over the wheel that a car actually has.
 *
 * The nose and tail taper over their last 100 mm — half-width 0.70 at the
 * very end against 0.96 through the doors. That taper is the bumper wrapping
 * round, and without it the end cap is a flat sheet 1.9 m across: every lamp
 * and intake set into it then reads as a sticker on a piece of card, which is
 * exactly how the first face came out. It stops at 0.70 rather than going
 * further because the lamps and the grille still need something flat to sit
 * on — taken to 0.58 the wrap simply swallowed them.
 *
 * The `sill` runs almost level through both ends. Dropping 120 mm in the
 * 90 mm behind the bumper left the end cap's lower edge standing proud of
 * the bodywork, and because that cap is a flat vertical polygon facing the
 * lens it caught the key light and read as a pale tab bolted under the nose.
 *
 * The roof half-width is around three quarters of the flank, which is the
 * tumblehome; without that step the cabin is just the top of the body and the
 * car has no waist.
 */
export const CAR_SHAPES: Record<
  string,
  {
    length: number;
    doors: 2 | 4;
    wheelR: number;
    /** Where the cabin's structure stands, and how wide each column is. */
    pillars: { t: number; w: number }[];
    stations: CarStation[];
  }
> = {
  coupe: {
    length: 4.5,
    doors: 2,
    wheelR: 0.355,
    pillars: [
      { t: 0.45, w: 0.012 },
      { t: 0.72, w: 0.017 },
    ],
    stations: [
      { t: 0, hw: 0.7, sill: 0.3, shoulder: 0.74, roof: 0.74, roofHw: 0.5 },
      { t: 0.008, hw: 0.822, sill: 0.295, shoulder: 0.81, roof: 0.81, roofHw: 0.501 },
      { t: 0.02, hw: 0.888, sill: 0.289, shoulder: 0.824, roof: 0.824, roofHw: 0.501 },
      { t: 0.04, hw: 0.925, sill: 0.285, shoulder: 0.848, roof: 0.848, roofHw: 0.503 },
      { t: 0.06, hw: 0.95, sill: 0.303, shoulder: 0.866, roof: 0.866, roofHw: 0.504 },
      { t: 0.092, hw: 0.955, sill: 0.285, shoulder: 0.885, roof: 0.885, roofHw: 0.506 },
      { t: 0.12, hw: 0.961, sill: 0.586, shoulder: 0.902, roof: 0.902, roofHw: 0.508 },
      { t: 0.134, hw: 0.964, sill: 0.658, shoulder: 0.911, roof: 0.911, roofHw: 0.509 },
      { t: 0.151, hw: 0.967, sill: 0.713, shoulder: 0.921, roof: 0.921, roofHw: 0.51 },
      { t: 0.19, hw: 0.975, sill: 0.758, shoulder: 0.945, roof: 0.945, roofHw: 0.513 },
      { t: 0.229, hw: 0.967, sill: 0.713, shoulder: 0.954, roof: 0.954, roofHw: 0.515 },
      { t: 0.246, hw: 0.964, sill: 0.658, shoulder: 0.958, roof: 0.958, roofHw: 0.516 },
      { t: 0.26, hw: 0.961, sill: 0.586, shoulder: 0.961, roof: 0.961, roofHw: 0.517 },
      { t: 0.288, hw: 0.955, sill: 0.28, shoulder: 0.968, roof: 0.968, roofHw: 0.519 },
      { t: 0.34, hw: 0.96, sill: 0.28, shoulder: 0.98, roof: 1.09, roofHw: 0.58 },
      { t: 0.42, hw: 0.967, sill: 0.28, shoulder: 0.983, roof: 1.254, roofHw: 0.673 },
      { t: 0.52, hw: 0.975, sill: 0.28, shoulder: 0.986, roof: 1.336, roofHw: 0.739 },
      { t: 0.62, hw: 0.97, sill: 0.28, shoulder: 0.99, roof: 1.304, roofHw: 0.731 },
      { t: 0.67, hw: 0.967, sill: 0.28, shoulder: 0.998, roof: 1.266, roofHw: 0.709 },
      { t: 0.712, hw: 0.955, sill: 0.28, shoulder: 1.005, roof: 1.209, roofHw: 0.68 },
      { t: 0.74, hw: 0.961, sill: 0.586, shoulder: 1.009, roof: 1.17, roofHw: 0.66 },
      { t: 0.754, hw: 0.964, sill: 0.658, shoulder: 1.011, roof: 1.148, roofHw: 0.646 },
      { t: 0.771, hw: 0.967, sill: 0.713, shoulder: 1.014, roof: 1.12, roofHw: 0.629 },
      { t: 0.81, hw: 0.975, sill: 0.758, shoulder: 1.02, roof: 1.056, roofHw: 0.59 },
      { t: 0.849, hw: 0.967, sill: 0.713, shoulder: 1.012, roof: 1.012, roofHw: 0.555 },
      { t: 0.866, hw: 0.964, sill: 0.658, shoulder: 1.008, roof: 1.008, roofHw: 0.547 },
      { t: 0.88, hw: 0.961, sill: 0.586, shoulder: 1.005, roof: 1.005, roofHw: 0.54 },
      { t: 0.908, hw: 0.955, sill: 0.285, shoulder: 0.999, roof: 0.999, roofHw: 0.526 },
      { t: 0.94, hw: 0.918, sill: 0.296, shoulder: 0.993, roof: 0.993, roofHw: 0.51 },
      { t: 0.96, hw: 0.9, sill: 0.29, shoulder: 0.988, roof: 0.988, roofHw: 0.5 },
      { t: 0.98, hw: 0.835, sill: 0.3, shoulder: 0.984, roof: 0.984, roofHw: 0.49 },
      { t: 1, hw: 0.72, sill: 0.315, shoulder: 0.98, roof: 0.98, roofHw: 0.48 },
    ],
  },
  saloon: {
    length: 4.9,
    doors: 4,
    wheelR: 0.36,
    pillars: [
      { t: 0.44, w: 0.012 },
      { t: 0.605, w: 0.014 },
      { t: 0.775, w: 0.018 },
    ],
    stations: [
      { t: 0, hw: 0.72, sill: 0.31, shoulder: 0.78, roof: 0.78, roofHw: 0.52 },
      { t: 0.008, hw: 0.842, sill: 0.305, shoulder: 0.85, roof: 0.85, roofHw: 0.521 },
      { t: 0.02, hw: 0.908, sill: 0.299, shoulder: 0.864, roof: 0.864, roofHw: 0.521 },
      { t: 0.04, hw: 0.94, sill: 0.295, shoulder: 0.888, roof: 0.888, roofHw: 0.523 },
      { t: 0.06, hw: 0.962, sill: 0.315, shoulder: 0.906, roof: 0.906, roofHw: 0.524 },
      { t: 0.096, hw: 0.965, sill: 0.295, shoulder: 0.928, roof: 0.928, roofHw: 0.527 },
      { t: 0.123, hw: 0.971, sill: 0.594, shoulder: 0.944, roof: 0.944, roofHw: 0.528 },
      { t: 0.136, hw: 0.973, sill: 0.667, shoulder: 0.952, roof: 0.952, roofHw: 0.529 },
      { t: 0.152, hw: 0.977, sill: 0.722, shoulder: 0.962, roof: 0.962, roofHw: 0.53 },
      { t: 0.19, hw: 0.985, sill: 0.768, shoulder: 0.985, roof: 0.985, roofHw: 0.533 },
      { t: 0.228, hw: 0.977, sill: 0.722, shoulder: 0.993, roof: 0.993, roofHw: 0.536 },
      { t: 0.244, hw: 0.973, sill: 0.667, shoulder: 0.996, roof: 0.996, roofHw: 0.537 },
      { t: 0.257, hw: 0.971, sill: 0.594, shoulder: 0.998, roof: 0.998, roofHw: 0.538 },
      { t: 0.284, hw: 0.965, sill: 0.29, shoulder: 1.004, roof: 1.004, roofHw: 0.54 },
      { t: 0.34, hw: 0.97, sill: 0.29, shoulder: 1.015, roof: 1.187, roofHw: 0.628 },
      { t: 0.42, hw: 0.977, sill: 0.29, shoulder: 1.016, roof: 1.374, roofHw: 0.715 },
      { t: 0.52, hw: 0.985, sill: 0.29, shoulder: 1.018, roof: 1.448, roofHw: 0.769 },
      { t: 0.62, hw: 0.981, sill: 0.29, shoulder: 1.02, roof: 1.46, roofHw: 0.763 },
      { t: 0.67, hw: 0.979, sill: 0.29, shoulder: 1.028, roof: 1.44, roofHw: 0.761 },
      { t: 0.716, hw: 0.965, sill: 0.29, shoulder: 1.035, roof: 1.422, roofHw: 0.739 },
      { t: 0.743, hw: 0.971, sill: 0.594, shoulder: 1.039, roof: 1.375, roofHw: 0.722 },
      { t: 0.756, hw: 0.973, sill: 0.667, shoulder: 1.041, roof: 1.349, roofHw: 0.715 },
      { t: 0.772, hw: 0.977, sill: 0.722, shoulder: 1.044, roof: 1.316, roofHw: 0.705 },
      { t: 0.81, hw: 0.985, sill: 0.768, shoulder: 1.05, roof: 1.207, roofHw: 0.655 },
      { t: 0.848, hw: 0.977, sill: 0.722, shoulder: 1.044, roof: 1.076, roofHw: 0.598 },
      { t: 0.864, hw: 0.973, sill: 0.667, shoulder: 1.041, roof: 1.054, roofHw: 0.578 },
      { t: 0.877, hw: 0.971, sill: 0.594, shoulder: 1.039, roof: 1.04, roofHw: 0.57 },
      { t: 0.904, hw: 0.965, sill: 0.294, shoulder: 1.035, roof: 1.035, roofHw: 0.555 },
      { t: 0.94, hw: 0.93, sill: 0.307, shoulder: 1.029, roof: 1.03, roofHw: 0.534 },
      { t: 0.96, hw: 0.91, sill: 0.3, shoulder: 1.026, roof: 1.026, roofHw: 0.523 },
      { t: 0.98, hw: 0.845, sill: 0.31, shoulder: 1.023, roof: 1.023, roofHw: 0.511 },
      { t: 1, hw: 0.74, sill: 0.325, shoulder: 1.02, roof: 1.02, roofHw: 0.5 },
    ],
  },
  suv: {
    length: 4.8,
    doors: 4,
    wheelR: 0.415,
    pillars: [
      { t: 0.375, w: 0.013 },
      { t: 0.56, w: 0.015 },
      { t: 0.735, w: 0.015 },
      { t: 0.905, w: 0.018 },
    ],
    stations: [
      { t: 0, hw: 0.82, sill: 0.45, shoulder: 1.1, roof: 1.1, roofHw: 0.62 },
      { t: 0.008, hw: 0.94, sill: 0.443, shoulder: 1.171, roof: 1.171, roofHw: 0.624 },
      { t: 0.02, hw: 1.005, sill: 0.433, shoulder: 1.188, roof: 1.188, roofHw: 0.631 },
      { t: 0.04, hw: 1.04, sill: 0.425, shoulder: 1.216, roof: 1.216, roofHw: 0.642 },
      { t: 0.06, hw: 1.062, sill: 0.443, shoulder: 1.233, roof: 1.233, roofHw: 0.652 },
      { t: 0.083, hw: 1.07, sill: 0.425, shoulder: 1.24, roof: 1.24, roofHw: 0.665 },
      { t: 0.113, hw: 1.075, sill: 0.68, shoulder: 1.248, roof: 1.248, roofHw: 0.681 },
      { t: 0.128, hw: 1.078, sill: 0.763, shoulder: 1.252, roof: 1.252, roofHw: 0.689 },
      { t: 0.147, hw: 1.082, sill: 0.826, shoulder: 1.258, roof: 1.258, roofHw: 0.699 },
      { t: 0.19, hw: 1.09, sill: 0.878, shoulder: 1.27, roof: 1.27, roofHw: 0.722 },
      { t: 0.233, hw: 1.082, sill: 0.826, shoulder: 1.273, roof: 1.273, roofHw: 0.746 },
      { t: 0.252, hw: 1.078, sill: 0.763, shoulder: 1.274, roof: 1.281, roofHw: 0.756 },
      { t: 0.267, hw: 1.075, sill: 0.68, shoulder: 1.275, roof: 1.365, roofHw: 0.769 },
      { t: 0.297, hw: 1.07, sill: 0.42, shoulder: 1.277, roof: 1.54, roofHw: 0.806 },
      { t: 0.34, hw: 1.07, sill: 0.42, shoulder: 1.28, roof: 1.731, roofHw: 0.86 },
      { t: 0.42, hw: 1.074, sill: 0.42, shoulder: 1.283, roof: 1.891, roofHw: 0.907 },
      { t: 0.52, hw: 1.08, sill: 0.42, shoulder: 1.288, roof: 1.92, roofHw: 0.93 },
      { t: 0.62, hw: 1.077, sill: 0.42, shoulder: 1.292, roof: 1.92, roofHw: 0.93 },
      { t: 0.67, hw: 1.076, sill: 0.42, shoulder: 1.294, roof: 1.92, roofHw: 0.93 },
      { t: 0.703, hw: 1.07, sill: 0.42, shoulder: 1.295, roof: 1.92, roofHw: 0.93 },
      { t: 0.733, hw: 1.075, sill: 0.68, shoulder: 1.297, roof: 1.92, roofHw: 0.93 },
      { t: 0.748, hw: 1.078, sill: 0.763, shoulder: 1.297, roof: 1.92, roofHw: 0.93 },
      { t: 0.767, hw: 1.082, sill: 0.826, shoulder: 1.298, roof: 1.92, roofHw: 0.93 },
      { t: 0.81, hw: 1.09, sill: 0.878, shoulder: 1.3, roof: 1.916, roofHw: 0.925 },
      { t: 0.853, hw: 1.082, sill: 0.826, shoulder: 1.293, roof: 1.899, roofHw: 0.903 },
      { t: 0.872, hw: 1.078, sill: 0.763, shoulder: 1.29, roof: 1.891, roofHw: 0.894 },
      { t: 0.887, hw: 1.075, sill: 0.68, shoulder: 1.288, roof: 1.885, roofHw: 0.886 },
      { t: 0.917, hw: 1.07, sill: 0.425, shoulder: 1.283, roof: 1.82, roofHw: 0.83 },
      { t: 0.94, hw: 1.023, sill: 0.436, shoulder: 1.279, roof: 1.738, roofHw: 0.76 },
      { t: 0.96, hw: 1, sill: 0.428, shoulder: 1.276, roof: 1.535, roofHw: 0.7 },
      { t: 0.98, hw: 0.925, sill: 0.44, shoulder: 1.273, roof: 1.334, roofHw: 0.63 },
      { t: 1, hw: 0.84, sill: 0.46, shoulder: 1.27, roof: 1.27, roofHw: 0.56 },
    ],
  },
};

/**
 * A backlit brand graphic: a mountain road under a wide sky, with a tagline.
 *
 * Drawn rather than loaded, so the demo still works offline, and deterministic
 * so the ridgeline does not reshuffle on a remount. The text is placed glyph
 * by glyph because canvas has no letter-spacing, and wide tracking is most of
 * what makes a tagline read as a brand line rather than as a caption.
 */
export function makeBrandGraphic(
  lines: string,
  seed = 31,
  width = 2560,
  height = 1440,
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const g = c.getContext("2d")!;
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const sky = g.createLinearGradient(0, 0, 0, height * 0.72);
  sky.addColorStop(0, "#1b2a3c");
  sky.addColorStop(0.55, "#4a5a6b");
  sky.addColorStop(1, "#c08a5a");
  g.fillStyle = sky;
  g.fillRect(0, 0, width, height);

  const ridge = (baseY: number, amp: number, fill: string) => {
    g.beginPath();
    g.moveTo(0, height);
    g.lineTo(0, baseY);
    let y = baseY;
    for (let x = 0; x <= width; x += 24) {
      y += (rnd() - 0.5) * amp;
      y = Math.max(baseY - amp * 3, Math.min(baseY + amp * 3, y));
      g.lineTo(x, y);
    }
    g.lineTo(width, height);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  ridge(height * 0.52, 22, "#3d4a5a");
  ridge(height * 0.62, 30, "#2a3340");
  ridge(height * 0.72, 18, "#1a2029");

  g.beginPath();
  g.moveTo(width * 0.5 - 16, height * 0.73);
  g.lineTo(width * 0.5 + 16, height * 0.73);
  g.lineTo(width * 0.86, height);
  g.lineTo(width * 0.2, height);
  g.closePath();
  g.fillStyle = "#15181c";
  g.fill();
  g.strokeStyle = "rgba(230,230,220,0.5)";
  g.lineWidth = 6;
  g.setLineDash([30, 38]);
  g.beginPath();
  g.moveTo(width * 0.5, height * 0.74);
  g.lineTo(width * 0.53, height);
  g.stroke();
  g.setLineDash([]);

  const sun = g.createRadialGradient(
    width * 0.63, height * 0.5, 0,
    width * 0.63, height * 0.5, height * 0.42,
  );
  sun.addColorStop(0, "rgba(255,206,150,0.5)");
  sun.addColorStop(1, "rgba(255,196,130,0)");
  g.fillStyle = sun;
  g.fillRect(0, 0, width, height);

  /**
   * A thin modern sans with wide tracking, not a serif.
   *
   * The brief asks for it by name, and it is the right call: a serif on a
   * backlit panel at this size picks up a halo on every stem and reads as
   * soft even when the texture is sharp. A light grotesque at wide tracking
   * stays crisp.
   */
  const rows = lines.split("\n");
  g.textAlign = "left";
  g.textBaseline = "middle";
  /**
   * Sized off the width, because the text runs across it.
   *
   * This was `height * 0.072`, which is the same number at 16:9 — 104 px on
   * the 2560 × 1440 canvas this was written for — and comes apart the moment
   * the panel is portrait. On a 1536 × 2048 canvas it gives 147 px type, and
   * "BRIGHTER TOMORROW" at that size and this tracking is 2040 px wide on a
   * 1536 px canvas: a tagline running off both edges of the brand wall.
   */
  const size = Math.round(width * 0.0406);
  const spacing = size * 0.22;
  rows.forEach((row, i) => {
    g.font = `300 ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    let x = width * 0.07;
    const y = height * 0.2 + i * size * 1.42;
    for (const ch of row) {
      g.fillStyle = "rgba(0,0,0,0.5)";
      g.fillText(ch, x + size * 0.028, y + size * 0.032);
      g.fillStyle = "#f6f3ec";
      g.fillText(ch, x, y);
      x += g.measureText(ch).width + spacing;
    }
  });

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

/** A wordmark on a dark ground, for a desk or a feature wall. */
export function makeWordmark(
  name: string,
  sub: string,
  width = 2048,
  height = 512,
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const g = c.getContext("2d")!;
  g.fillStyle = "#101113";
  g.fillRect(0, 0, width, height);
  g.textAlign = "center";
  g.textBaseline = "middle";

  const track = (text: string, y: number, size: number, spacing: number, fill: string) => {
    g.font = `300 ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    const widths = [...text].map((ch) => g.measureText(ch).width + spacing);
    const total = widths.reduce((a, b) => a + b, 0) - spacing;
    let x = width / 2 - total / 2;
    [...text].forEach((ch, i) => {
      g.fillStyle = fill;
      g.fillText(ch, x + widths[i] / 2 - spacing / 2, y);
      x += widths[i];
    });
  };
  track(name, height * 0.42, Math.round(height * 0.3), Math.round(height * 0.14), "#f0ece3");
  track(sub, height * 0.74, Math.round(height * 0.1), Math.round(height * 0.06), "#c9a362");

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

/* ------------------------------------------------------------------ */
/* Car detail: pillars and wheels                                      */
/* ------------------------------------------------------------------ */

/** A station interpolated between the two that bracket `t`. */
export function stationAt(stations: readonly CarStation[], t: number): CarStation {
  if (t <= stations[0].t) return stations[0];
  const last = stations[stations.length - 1];
  if (t >= last.t) return last;
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t);
      return {
        t,
        hw: lerp(a.hw, b.hw, f),
        sill: lerp(a.sill, b.sill, f),
        shoulder: lerp(a.shoulder, b.shoulder, f),
        roof: lerp(a.roof, b.roof, f),
        roofHw: lerp(a.roofHw, b.roofHw, f),
      };
    }
  }
  return last;
}

/** Concatenate position/normal/uv/index geometries into one. */
function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let nV = 0;
  let nI = 0;
  for (const g of parts) {
    nV += g.getAttribute("position").count;
    nI += g.getIndex()!.count;
  }
  const pos = new Float32Array(nV * 3);
  const nor = new Float32Array(nV * 3);
  const uv = new Float32Array(nV * 2);
  const idx = new Uint32Array(nI);
  let vo = 0;
  let io = 0;
  for (const g of parts) {
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    const u = g.getAttribute("uv");
    const i = g.getIndex()!;
    pos.set(p.array as Float32Array, vo * 3);
    if (n) nor.set(n.array as Float32Array, vo * 3);
    if (u) uv.set(u.array as Float32Array, vo * 2);
    for (let k = 0; k < i.count; k++) idx[io + k] = i.getX(k) + vo;
    vo += p.count;
    io += i.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/**
 * The pillars, as narrow bands of paint standing proud of the glass.
 *
 * Without them the greenhouse is one uninterrupted dark ribbon running from
 * the windscreen to the back light, and that single feature is the loudest
 * remaining tell that a car is a toy — real cabins are cut into three or four
 * panes by structure, and the eye counts them without being asked.
 *
 * Each is two stations of the glass section a few centimetres apart, pushed
 * out by 1.8 per cent and stretched past the beltline at the bottom and into
 * the roof cap at the top, so it reads as a column the glass is set into
 * rather than a sticker lying on it.
 */
export function makeCarPillars(
  stations: readonly CarStation[],
  length: number,
  pillars: readonly { t: number; w: number }[],
): THREE.BufferGeometry {
  const grow = (s: CarStation): CarStation => ({
    ...s,
    shoulder: s.shoulder - 0.035,
    roof: s.roof + 0.03,
  });
  const parts = pillars.map((p) => {
    const g = makeCarBody(
      [grow(stationAt(stations, p.t - p.w)), grow(stationAt(stations, p.t + p.w))],
      length,
      "glass",
    );
    g.scale(1, 1, 1.018);
    return g;
  });
  return mergeAll(parts);
}

/**
 * A tyre with a sidewall, as a lathe rather than a cylinder.
 *
 * A cylinder has a hard square edge at the tread, which is the one thing a
 * tyre does not have, and it reads as a hockey puck at any distance. The
 * profile here drops almost straight in from the bead to the shoulder — which
 * is what a low-profile sidewall does — and rolls over the last 20 mm.
 */
export function makeTyre(R: number, w = 0.235): THREE.BufferGeometry {
  const rim = R * 0.7;
  const h = w / 2;
  const profile: [number, number][] = [
    [rim, -h],
    [rim + 0.01, -h + 0.0025],
    [R * 0.86, -h + 0.0075],
    [R * 0.96, -h + 0.0155],
    [R * 0.995, -h + 0.0195],
    [R, -h + 0.024],
    [R, h - 0.024],
    [R * 0.995, h - 0.0195],
    [R * 0.96, h - 0.0155],
    [R * 0.86, h - 0.0075],
    [rim + 0.01, h - 0.0025],
    [rim, h],
  ];
  const g = new THREE.LatheGeometry(
    profile.map(([x, y]) => new THREE.Vector2(x, y)),
    26,
  );
  // The inner face of the wheel, so there is no hole through the hub, and a
  // dark dish for the spokes to sit in front of.
  const dish = new THREE.CylinderGeometry(rim * 0.99, rim * 0.99, 0.02, 24);
  dish.translate(0, h * 0.6, 0);
  const back = new THREE.CylinderGeometry(rim * 0.99, rim * 0.99, 0.02, 20);
  back.translate(0, -h * 0.8, 0);
  const out = mergeAll([g, dish, back]);
  // Axle along Z, face toward +Z — the orientation the car uses.
  out.rotateX(Math.PI / 2);
  return out;
}

/**
 * The alloy: a rim flange, five spokes, a hub and a brake disc behind them.
 *
 * All one geometry on purpose. Drawn as separate meshes this was eight calls
 * a wheel, thirty-two a car and nearly two hundred across the floor, on a
 * project whose whole performance problem has been the number of things
 * submitted per frame rather than the number of triangles in them.
 */
export function makeAlloy(R: number, w = 0.235): THREE.BufferGeometry {
  const rim = R * 0.7;
  const h = w / 2;
  const parts: THREE.BufferGeometry[] = [];

  const disc = new THREE.CylinderGeometry(rim * 0.74, rim * 0.74, 0.022, 22);
  disc.translate(0, h * 0.35, 0);
  parts.push(disc);

  const flange = new THREE.TorusGeometry(rim * 0.99, 0.016, 7, 28);
  flange.rotateX(Math.PI / 2);
  flange.translate(0, h * 0.86, 0);
  parts.push(flange);

  for (let k = 0; k < 5; k++) {
    const spoke = new THREE.BoxGeometry(rim * 1.72, 0.018, 0.085);
    spoke.rotateY((k * Math.PI * 2) / 5);
    spoke.translate(0, h * 0.78, 0);
    parts.push(spoke);
  }

  const hub = new THREE.CylinderGeometry(R * 0.17, R * 0.17, 0.028, 16);
  hub.translate(0, h * 0.9, 0);
  parts.push(hub);

  const out = mergeAll(parts);
  out.rotateX(Math.PI / 2);
  return out;
}
