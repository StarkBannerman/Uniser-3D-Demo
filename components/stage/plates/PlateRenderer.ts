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

import { LAYERS } from "./manifest";

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
 * The accumulate loop, unrolled into named samplers.
 *
 * GLSL ES 3.00 permits indexing a sampler array by a dynamically uniform
 * expression, which a constant-bound loop counter is, but drivers have been
 * unreliable about it for a decade and the failure is a link error on one
 * vendor's phone rather than anything visible here. Twelve generated lines
 * cost nothing and compile everywhere.
 */
function fragmentSource(n: number, tone: ToneCurve): string {
  const samplers = Array.from({ length: n }, (_, i) => `uniform sampler2D uPass${i};`).join("\n");
  const accum = Array.from(
    { length: n },
    (_, i) => `  hdr += uWeight[${i}] * pow(texture(uPass${i}, vUv).rgb, g) * uScale[${i}];`,
  ).join("\n");

  return `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform vec3 uWeight[${n}];
uniform float uScale[${n}];
uniform float uGamma;
uniform float uExposure;
${samplers}

${tone === "agx" ? AGX : ACES}

vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, step(c, vec3(0.0031308)));
}

void main() {
  vec3 g = vec3(uGamma);
  vec3 hdr = vec3(0.0);
${accum}
  fragColor = vec4(toSRGB(toneMap(hdr * uExposure)), 1.0);
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
  private textures: (WebGLTexture | null)[];
  private blank: WebGLTexture;
  private uWeight: WebGLUniformLocation | null;
  private uExposure: WebGLUniformLocation | null;
  private n: number;
  private lost = false;

  constructor(
    private canvas: HTMLCanvasElement,
    gamma: number,
    scales: number[],
    tone: ToneCurve,
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
    this.n = LAYERS.length;

    const units = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number;
    if (units < this.n) {
      // WebGL2 mandates at least 16, so this is a driver lying or a context
      // we should not have been given. Better a named error than twelve
      // layers silently collapsing to eight.
      throw new Error(`plates: need ${this.n} texture units, got ${units}`);
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource(this.n, tone));
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
    this.textures = Array.from({ length: this.n }, () => null);

    for (let i = 0; i < this.n; i++) {
      gl.uniform1i(gl.getUniformLocation(program, `uPass${i}`), i);
    }
    gl.uniform1f(gl.getUniformLocation(program, "uGamma"), gamma);
    gl.uniform1fv(gl.getUniformLocation(program, "uScale"), new Float32Array(scales));
    this.uWeight = gl.getUniformLocation(program, "uWeight");
    this.uExposure = gl.getUniformLocation(program, "uExposure");

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

  /** Upload one decoded plate. Index is its position in `LAYERS`. */
  setLayer(index: number, source: TexImageSource): void {
    const gl = this.gl;
    if (this.lost) return;
    const tex = gl.createTexture();
    if (!tex) return;
    gl.activeTexture(gl.TEXTURE0 + index);
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
    const previous = this.textures[index];
    if (previous) gl.deleteTexture(previous);
    this.textures[index] = tex;
  }

  /** Size the drawing buffer. No-op when it already matches. */
  resize(width: number, height: number): boolean {
    if (this.canvas.width === width && this.canvas.height === height) return false;
    this.canvas.width = width;
    this.canvas.height = height;
    return true;
  }

  draw(weights: Float32Array, exposure: number): void {
    const gl = this.gl;
    if (this.lost) return;
    gl.useProgram(this.program);
    for (let i = 0; i < this.n; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[i] ?? this.blank);
    }
    gl.uniform3fv(this.uWeight, weights);
    gl.uniform1f(this.uExposure, exposure);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    const gl = this.gl;
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    if (this.lost) return;
    for (const t of this.textures) if (t) gl.deleteTexture(t);
    gl.deleteTexture(this.blank);
    gl.deleteProgram(this.program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
