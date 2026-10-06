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
export function makeCityTexture(daylight: number, seed = 7): THREE.CanvasTexture {
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

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
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
export function makeRugTexture(seed = 8821): THREE.CanvasTexture {
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

  g.fillStyle = "#8d8679";
  g.fillRect(0, 0, n, n);
  for (let i = 0; i < 260; i++) {
    const r = 10 + rnd() * 70;
    const x = rnd() * n;
    const y = rnd() * n;
    const dark = rnd() < 0.55;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, dark ? `rgba(30,26,22,${0.14 + rnd() * 0.36})` : `rgba(208,199,182,${0.1 + rnd() * 0.3})`);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // A worn border, so it reads as a rug and not as a painted rectangle.
  g.strokeStyle = "rgba(42,36,30,0.3)";
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
