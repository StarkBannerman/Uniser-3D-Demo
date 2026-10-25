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
 * Here because the brief specifies AgX for this room while `Stage3D` mounts
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
): string {
  const samplers = Array.from({ length: n }, (_, i) => `uniform sampler2D uPass${i};`).join("\n");
  const accum = Array.from(
    { length: n },
    (_, i) => `  hdr += uWeight[${i}] * pow(texture(uPass${i}, vUv).rgb, g) * uScale[${i}];`,
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

  return `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform vec3 uWeight[${n}];
uniform float uScale[${n}];
uniform float uGamma;
uniform float uExposure;
${samplers}

${target === "display" ? (tone === "agx" ? AGX : ACES) : ""}
${wipe ? WIPE : ""}

vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, step(c, vec3(0.0031308)));
}

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
      fragmentSource(this.n, tone, blending ? "hdr" : "display", blending),
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
    gl.uniform1f(gl.getUniformLocation(program, "uGamma"), gamma);
    this.uScale = gl.getUniformLocation(program, "uScale");
    gl.uniform1fv(this.uScale, this.scales[0]);
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
