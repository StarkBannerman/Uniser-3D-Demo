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
    const name = ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? "")
      : String(gl.getParameter(gl.RENDERER) ?? "");
    const lose = gl.getExtension("WEBGL_lose_context");
    lose?.loseContext();
    return name;
  } catch {
    return "";
  }
}
