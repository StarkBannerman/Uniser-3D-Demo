/**
 * What the machine can be asked to draw.
 *
 * The quality tier used to be chosen from `hardwareConcurrency` and
 * `deviceMemory`, which is to say from the CPU and the RAM — neither of which
 * this demo is limited by. It is limited by the GPU: measured on the car
 * showroom, twenty-two lights cost about 60 ms a frame and the five
 * rect-area lights alone cost 31 ms of that, all of it per-fragment work.
 *
 * A typical business laptop has eight cores and 8 GB and an integrated Intel
 * GPU, so the old detector handed it the full path — the second depth pass,
 * the reflector, multisampling — and it is exactly the machine that cannot
 * carry them. That is the shape of the client's report: fine on a Mac, very
 * slow on an HP.
 *
 * So the renderer string decides, and the cores-and-memory guess is only the
 * fallback for drivers that will not say what they are.
 */
export type Quality = "high" | "low";

/**
 * Classify a WebGL `UNMASKED_RENDERER_WEBGL` string, or null if it tells us
 * nothing useful.
 *
 * Deliberately a pure function of the string: it is the one part of this that
 * can be checked without the hardware in the room, and `pnpm verify` does.
 */
export function classifyRenderer(renderer: string): Quality | null {
  const r = renderer.toLowerCase();
  if (!r.trim()) return null;

  // No GPU at all — a software rasteriser, or a VM with nothing passed through.
  if (/swiftshader|llvmpipe|softpipe|basic render|microsoft basic|mesa offscreen/.test(r)) {
    return "low";
  }
  // Intel integrated parts. Iris Xe is the best of them and still a long way
  // short of what this scene wants.
  if (/intel/.test(r) && /(uhd|hd|iris|gma|g45|g41)\b/.test(r)) return "low";
  // Mobile and tablet parts.
  if (/\b(mali|adreno|powervr|videocore|vivante)\b/.test(r)) return "low";
  // AMD's integrated lines.
  if (/\b(vega \d|radeon\(tm\) graphics|radeon hd \d{4}g)\b/.test(r)) return "low";
  // Discrete desktop and laptop parts, and Apple's own silicon.
  if (/\b(geforce|rtx|gtx|quadro|radeon rx|radeon pro|arc a\d|apple m\d)/.test(r)) {
    return "high";
  }
  return null;
}

/** The renderer string this browser will admit to, or "" if it will not. */
export function rendererString(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ??
      canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name =
      (ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? "") : "") ||
      String(gl.getParameter(gl.RENDERER) ?? "") ||
      // A context that will not name itself is still a context.
      "unknown renderer";
    const lose = gl.getExtension("WEBGL_lose_context");
    lose?.loseContext();
    return name;
  } catch {
    return "";
  }
}

/**
 * How this machine can draw, if at all.
 *
 * Three outcomes, and they need different answers:
 *
 * - `"gpu"` — a real one. Pick a tier and render.
 * - `"software"` — WebGL exists but it is a CPU rasteriser (SwiftShader on a
 *   blocklisted driver, llvmpipe on a bare Linux box, most VDI and remote
 *   desktop sessions). Measured on the car showroom at the low tier, with
 *   thirteen lights and a 0.85 pixel ratio: **674 ms a frame, 1.5 fps** — and
 *   only 2.4 ms of that was submission, the rest was fill. No light budget
 *   rescues that, because the cost is per pixel on a CPU.
 * - `"none"` — no WebGL. Today the stage threw "Error creating WebGL context"
 *   and left "Building the room…" on screen for ever, which is the worst of
 *   the three outcomes to put in front of a customer.
 *
 * Creating the probe context is the only way to know, and it is cheap: one
 * throwaway canvas, released immediately.
 */
export type RenderPath = "gpu" | "software" | "none";

export function detectRenderPath(): RenderPath {
  if (typeof document === "undefined") return "gpu";
  const name = rendererString();
  if (!name) return "none";
  return isSoftware(name) ? "software" : "gpu";
}

/** Renderer strings that mean "there is no graphics hardware here". */
export function isSoftware(renderer: string): boolean {
  return /swiftshader|llvmpipe|softpipe|basic render|microsoft basic|mesa offscreen|generic renderer/.test(
    renderer.toLowerCase(),
  );
}
