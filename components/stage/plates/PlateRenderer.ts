/**
 * The plates compositor: one triangle, twelve texture reads, no scene graph.
 *
 * Raw WebGL2 rather than three.js, because there is nothing here three.js
 * would do for us. There is no camera to solve, no material system, no lights
 * and no depth buffer — the entire draw is "sum twelve images and tone map the
 * result", and wrapping that in a renderer, a scene, a mesh and a
 * ShaderMaterial would be more code and more bytes for identical pixels.
 *
 * The one thing that genuinely matters and is easy to get wrong: the textures
 * must be sampled raw. The plates carry a gamma-5 transfer curve of their own
 * (see `manifest.ts`), so the GPU must not apply an sRGB decode on top. That
 * is what `RGB8` rather than `SRGB8` as the internal format buys, and it is
 * the plates equivalent of `NoColorSpace`.
 */

import type { CurtainWindow } from "./window";

export type ToneCurve = "agx" | "aces";

const VERT = `#version 300 es
out vec2 vUv;
void main() {
  /**
   * A full-screen triangle from gl_VertexID, so there are no buffers, no
   * attributes and no vertex array to bind. Vertices land at (-1,-1), (3,-1)
   * and (-1,3): one triangle that covers the clip cube, which rasterises
   * marginally better than two because there is no shared edge down the
   * middle.
   */
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  /**
   * The v flip lives here, not in UNPACK_FLIP_Y_WEBGL.
   *
   * A GL framebuffer's origin is bottom-left and a decoded image's first row
   * is its top, so something has to turn one into the other. The pixel-store
   * flag is the usual answer and it is not reliable for every source type —
   * on the ImageBitmap path it silently did nothing here and the room came up
   * with its floor on the ceiling. Doing it in the vertex shader cannot be
   * ignored by an upload path, costs nothing, and is true for every source.
   *
   * p.y runs 0 at the bottom of the screen to 1 at the top, so 1 - p.y hands
   * the top of the frame texture row 0, which is the top of the plate.
   */
  vUv = vec2(p.x, 1.0 - p.y);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * The same triangle without the flip, for the resolve pass.
 *
 * The accumulate pass writes the room into a float buffer the right way up
 * for GL — its first row is the bottom of the frame, because that is where
 * the flip in `VERT` has already put it. Flipping a second time on the way
 * out would turn the room back over, so the blit samples the buffer
 * straight.
 */
const VERT_BLIT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/**
 * AgX, as three.js implements it.
 *
 * Copied rather than approximated so that if this room is ever graded against
 * one rendered by the 3D path they are the same curve. The trailing pow(2.2)
 * is part of AgX — it undoes the display encoding the curve bakes in, leaving
 * linear light for `toSRGB` to encode properly.
 */
const AGX = `
const mat3 AgXInsetMatrix = mat3(
  vec3(0.856627153315983, 0.137318972929847, 0.11189821299995),
  vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
  vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
const mat3 AgXOutsetMatrix = mat3(
  vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
  vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
  vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
const float AgxMinEv = -12.47393;
const float AgxMaxEv = 4.026069;

vec3 agxContrast(vec3 x) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4
       - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

vec3 toneMap(vec3 color) {
  color = AgXInsetMatrix * color;
  color = max(color, 1e-10);
  color = log2(color);
  color = (color - AgxMinEv) / (AgxMaxEv - AgxMinEv);
  color = clamp(color, 0.0, 1.0);
  color = agxContrast(color);
  color = AgXOutsetMatrix * color;
  return pow(max(vec3(0.0), color), vec3(2.2));
}
`;

/**
 * ACES filmic, also three's, and the curve the other ten rooms are graded on.
 *
 * Here because the brief specifies AgX for this room while the retired
 * real-time stage mounted
 * `ToneMappingMode.ACES_FILMIC` for every other one, and a client switching
 * rooms in the picker sees both. Which is right is a look decision, not an
 * engineering one, so both are compiled on demand and `?tone=` picks.
 */
const ACES = `
const mat3 ACESInputMat = mat3(
  vec3(0.59719, 0.07600, 0.02840),
  vec3(0.35458, 0.90834, 0.13383),
  vec3(0.04823, 0.01566, 0.83777));
const mat3 ACESOutputMat = mat3(
  vec3( 1.60475, -0.10208, -0.00327),
  vec3(-0.53108,  1.10813, -0.07276),
  vec3(-0.07367, -0.00605,  1.07602));

vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

vec3 toneMap(vec3 color) {
  color = ACESInputMat * (color / 0.6);
  color = RRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}
`;

/**
 * The curtain, as a per-pixel share of each plate set.
 *
 * Three sets — open, sheer drawn, blackout shut — and the picture is
 *
 *     sheerImg = mix(open,     sheerPlate,  m1)
 *     final    = mix(sheerImg, closedPlate, m2)
 *
 * Expand that and it is `A·open + B·sheer + C·closed` with `A + B + C = 1`,
 * which is a weighted sum like everything else here. Each accumulate pass
 * therefore scales its own contribution by its own coefficient and adds it
 * to the buffer, and the three coefficients happen to be functions of the
 * pixel rather than constants. Nothing else about the pipeline changes.
 *
 * `m1` and `m2` are the wipe. Inside the window they are a pair of panels
 * closing from both ends toward the middle; outside it they are the plain
 * crossfade, which is right — light spilling onto the far wall fades as the
 * fabric crosses the glass, it does not wipe.
 */
const WIPE = `
uniform mat3 uWindow;
uniform vec2 uCurtain;   // sheer, blackout, each 0 open to 1 drawn
uniform vec2 uSoft;      // edge softness in (t, s), about four pixels
uniform float uPad;
uniform float uHasWindow;
uniform float uDrop;     // 1 for a blind down the glass, 0 for panels along the track
uniform vec2 uSplit;     // how far each panel of a split reaches at full travel
uniform vec4 uOverlayRect;   // u0, v0, u1, v1 — where an overlay set may show
uniform vec2 uOverlaySoft;   // feathered edge, in uv
uniform float uOverlayMix;   // how far the overlay is on, 0..1
uniform float uOverlayDrop;  // 1 when the overlay rolls down its rect, 0 when it fades in
uniform int uSet;        // 0 open, 1 sheer, 2 closed

/** 1 well inside [0,1] expanded by pad, 0 well outside, soft across. */
float edgeAxis(float x, float pad, float soft) {
  return smoothstep(-pad - soft, -pad + soft, x)
       * smoothstep(-pad - soft, -pad + soft, 1.0 - x);
}

/**
 * How much of the glass a covering has taken at \`p\`.
 *
 * Two shapes, because two kinds of hardware. A blind comes down from the
 * head on a rigid bottom rail: one straight edge travelling down \`s\`, no
 * ripple, because the bottom rail of a venetian is an aluminium extrusion
 * and does not billow. Curtains leave the two jambs and meet in the
 * middle: a pair of edges travelling along \`t\`, with a ripple.
 *
 * Getting this wrong is not subtle. The cabin's blind shipped as a plain
 * crossfade, which made it fade in over the window instead of coming down
 * it — the covering appeared rather than moved, which is the one thing a
 * client who owns motorised shading is watching for.
 *
 * Two panels leaving the two ends and meeting in the middle. The ripple is
 * a little lead and lag down the drop so the leading edge is cloth rather
 * than a ruler, and it is damped by sin(pi*p) because at full travel an
 * undamped ripple pulls the two panels apart and leaves a seam of daylight
 * down the centre of a closed blackout.
 *
 * The two edges are deliberately *complementary* — one falls where the
 * other rises — and that is the whole of the fix for a seam that was
 * visible on a fully closed blackout. Written the obvious way, as two
 * ramps that each rise away from the panel's own edge, both terms are zero
 * exactly where the panels meet: the feathers fade out into each other
 * instead of adding up, so the sum dips to zero across six per cent of the
 * window right down the middle. Measured, a closed curtain had a bright
 * bar of night sky through it at every \`p\` below 1, and only the early
 * return below hid it at \`p\` of exactly 1.
 */
float coverAt(float p, float t, float s) {
  if (p <= 0.0) return 0.0;
  if (p >= 1.0) return 1.0;
  if (uDrop > 0.5) {
    // \`s\` is 0 at the sill and 1 at the head, so a blind at \`p\` has
    // taken everything above 1 - p. A tighter edge than a curtain's,
    // because a bottom rail is a hard line and a leading hem is not.
    const float hd = 0.008;
    return smoothstep(1.0 - p - hd, 1.0 - p + hd, s);
  }
  /**
   * Two panels, each reaching its own share of the opening.
   *
   * Half and half for curtains that meet in the middle; a drape that
   * stacks unevenly meets off centre and the two shares say where. The
   * edges stay complementary either way — one falls where the other
   * rises — which is what keeps the seam closed at full travel.
   */
  float ripple = 0.01 * sin(3.14159265 * p) * sin(s * 12.0);
  float fromNear = p * uSplit.x + ripple;
  float fromFar = 1.0 - (p * uSplit.y + ripple);
  const float h = 0.015;
  return clamp((1.0 - smoothstep(fromNear - h, fromNear + h, t))
             + smoothstep(fromFar - h, fromFar + h, t), 0.0, 1.0);
}

/**
 * How much of this pixel the overlay set owns.
 *
 * Zero everywhere outside its rectangle, and never anything at all when
 * the set is absent or its device is off — \`uOverlayMix\` carries both.
 * The edge is feathered rather than hard because a rectangle drawn over a
 * photograph with a clean edge is a rectangle somebody can see.
 */
float overlayShare() {
  if (uOverlayMix <= 0.0) return 0.0;
  vec2 lo = smoothstep(uOverlayRect.xy - uOverlaySoft, uOverlayRect.xy + uOverlaySoft, vUv);
  vec2 hi = smoothstep(uOverlayRect.zw + uOverlaySoft, uOverlayRect.zw - uOverlaySoft, vUv);
  float inRect = lo.x * lo.y * hi.x * hi.y;
  if (uOverlayDrop > 0.5) {
    /**
     * A projection screen rolling out of its ceiling slot.
     *
     * Not an opacity: the fabric is either there or it is not, and what
     * moves is the bottom edge. vUv.y runs downward, so the screen owns
     * every row above the line and the base owns the rest — which is
     * what makes the room behind it appear as the screen rolls back up.
     */
    float line = mix(uOverlayRect.y, uOverlayRect.w, uOverlayMix);
    return inRect * smoothstep(line + uOverlaySoft.y, line - uOverlaySoft.y, vUv.y);
  }
  return inRect * uOverlayMix;
}

float curtainCoef() {
  float t = 0.0;
  float s = 0.0;
  float inside = 0.0;
  if (uHasWindow > 0.5) {
    vec3 w = uWindow * vec3(vUv, 1.0);
    // Behind the camera plane the homography is meaningless, not merely
    // out of range, so those pixels are simply outside the window.
    if (w.z > 1e-6) {
      t = w.x / w.z;
      s = w.y / w.z;
      inside = edgeAxis(t, uPad, uSoft.x) * edgeAxis(s, uPad, uSoft.y);
    }
  }
  float m1 = mix(uCurtain.x, coverAt(uCurtain.x, t, s), inside);
  float m2 = mix(uCurtain.y, coverAt(uCurtain.y, t, s), inside);
  /**
   * The overlay replaces; the covering sets add up to what is left.
   *
   * \`mix(base, overlay, f)\` expands to \`(1-f)·base + f·overlay\`, and
   * \`base\` is itself the three covering shares — so every pass is still
   * one weighted add into the same buffer and the sum is still exactly
   * one. The fan is not a light; it is the same room with one object in
   * a different state, which is why it comes off the top rather than on.
   */
  float f = overlayShare();
  if (uSet == 3) return f;
  float rest = 1.0 - f;
  if (uSet == 0) return (1.0 - m1) * (1.0 - m2) * rest;
  if (uSet == 1) return m1 * (1.0 - m2) * rest;
  return m2 * rest;
}
`;

/**
 * The accumulate loop, unrolled into named samplers.
 *
 * GLSL ES 3.00 permits indexing a sampler array by a dynamically uniform
 * expression, which a constant-bound loop counter is, but drivers have been
 * unreliable about it for a decade and the failure is a link error on one
 * vendor's phone rather than anything visible here. Twelve generated lines
 * cost nothing and compile everywhere.
 */
function fragmentSource(
  n: number,
  tone: ToneCurve,
  target: "display" | "hdr",
  wipe: boolean,
  /**
   * Whether to compile the fan-sequence path at all.
   *
   * False when the context has no unit to spare for the atlas - the
   * showroom's sixteen layers leave none - and then `fanTexel` is a
   * passthrough and not one fan uniform is declared. Compiling it out
   * rather than disabling it at runtime means a room that cannot have a
   * turning fan also cannot have a sampler2DArray bound to a unit holding
   * a 2D texture, which some drivers reject at draw time whether or not
   * anything samples it.
   */
  fan: boolean,
): string {
  const samplers = Array.from({ length: n }, (_, i) => `uniform sampler2D uPass${i};`).join("\n");
  const accum = Array.from(
    { length: n },
    (_, i) =>
      `  hdr += uWeight[${i}] * pow(gate(fanTexel(uPass${i}, ${i}), uFloor[${i}]), g) * uScale[${i}];`,
  ).join("\n");

  /**
   * Straight to the screen, or to a float buffer for a second pass to add to.
   *
   * The `hdr` variant exists for the curtain blend and writes linear light
   * with no exposure and no tone curve, because tone mapping a half-summed
   * room and then adding the other half to it is not the same picture — the
   * curve is not linear and the sum has to finish first.
   */
  const write =
    target === "display"
      ? "  fragColor = vec4(toSRGB(toneMap(hdr * uExposure)), 1.0);"
      : wipe
        ? "  fragColor = vec4(hdr * curtainCoef(), 1.0);"
        : "  fragColor = vec4(hdr, 1.0);";

  /**
   * The fan substitution, or nothing at all.
   *
   * Built out here rather than inline so the passthrough is readable:
   * a room with no sequence compiles a one-line function the driver
   * folds away, not a disabled branch.
   */
  const fanGlsl = fan
    ? `/**
 * One frame of one layer, read out of the atlas.
 *
 * \`f\` is rounded to a frame and wrapped: the blur taps run either side of
 * the current angle, so the first tap of frame 0 is frame -2, and a fan is
 * a loop. \`mod\` is the right wrap for that because GLSL's takes the sign
 * of the divisor, so a negative tap lands at the top of the sequence
 * rather than off the end of the grid.
 *
 * The clamp is what keeps a tile off its neighbours. Tiles are packed edge
 * to edge with no gutter, so a LINEAR fetch half a texel outside this tile
 * reads the next frame of the sequence and the blade ghosts. Half a texel
 * in on each side is the whole fix, and it costs only the outer half-texel
 * of the rect - which the feather below has already handed back to the
 * base plate anyway.
 */
vec3 fanTile(int slot, vec2 q, float f) {
  float frames = uFanGrid.z;
  float i = mod(floor(f + 0.5), frames);
  float cx = mod(i, uFanGrid.x);
  float cy = floor(i / uFanGrid.x);
  vec2 uv = (vec2(cx, cy) + clamp(q, uFanInset, 1.0 - uFanInset)) / uFanGrid.xy;
  return texture(uFanAtlas, vec3(uv, float(slot))).rgb;
}

/**
 * How much of this pixel is the fan's, 0 outside the rect and 1 well in.
 *
 * Feathered *inwards only*. The first version straddled the boundary -
 * \`smoothstep(edge - soft, edge + soft)\` - which meant the band just
 * outside the rect got a share of the atlas, and outside the rect \`q\` is
 * negative and clamps to the tile's edge texel. So a few pixels of the
 * ceiling above the fan and the wall to its left were being painted with
 * the atlas's outermost row smeared along them. That was the thin dark
 * outline: the atlases carry a one-texel dark fringe on the top, bottom
 * and left of every tile (measured: the top row of the cove tile reads 20
 * where the plate reads 86), and straddling put that fringe on screen
 * twice over - once outside the rect, once at full strength on its first
 * row.
 *
 * Feathering inwards fixes both at once. At the boundary the mask is 0, so
 * the fringe row contributes nothing and the base plate draws it; by eight
 * texels in the mask is 1 and the pixel is all fan. The plate and the
 * atlas agree to about one count in 255 over that band, so the ramp hides
 * rounding rather than splicing two different pictures.
 *
 * An edge flush with the frame gets no feather at all - \`uFanSoft\` is 0
 * there and this is a hard step. The office fan runs off the right-hand
 * side of the plate, and feathering that edge would freeze the last eight
 * columns of blade against a still while the rest of it turned.
 */
float fanEdge(float x, float lo, float hi, float sLo, float sHi) {
  float a = sLo > 0.0 ? smoothstep(lo, lo + sLo, x) : step(lo, x);
  float b = sHi > 0.0 ? 1.0 - smoothstep(hi - sHi, hi, x) : step(x, hi);
  return a * b;
}

/**
 * This layer's texel: the base plate, or the fan's if it has one here.
 *
 * Substituted before the decode rather than after, because the atlases are
 * encoded exactly like the plates and carry the same per-layer scale - so
 * the fan goes through the identical pow(texel, gamma) * scale * level *
 * tint the rest of the room does, and is lit by whatever the room is doing
 * rather than pasted on top of it.
 *
 * Every layer goes through here, and a layer the sequence does not carry
 * falls back to its plate rather than to black. That distinction is what
 * the box was made of. The first sequence held five atlases out of the
 * room's thirteen, and the eight it did not hold were being dropped inside
 * the rect instead of read off the plate - so the cove's diagonal run
 * across the ceiling simply stopped at the rectangle's edge and picked up
 * again on the other side. The atlases now carry all thirteen, and the
 * \`slot < 0\` fallback below is what keeps a room whose sequence is one
 * circuit short looking continuous rather than cut out.
 *
 * The same substitution happens in every covering pass, including the one
 * drawn from the blinds-down set, and the texel it substitutes is then
 * decoded with *that set's* scale rather than the atlas's own. The two
 * differ, because the sequence was rendered against the open room: the
 * closed set reads sky at 0.889 where the atlas says 0.949, and
 * day_midday at 0.469 against 0.855. (No backticks in this comment - it
 * is inside a template literal, like the one on gate() below.)
 *
 * Measured, that is worth 1.15% of the light inside the rectangle with
 * every circuit at full and the blinds all the way down, and most of it
 * is ow_general being 1.6% out rather than anything to do with
 * daylight - the daylight layers are 80% and 96% out but they are four
 * hundredths of a per cent of this rectangle. One per cent of linear
 * light is well under a count on screen, and under the WebP noise the
 * atlases already carry, so it is left alone. The alternative is a second
 * scale uniform and a restructured accumulate line, to buy a fan that
 * otherwise stops turning when somebody lowers the blinds.
 */
vec3 fanTexel(sampler2D plate, int layer) {
  vec3 base = texture(plate, vUv).rgb;
  if (uFanOn <= 0.0) return base;
  int slot = uFanSlot[layer];
  if (slot < 0) return base;
  float m = fanEdge(vUv.x, uFanRect.x, uFanRect.z, uFanSoft.x, uFanSoft.z)
          * fanEdge(vUv.y, uFanRect.y, uFanRect.w, uFanSoft.y, uFanSoft.w);
  if (m <= 0.0) return base;
  vec2 q = (vUv - uFanRect.xy) / (uFanRect.zw - uFanRect.xy);
  // Motion blur: consecutive frames centred on the current angle, so the
  // smear sits on the blade rather than trailing it. Bounded at five so
  // the loop unrolls; uFanGrid.w carries the count the speed asks for.
  int taps = int(uFanGrid.w);
  vec3 sum = vec3(0.0);
  for (int t = 0; t < 5; t++) {
    if (t >= taps) break;
    sum += fanTile(slot, q, uFanFrame + float(t) - (uFanGrid.w - 1.0) * 0.5);
  }
  return mix(base, sum / uFanGrid.w, m);
}`
    : `vec3 fanTexel(sampler2D plate, int layer) { return texture(plate, vUv).rgb; }`;

  return `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform vec3 uWeight[${n}];
uniform float uScale[${n}];
uniform float uFloor[${n}];
uniform float uGamma;
uniform float uExposure;
${samplers}

/**
 * The fan sequence: one atlas per circuit that lights the fan, as one array
 * texture so the whole feature costs a single sampler.
 *
 * It has to be a single sampler. Units are the scarce thing here - the
 * showroom already uses all sixteen - and the office needs one atlas per
 * layer, so thirteen more sampler2Ds would want more than twice the units
 * the hardware has. A sampler2DArray holds every atlas on one unit, which
 * is also why they all have to be the same size.
 *
 * uFanSlot maps a layer index to its array slice, or -1 for a layer the
 * sequence does not carry. uFanOn is 0 until the atlases are loaded, which
 * is the whole of the fallback: an unloaded or absent sequence costs one
 * comparison per layer and draws the base plate.
 */
${
  fan
    ? `uniform highp sampler2DArray uFanAtlas;
uniform int   uFanSlot[${n}];
uniform vec4  uFanRect;    // u0, v0, u1, v1 - v downward, like vUv
uniform vec4  uFanSoft;    // feather inwards from u0, v0, u1, v1; 0 = hard
uniform vec4  uFanGrid;    // cols, rows, frames, taps
uniform vec2  uFanInset;   // half a texel, to keep a tile off its neighbour
uniform float uFanFrame;   // where in the sequence, as a float
uniform float uFanOn;      // 0 until the atlases are there`
    : ""
}

${target === "display" ? (tone === "agx" ? AGX : ACES) : ""}
${wipe ? WIPE : ""}

vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, step(c, vec3(0.0031308)));
}

/**
 * The noise gate, on for a layer whose profile asks for it.
 *
 * See PlateProfile.noiseFloor. A branch-free mix rather than a branch:
 * the flag is 0 or 1 per layer and never changes after link, so a gated
 * layer costs one smoothstep and the rest cost nothing measurable.
 * (No backticks in here - this string is a template literal.)
 */
vec3 gate(vec3 t, float on) {
  // Keyed on the pixel's peak channel and applied as one scalar, not run
  // per channel. Per channel it removes the weakest channel first, so a
  // dim reddish bounce pixel comes out *pure* red - measured, that made
  // the red coupe's cast worse than no gate at all. One key preserves hue
  // and takes the whole pixel to black together.
  float m = max(max(t.r, t.g), t.b);
  float k = max(m - 0.02, 0.0) / 0.98 * smoothstep(0.015, 0.04, m) / max(m, 1e-5);
  return mix(t, t * k, on);
}

${fanGlsl}

void main() {
  vec3 g = vec3(uGamma);
  vec3 hdr = vec3(0.0);
${accum}
${write}
}
`;
}

/**
 * The second half of the blend path: expose and tone map a finished sum.
 *
 * One texture read. Everything expensive already happened in the two
 * accumulate passes; this is the part that used to be the tail of the
 * fragment shader and is now its own draw because there are two accumulate
 * passes feeding it rather than one.
 */
function resolveSource(tone: ToneCurve): string {
  return `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uHdr;
uniform float uExposure;

${tone === "agx" ? AGX : ACES}

vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, step(c, vec3(0.0031308)));
}

void main() {
  fragColor = vec4(toSRGB(toneMap(texture(uHdr, vUv).rgb * uExposure)), 1.0);
}
`;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("plates: could not create shader");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`plates: shader failed to compile — ${log}`);
  }
  return sh;
}

export class PlateRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  /**
   * One slot per layer per plate set: set `k` occupies `k*n .. k*n+n-1`.
   *
   * Only ever `n` of them are bound at once, which is the whole reason the
   * blend is one pass per set — `MAX_TEXTURE_IMAGE_UNITS` is 16 on Apple
   * silicon, so even thirty-two samplers in one shader would not link, let
   * alone the forty-eight a three-set room would want.
   */
  private textures: (WebGLTexture | null)[];
  private blank: WebGLTexture;
  private uWeight: WebGLUniformLocation | null;
  private uScale: WebGLUniformLocation | null;
  private uExposure: WebGLUniformLocation | null;
  private n: number;
  /** Texture unit the fan atlas lives on, or -1 when there is no room. */
  private fanUnit = -1;
  private fanTex: WebGLTexture | null = null;
  private uFanFrame: WebGLUniformLocation | null = null;
  private uFanGrid: WebGLUniformLocation | null = null;
  private uFanOn: WebGLUniformLocation | null = null;
  private sets: number;
  private lost = false;

  /* The multi-set path. All null when there is only one plate set. */
  private resolve: WebGLProgram | null = null;
  private uResolveExposure: WebGLUniformLocation | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private hdr: WebGLTexture | null = null;
  private hdrType = 0;
  private scales: Float32Array[];
  private fboSize = { width: 0, height: 0 };

  /* Curtain uniforms, looked up once. */
  private uSet: WebGLUniformLocation | null = null;
  private uCurtain: WebGLUniformLocation | null = null;
  private uOverlayMix: WebGLUniformLocation | null = null;
  private scratch: Float32Array | null = null;

  /**
   * Which blend role each plate set plays: 0 open, 1 middle, 2 shut.
   *
   * Three sets is a window with two tracks and all three roles are filled.
   * Two sets is a window with one — blinds that lower, a single curtain —
   * and the second set is the *shut* one, not the middle one, so it takes
   * role 2 and the middle share stays empty. That keeps one shader and one
   * piece of algebra across both.
   */
  private roles: number[];

  /**
   * `scales` is one array per plate set, each one entry per layer in the
   * order the manifest lists them.
   *
   * One set is the plain path: accumulate straight to the canvas, tone map
   * in the same shader, no framebuffer. Two or three is a covering that
   * moves — blinds that lower, or a sheer and a blackout on their own
   * tracks — composited by `WIPE`.
   *
   * `window` places the glass so the covering can wipe across it. Without
   * it the sets crossfade globally, which is what a venetian blind
   * lowering and tilting actually looks like: it is not an edge travelling
   * along a track, it is the whole aperture closing at once.
   */
  constructor(
    private canvas: HTMLCanvasElement,
    gamma: number,
    scales: number[][],
    tone: ToneCurve,
    private window: CurtainWindow | null = null,
    /**
     * A final set composited over the room inside a rectangle, rather
     * than summed into it. `[u0, v0, u1, v1]`, v down.
     */
    private overlay: [number, number, number, number] | null = null,
    /**
     * How the overlay arrives: `fade` is an opacity over its whole
     * rectangle, `drop` is an edge rolling down it.
     */
    private overlayTravel: "fade" | "drop" = "fade",
    /**
     * One 0-or-1 per layer, in the same order as a `scales` row: 1 turns
     * the noise gate on for that layer. See `PlateProfile.noiseFloor`.
     * Omitted means off everywhere, which is every room but the showroom.
     */
    floors: number[] | null = null,
  ) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      // The capture harness reads the canvas back; without this the buffer is
      // undefined by the time a screenshot asks for it.
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("plates: no WebGL2 context");
    this.gl = gl;
    this.sets = scales.length;
    if (this.sets < 1 || this.sets > 4) {
      throw new Error(`plates: expected one to four plate sets, got ${this.sets}`);
    }
    /**
     * Which blend role each set plays. The overlay, when there is one, is
     * always last and always role 3 — it is composited over whatever the
     * covering sets add up to rather than being one of them.
     */
    const covering = overlay ? this.sets - 1 : this.sets;
    this.roles = covering === 3 ? [0, 1, 2] : covering === 2 ? [0, 2] : [0];
    if (overlay) this.roles.push(3);
    this.n = scales[0].length;
    if (scales.some((set) => set.length !== this.n)) {
      throw new Error("plates: the plate sets do not have the same layers");
    }
    this.scales = scales.map((set) => new Float32Array(set));

    const units = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number;
    /**
     * Is there a unit left over for a turning fan?
     *
     * Layers take 0..n-1 and the resolve pass takes n for the HDR, so the
     * atlas wants n+1. The showroom's sixteen layers leave nothing, and a
     * room that cannot spare a unit keeps the still fan - which is the
     * same fallback a room with no sequence rendered gets, so there is
     * only one path to test.
     */
    this.fanUnit = units >= this.n + 2 ? this.n + 1 : -1;
    if (units < this.n) {
      // WebGL2 mandates at least 16, so this is a driver lying or a context
      // we should not have been given. Better a named error than twelve
      // layers silently collapsing to eight.
      throw new Error(`plates: need ${this.n} texture units, got ${units}`);
    }

    /**
     * Can this context render to a float buffer?
     *
     * Only the multi-set path needs one. Half float is plenty: the summed
     * room peaks in the low thousands, where a half's eleven-bit mantissa
     * is good to about a twentieth of a per cent, and it is half the
     * bandwidth of a full float at every read and write.
     */
    const blending = this.sets > 1;
    this.uOverlayMix = null;
    if (blending) {
      const float = gl.getExtension("EXT_color_buffer_float");
      const half = float ? null : gl.getExtension("EXT_color_buffer_half_float");
      if (!float && !half) {
        throw new Error("plates: no renderable float format for the curtain blend");
      }
      this.hdrType = gl.HALF_FLOAT;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(
      gl,
      gl.FRAGMENT_SHADER,
      fragmentSource(this.n, tone, blending ? "hdr" : "display", blending, this.fanUnit >= 0),
    );
    const program = gl.createProgram();
    if (!program) throw new Error("plates: could not create program");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`plates: program failed to link — ${gl.getProgramInfoLog(program)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = program;
    gl.useProgram(program);

    /**
     * A single black texel, bound to every layer that has not arrived.
     *
     * The alternative is branching in the shader or recompiling as each plate
     * lands; this way the room simply composites what it has, and a circuit
     * that is still downloading contributes exactly nothing rather than
     * sampling a unit with no texture bound — which is undefined behaviour and
     * renders white on some drivers, i.e. the worst possible placeholder.
     */
    const blank = gl.createTexture();
    if (!blank) throw new Error("plates: could not create texture");
    gl.bindTexture(gl.TEXTURE_2D, blank);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.blank = blank;
    this.textures = Array.from({ length: this.n * this.sets }, () => null);

    for (let i = 0; i < this.n; i++) {
      gl.uniform1i(gl.getUniformLocation(program, `uPass${i}`), i);
    }
    if (this.fanUnit >= 0) {
      gl.uniform1i(gl.getUniformLocation(program, "uFanAtlas"), this.fanUnit);
      // Every layer is "not in the sequence" until one is loaded.
      gl.uniform1iv(
        gl.getUniformLocation(program, "uFanSlot"),
        new Int32Array(this.n).fill(-1),
      );
      this.uFanFrame = gl.getUniformLocation(program, "uFanFrame");
      this.uFanGrid = gl.getUniformLocation(program, "uFanGrid");
      this.uFanOn = gl.getUniformLocation(program, "uFanOn");
      gl.uniform1f(this.uFanOn, 0);
    }
    gl.uniform1f(gl.getUniformLocation(program, "uGamma"), gamma);
    this.uScale = gl.getUniformLocation(program, "uScale");
    gl.uniform1fv(this.uScale, this.scales[0]);
    // Set once: which layer gets the gate is a property of the room, not
    // of the frame, so this never moves again after link.
    gl.uniform1fv(
      gl.getUniformLocation(program, "uFloor"),
      new Float32Array(
        Array.from({ length: this.n }, (_, i) => floors?.[i] ?? 0),
      ),
    );
    this.uWeight = gl.getUniformLocation(program, "uWeight");
    this.uExposure = gl.getUniformLocation(program, "uExposure");

    if (blending) {
      this.uSet = gl.getUniformLocation(program, "uSet");
      this.uCurtain = gl.getUniformLocation(program, "uCurtain");
      this.uOverlayMix = gl.getUniformLocation(program, "uOverlayMix");
      if (overlay) {
        gl.uniform4fv(gl.getUniformLocation(program, "uOverlayRect"), overlay);
        // Six pixels, as the brief asks, in the plate's own uv.
        const px = 6;
        gl.uniform2f(
          gl.getUniformLocation(program, "uOverlaySoft"),
          px / Math.max(1, canvas.width || 1920),
          px / Math.max(1, canvas.height || 1080),
        );
        gl.uniform1f(
          gl.getUniformLocation(program, "uOverlayDrop"),
          overlayTravel === "drop" ? 1 : 0,
        );
      }
      gl.uniform1f(gl.getUniformLocation(program, "uHasWindow"), window ? 1 : 0);
      if (window) {
        // Column-major for GLSL, transposed here rather than by the driver:
        // `transpose = true` is legal in WebGL2 and was not in WebGL1, and
        // transposing nine floats once is cheaper than finding out which
        // drivers took the memo.
        const m = window.matrix;
        gl.uniformMatrix3fv(
          gl.getUniformLocation(program, "uWindow"),
          false,
          new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]),
        );
        gl.uniform1f(gl.getUniformLocation(program, "uPad"), window.pad);
        gl.uniform2fv(gl.getUniformLocation(program, "uSoft"), window.soft);
        gl.uniform1f(
          gl.getUniformLocation(program, "uDrop"),
          window.travel === "drop" ? 1 : 0,
        );
        gl.uniform2fv(gl.getUniformLocation(program, "uSplit"), window.split);
      }

      const rvs = compile(gl, gl.VERTEX_SHADER, VERT_BLIT);
      const rfs = compile(gl, gl.FRAGMENT_SHADER, resolveSource(tone));
      const rp = gl.createProgram();
      if (!rp) throw new Error("plates: could not create program");
      gl.attachShader(rp, rvs);
      gl.attachShader(rp, rfs);
      gl.linkProgram(rp);
      if (!gl.getProgramParameter(rp, gl.LINK_STATUS)) {
        throw new Error(`plates: resolve failed to link — ${gl.getProgramInfoLog(rp)}`);
      }
      gl.deleteShader(rvs);
      gl.deleteShader(rfs);
      this.resolve = rp;
      gl.useProgram(rp);
      // The accumulator binds on the unit past the last plate, so neither
      // pass has to unbind the other's textures.
      gl.uniform1i(gl.getUniformLocation(rp, "uHdr"), this.n);
      this.uResolveExposure = gl.getUniformLocation(rp, "uExposure");
      this.fbo = gl.createFramebuffer();
    }

    canvas.addEventListener("webglcontextlost", this.onLost);
  }

  private onLost = (e: Event) => {
    // Without preventDefault the context never comes back at all. Marking it
    // lost stops `draw` issuing calls against a dead context, which otherwise
    // spams the console once a frame for as long as the tab is open.
    e.preventDefault();
    this.lost = true;
  };

  get contextLost(): boolean {
    return this.lost;
  }

  /** How many plate sets this renderer was built for. */
  get plateSets(): number {
    return this.sets;
  }

  /**
   * Upload one decoded plate.
   *
   * `index` is the layer's position in the manifest order; `set` picks the
   * plate set, 0 being the one the space names as its own.
   */
  setLayer(index: number, source: TexImageSource, set = 0): void {
    const gl = this.gl;
    if (this.lost) return;
    const slot = set * this.n + index;
    if (slot >= this.textures.length) return;
    const tex = gl.createTexture();
    if (!tex) return;
    // Uploaded on the last unit rather than on the layer's own, so that
    // filling one set does not disturb another set's bindings.
    gl.activeTexture(gl.TEXTURE0 + this.n - 1);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // Uploaded in the image's own orientation; the shader does the v flip.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, source);
    /**
     * Mipmaps, which are not obviously worth 33% more memory and are.
     *
     * The stage box is frequently a good deal narrower than the plate — a
     * laptop running the demo layout gives it about half the width — and a
     * 2:1 minification of a frame containing a hundred wine glasses and a
     * track rail without mips is visibly crunchy on exactly the fine detail
     * this room is being judged on.
     */
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const previous = this.textures[slot];
    if (previous) gl.deleteTexture(previous);
    this.textures[slot] = tex;
  }

  /** True when this room can take a fan sequence at all. */
  get fanCapable(): boolean {
    return this.fanUnit >= 0 && !this.lost;
  }

  /**
   * Hand over the fan's atlases, one per layer the rectangle needs.
   *
   * `slots[i]` is the array slice for layer `i`, or -1 for a layer the
   * sequence does not carry. All the images must be the same size, which
   * the loader has already checked, because an array texture is one
   * allocation with a fixed footprint per slice. The office's thirteen
   * slices of 1260x1160 are about 76 MB on the card, which is a fifth of
   * what its three plate sets already hold and the reason this is loaded
   * on demand rather than with the room.
   *
   * No mipmaps, unlike the plates, and the brief is explicit about it. A
   * tile is a fifth of the atlas in each axis, so a mip chain would blend
   * neighbouring frames into each other at the first reduction - the
   * smear would be the fan at two angles rather than the fan out of
   * focus. `texStorage3D` is told one level, which is also what stops a
   * driver sampling an unallocated mip and returning black.
   *
   * It does mean the rectangle is sampled from level 0 while the plate
   * around it comes off a mip, so a heavily minified stage shows a little
   * more aliasing on the blades than on the ceiling behind them. That is
   * the right way round - the blades are the thing being looked at - and
   * the feather keeps the change of character off the boundary.
   */
  setFanAtlas(
    images: readonly TexImageSource[],
    slots: readonly number[],
    grid: { cols: number; rows: number; frames: number },
    tile: { width: number; height: number },
    rect: readonly [number, number, number, number],
  ): boolean {
    const gl = this.gl;
    if (!this.fanCapable || images.length === 0) return false;
    const width = tile.width * grid.cols;
    const height = tile.height * grid.rows;
    const tex = gl.createTexture();
    if (!tex) return false;
    gl.activeTexture(gl.TEXTURE0 + this.fanUnit);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGB8, width, height, images.length);
    images.forEach((img, i) => {
      gl.texSubImage3D(
        gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, width, height, 1, gl.RGB, gl.UNSIGNED_BYTE, img,
      );
    });
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.fanTex) gl.deleteTexture(this.fanTex);
    this.fanTex = tex;

    gl.useProgram(this.program);
    const p = this.program;
    gl.uniform1iv(
      gl.getUniformLocation(p, "uFanSlot"),
      new Int32Array(Array.from({ length: this.n }, (_, i) => slots[i] ?? -1)),
    );
    gl.uniform4f(gl.getUniformLocation(p, "uFanRect"), rect[0], rect[1], rect[2], rect[3]);
    /**
     * Eight plate texels of feather, inwards, on every edge that has a
     * plate on the other side of it.
     *
     * In *plate* texels, not canvas pixels, which is the correction. What
     * the feather is covering is a texel-grid artefact - half-texel
     * rounding where the atlas's grid meets the plate's, and the dark
     * fringe the packer leaves on the outside row of each tile - and
     * those are eight texels wide whatever size the canvas happens to be.
     * Measured in canvas pixels, as it was, the band shrank to nothing on
     * a wide display and the fringe came back.
     *
     * The rect spans `tile` texels of the plate, so one texel is
     * `span / tile` in uv and the conversion needs nothing else. At SD
     * that gives eight SD texels, which is the same share of the picture
     * and the same relation to the SD grid.
     *
     * Zero where the rect is flush with the frame: there is no plate out
     * there to blend back to, and feathering the office fan's right-hand
     * edge would leave eight columns of blade standing still.
     */
    const spanU = rect[2] - rect[0];
    const spanV = rect[3] - rect[1];
    const feather = 8;
    // Never more than two fifths of the rect from each side, so a small
    // rectangle ends up softened rather than erased.
    const softU = Math.min((feather * spanU) / tile.width, spanU * 0.4);
    const softV = Math.min((feather * spanV) / tile.height, spanV * 0.4);
    const edge = 1e-6;
    gl.uniform4f(
      gl.getUniformLocation(p, "uFanSoft"),
      rect[0] > edge ? softU : 0,
      rect[1] > edge ? softV : 0,
      rect[2] < 1 - edge ? softU : 0,
      rect[3] < 1 - edge ? softV : 0,
    );
    gl.uniform2f(
      gl.getUniformLocation(p, "uFanInset"),
      0.5 / tile.width,
      0.5 / tile.height,
    );
    gl.uniform4f(this.uFanGrid, grid.cols, grid.rows, grid.frames, 1);
    gl.uniform1f(this.uFanFrame, 0);
    gl.uniform1f(this.uFanOn, 1);
    return true;
  }

  /**
   * Where the fan is, and how much blur the speed asks for.
   *
   * Both numbers are checked rather than trusted, because the shape of
   * the failure is so far out of proportion to the mistake. A NaN tap
   * count divides the summed taps, every channel of every layer inside
   * the rectangle comes out NaN, and the fan becomes a hard-edged black
   * box — from one `undefined` in a four-entry table read at 2.4. The
   * taps are also clamped to five, which is how many the shader's
   * unrolled loop can actually add: ask for more and it would sum five
   * and divide by six.
   */
  setFanFrame(frame: number, taps: number, grid: { cols: number; rows: number; frames: number }): void {
    if (!this.fanTex || this.lost) return;
    const gl = this.gl;
    const n = Number.isFinite(taps) ? Math.min(5, Math.max(1, Math.round(taps))) : 1;
    gl.useProgram(this.program);
    gl.uniform1f(this.uFanFrame, Number.isFinite(frame) ? frame : 0);
    gl.uniform4f(this.uFanGrid, grid.cols, grid.rows, grid.frames, n);
  }

  /** Give the atlas memory back, on the way out of the room. */
  releaseFanAtlas(): void {
    if (!this.fanTex) return;
    const gl = this.gl;
    if (!this.lost) {
      gl.deleteTexture(this.fanTex);
      gl.useProgram(this.program);
      gl.uniform1f(this.uFanOn, 0);
    }
    this.fanTex = null;
  }

  /** Size the drawing buffer. No-op when it already matches. */
  resize(width: number, height: number): boolean {
    if (this.canvas.width === width && this.canvas.height === height) return false;
    this.canvas.width = width;
    this.canvas.height = height;
    return true;
  }

  /** Point the accumulator at a buffer the size of the canvas. */
  private sizeHdr(): void {
    const gl = this.gl;
    const { width, height } = this.canvas;
    if (this.hdr && this.fboSize.width === width && this.fboSize.height === height) return;
    if (this.hdr) gl.deleteTexture(this.hdr);
    const tex = gl.createTexture();
    if (!tex) return;
    gl.activeTexture(gl.TEXTURE0 + this.n);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, this.hdrType, null);
    // NEAREST, because the blit is one to one and half-float linear
    // filtering is an extension this does not need to depend on.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.hdr = tex;
    this.fboSize = { width, height };
  }

  /** Bind one plate set and add its share to whatever the buffer holds. */
  private accumulate(weights: Float32Array, set: number): void {
    const gl = this.gl;
    const offset = set * this.n;
    for (let i = 0; i < this.n; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[i + offset] ?? this.blank);
    }
    gl.uniform1fv(this.uScale, this.scales[set]);
    gl.uniform1i(this.uSet, this.roles[set]);
    gl.uniform3fv(this.uWeight, weights);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * Draw the room.
   *
   * `curtain` is the two tracks, each 0 drawn back to 1 drawn across. The
   * shader turns them into a per-pixel share of each plate set — see
   * `WIPE` — and because light adds linearly, the three shares can be
   * accumulated into one float buffer and tone mapped once at the end.
   * Tone mapping is not linear, so the sum has to be complete before the
   * curve is applied; compositing each set to the screen and blending there
   * would be a different and wrong picture.
   *
   * A set whose share is zero over the whole frame is not drawn at all, so
   * a room sitting at any of the three rest positions costs one pass and a
   * blit, and only a track actually in motion costs two or three.
   */
  draw(
    weights: Float32Array,
    exposure: number,
    curtain: [number, number] = [0, 0],
    /** How strongly the overlay set shows, 0..1. */
    overlayMix = 0,
  ): void {
    const gl = this.gl;
    if (this.lost) return;
    gl.useProgram(this.program);

    if (this.sets === 1) {
      for (let i = 0; i < this.n; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, this.textures[i] ?? this.blank);
      }
      gl.uniform3fv(this.uWeight, weights);
      gl.uniform1f(this.uExposure, exposure);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return;
    }

    // A two-set room has no middle track, so whatever its one motor is
    // called, it drives the shut set.
    const sheer = this.sets === 3 ? Math.min(Math.max(curtain[0], 0), 1) : 0;
    const blackout = Math.min(Math.max(curtain[1], 0), 1);
    /**
     * Read straight off the algebra in `WIPE`: the open set is gone the
     * moment either track is fully across, the middle set needs the first
     * track across and the second not, and the shut set needs the second
     * to have started.
     */
    const fan = this.overlay ? Math.min(Math.max(overlayMix, 0), 1) : 0;
    /**
     * Which sets contribute anything at all, by role.
     *
     * The covering sets are never skipped on the overlay's account. An
     * overlay is confined to its own rectangle by construction, so even
     * at full strength it leaves the rest of the frame to them — and
     * dropping them because `fan` reached 1 took the boardroom to a
     * frame mean of 0.016 the moment the screen landed, a black room
     * with a lit screen in the middle of it.
     */
    const byRole = [
      sheer < 1 && blackout < 1,
      sheer > 0 && blackout < 1,
      blackout > 0,
      fan > 0,
    ];

    this.sizeHdr();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.BLEND);
    gl.uniform2f(this.uCurtain, sheer, blackout);
    gl.uniform1f(this.uOverlayMix, fan);

    let first = true;
    for (let set = 0; set < this.sets; set++) {
      if (!byRole[this.roles[set]]) continue;
      if (!first) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
      }
      this.accumulate(weights, set);
      first = false;
    }
    gl.disable(gl.BLEND);
    if (first) {
      // Nothing contributed, which the algebra says cannot happen — but a
      // cleared buffer is a black room rather than last frame's.
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.resolve);
    gl.activeTexture(gl.TEXTURE0 + this.n);
    gl.bindTexture(gl.TEXTURE_2D, this.hdr);
    gl.uniform1f(this.uResolveExposure, exposure);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    const gl = this.gl;
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    if (this.lost) return;
    for (const t of this.textures) if (t) gl.deleteTexture(t);
    gl.deleteTexture(this.blank);
    if (this.hdr) gl.deleteTexture(this.hdr);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    if (this.resolve) gl.deleteProgram(this.resolve);
    gl.deleteProgram(this.program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
