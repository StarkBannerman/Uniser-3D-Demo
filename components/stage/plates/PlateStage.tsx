"use client";

/**
 * The plates stage.
 *
 * Fills whatever box it is given and owns one canvas. Everything live about
 * the room arrives through `useSim.subscribe` and leaves as twelve uniforms —
 * there is deliberately no React state in the hot path, because a store that
 * ticks at sixty hertz through a component tree is the one way to make a
 * renderer this cheap expensive again.
 *
 * Three things are worth knowing before changing anything here:
 *
 *  1. **It draws on change, not on a clock.** A fade redraws every frame; an
 *     idle room redraws never. That is most of the battery argument for
 *     putting this room on a tablet at all.
 *  2. **It is interactive before it is complete.** The circuits the opening
 *     scene actually uses load first, and the still covers the gap. A plate
 *     that has not landed composites as black, which is exactly what a
 *     switched-off circuit looks like, so there is no wrong intermediate
 *     state to see.
 *  3. **Without WebGL2 it shows the still and says so.** See `Fallback`.
 */

import { useEffect, useRef, useState } from "react";
import { useSim } from "@/lib/sim/store";
import type { LightState } from "@/lib/sim/types";
import { detectRenderPath } from "@/lib/device";
import {
  CIRCUIT_LAYERS,
  DAY_LAYERS,
  LAYERS,
  SKY_LAYER,
  deviceIdOf,
  plateUrl,
  stillUrl,
  type HotspotFile,
  type PlateManifest,
  type PlateTier,
} from "./manifest";
import { PlateRenderer, type ToneCurve } from "./PlateRenderer";
import { computeWeights, emptyWeights } from "./weights";

/**
 * Scene exposure, applied to the summed HDR before the tone curve.
 *
 * Re-settled at 1.4 when tints moved to luminance 1. That change roughly
 * doubles a warm tint — a 2700 K triple carries about half the luminance of
 * a neutral one, and dividing it out gives the light back — so the 2.5 that
 * was right before became about 40% too hot, which lifts the blacks and
 * squeezes Evening, Dinner, Fine Dining and Private Event into the same
 * picture. 1.4 puts settled Dinner back at 0.138 mean, where it was when the
 * grade was checked against the plate set's own still.
 *
 * `?exposure=` overrides it. It still wants re-settling against the client's
 * reference frame, which is not in the repo.
 */
const EXPOSURE = 1.4;

function param(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * HD or SD, decided by how many pixels the box actually wants.
 *
 * Not by the device class. A phone and a laptop running the demo layout at a
 * third of the window can want the same number of pixels, and the plate that
 * matches the box is both sharper and cheaper than the plate that matches the
 * badge on the lid. The one override is a software rasteriser, which should
 * never be handed four times the fill.
 */
function pickTier(cssWidth: number, sdWidth: number): PlateTier {
  const forced = param("tier");
  if (forced === "hd" || forced === "sd") return forced;
  if (detectRenderPath() === "software") return "sd";
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return cssWidth * dpr > sdWidth ? "hd" : "sd";
}

/**
 * Keep a marker off the frame edge, where half the button would be clipped.
 *
 * `rs-rgb` projects to u = 0.972 because the piers it washes are at the very
 * right of shot, and an unclamped marker there loses half its target area to
 * the rounded corner of the stage.
 */
const clampEdge = (v: number) => Math.min(Math.max(v, 0.03), 0.97);

function toneCurve(): ToneCurve {
  return param("tone") === "aces" ? "aces" : "agx";
}

/**
 * Which plates the room needs before it can be shown.
 *
 * The circuits the current state actually has switched on, plus the sky, plus
 * the day layers if the sun is up. Everything else can arrive afterwards: a
 * circuit at zero contributes nothing, so its plate landing late changes
 * nothing on screen.
 */
function loadOrder(states: Record<string, unknown>, daylit: boolean): string[] {
  const active: string[] = [];
  const rest: string[] = [];
  for (const layer of CIRCUIT_LAYERS) {
    const s = states[deviceIdOf(layer)] as LightState | undefined;
    (s?.on && s.level > 0 ? active : rest).push(layer);
  }
  const day = daylit ? DAY_LAYERS : [];
  return [...active, SKY_LAYER, ...day, ...rest, ...(daylit ? [] : DAY_LAYERS)];
}

async function loadImage(url: string): Promise<ImageBitmap | HTMLImageElement> {
  /**
   * `createImageBitmap` off the main thread where it exists, which is
   * everywhere that matters — twelve 1920x1080 WebP decodes on the main
   * thread is about a second of jank landing exactly while the client is
   * first looking at the room.
   */
  const res = await fetch(url);
  if (!res.ok) throw new Error(`plates: ${url} — ${res.status}`);
  const blob = await res.blob();
  if (typeof createImageBitmap === "function") return createImageBitmap(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`plates: could not decode ${url}`));
    img.src = URL.createObjectURL(blob);
  });
}

export function PlateStage({
  dir,
  controlsOpen = false,
}: {
  dir: string;
  /** Controls tab is showing, so the room should say where each circuit is. */
  controlsOpen?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tier, setTier] = useState<PlateTier | null>(null);
  const [hotspots, setHotspots] = useState<HotspotFile | null>(null);
  const [hovered, setHovered] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let cancelled = false;
    let renderer: PlateRenderer | null = null;
    let unsubscribe: (() => void) | null = null;
    let observer: ResizeObserver | null = null;
    let frame = 0;

    (async () => {
      let manifest: PlateManifest;
      let chosen: PlateTier;
      try {
        const [m, h] = await Promise.all([
          fetch(`${dir}/manifest.json`).then((r) => r.json() as Promise<PlateManifest>),
          fetch(`${dir}/hotspots.json`).then((r) => r.json() as Promise<HotspotFile>),
        ]);
        if (cancelled) return;
        manifest = m;
        chosen = pickTier(container.clientWidth || manifest.width, m.sd[0]);
        setTier(chosen);
        setHotspots(h);
      } catch (e) {
        if (!cancelled) setFailed(e instanceof Error ? e.message : "plate set would not load");
        return;
      }

      const plateW = chosen === "hd" ? manifest.width : manifest.sd[0];
      const plateH = chosen === "hd" ? manifest.height : manifest.sd[1];

      try {
        renderer = new PlateRenderer(
          canvas,
          manifest.gamma,
          LAYERS.map((l) => manifest.layers[l]?.scale ?? 0),
          toneCurve(),
        );
      } catch (e) {
        if (!cancelled) setFailed(e instanceof Error ? e.message : "WebGL2 unavailable");
        return;
      }

      const exposure = Number(param("exposure")) || EXPOSURE;
      const weights = emptyWeights();
      let dirty = true;

      const schedule = () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (!renderer || !dirty) return;
          dirty = false;
          renderer.draw(weights, exposure);
        });
      };

      const refresh = () => {
        const { space, states, clockMin } = useSim.getState();
        if (!space) return;
        if (computeWeights(weights, space, states, clockMin)) {
          dirty = true;
          schedule();
        }
      };

      /**
       * Size the drawing buffer to the box, capped at the plate.
       *
       * Rendering more pixels than the plate has cannot add detail — it only
       * magnifies the same texels through a bigger framebuffer — so the cap is
       * free quality-neutral savings on a retina desktop.
       */
      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.min(Math.round(container.clientWidth * dpr), plateW));
        const h = Math.max(1, Math.min(Math.round(container.clientHeight * dpr), plateH));
        if (renderer?.resize(w, h)) {
          dirty = true;
          schedule();
        }
      };
      resize();
      observer = new ResizeObserver(resize);
      observer.observe(container);

      const { states, space, clockMin } = useSim.getState();
      const daylit = space
        ? clockMin > space.environment.sunriseMin && clockMin < space.environment.sunsetMin
        : false;
      const order = loadOrder(states, daylit);
      // Everything up to and including the last day layer is what the opening
      // frame actually needs; the rest can land whenever.
      const cut = order.indexOf(SKY_LAYER) + 1 + (daylit ? DAY_LAYERS.length : 0);

      refresh();
      unsubscribe = useSim.subscribe(refresh);

      const fetchLayer = async (layer: string) => {
        try {
          const image = await loadImage(plateUrl(dir, chosen, layer));
          if (cancelled || !renderer) return;
          renderer.setLayer(LAYERS.indexOf(layer as (typeof LAYERS)[number]), image);
          if ("close" in image) image.close();
          dirty = true;
          schedule();
        } catch (e) {
          // One missing plate is a dark circuit, not a dead room.
          console.error(e);
        }
      };

      /**
       * Two waves, each in parallel, rather than twelve fetches in a row.
       *
       * The circuits the opening frame actually uses go first. Within a wave
       * they go together, because over HTTP/2 the expensive part of a small
       * file is the round trip and not the pipe — awaiting them one at a time
       * turns a single 300 ms penalty into twelve, which is the difference
       * between the brief’s three seconds to interactive on 4G and about ten.
       */
      await Promise.all(order.slice(0, cut).map(fetchLayer));
      if (cancelled) return;
      setReady(true);
      await Promise.all(order.slice(cut).map(fetchLayer));
    })();

    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      unsubscribe?.();
      renderer?.dispose();
    };
  }, [dir]);

  const space = useSim((s) => s.space);
  const select = useSim((s) => s.select);
  /**
   * Shown on hover, or whenever the Controls tab is open.
   *
   * At rest the room is a photograph and markers on it read as dirt — which
   * is how the first version of this landed. Hover covers a presenter
   * reaching for a fixture with a mouse; the Controls tab covers touch, where
   * there is no hover and where someone looking at a list of eight circuit
   * names genuinely wants to know which part of the room each one is.
   */
  const showHotspots = controlsOpen || hovered;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ opacity: ready && !failed ? 1 : 0, transition: "opacity 400ms ease-out" }}
      />

      {/*
        The still, which is a tone-mapped composite of the room at a plausible
        middle setting rather than of the opening scene exactly. It is covering
        about a second of streaming, under a cross-fade, and the cross-fade is
        what makes the difference between the two invisible — matching it to
        the opening scene would be chasing a frame nobody sees settle.
      */}
      {tier && (
        <img
          src={stillUrl(dir, tier)}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          style={{ opacity: ready && !failed ? 0 : 1, transition: "opacity 400ms ease-out" }}
        />
      )}

      {failed && <Fallback reason={failed} />}

      {ready && !failed && hotspots && space && (
        <div
          className="absolute inset-0 transition-opacity duration-200"
          style={{
            opacity: showHotspots ? 1 : 0,
            // Set on the wrapper rather than per button, so a hidden marker
            // is not a target you can hit by accident.
            pointerEvents: showHotspots ? "auto" : "none",
          }}
        >
          {Object.entries(hotspots.points).map(([deviceId, point]) => {
            if (!point.visible) return null;
            const device = space.devices.find((d) => d.id === deviceId);
            if (!device) return null;
            return (
              <button
                key={deviceId}
                type="button"
                tabIndex={showHotspots ? 0 : -1}
                onClick={() => select(deviceId)}
                aria-label={`Show ${device.name} controls`}
                className="group absolute -translate-x-1/2 -translate-y-1/2 p-2.5"
                style={{
                  left: `${clampEdge(point.u) * 100}%`,
                  top: `${clampEdge(point.v) * 100}%`,
                }}
              >
                <span className="block h-2 w-2 rounded-full bg-brass-400/80 ring-1 ring-black/50 transition group-hover:scale-125 group-hover:bg-brass-300" />
                <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[10px] text-shell-100 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                  {device.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * No WebGL2, so the room is a photograph.
 *
 * The brief's fallback was a 2D-canvas composite with `lighter` and
 * `multiply`, and that was the right answer for the RGBM/AVIF plates it was
 * written against. It does not survive the encoding that actually shipped:
 * these plates carry a gamma-5 curve that has to be undone per channel before
 * the layers can be summed, and `globalCompositeOperation` has no exponent.
 * Doing it in `ImageData` is twelve layers of 518 400 pixels per redraw —
 * about six million `pow` calls — which is some hundreds of milliseconds a
 * frame and therefore not a fallback, just a slower way to fail.
 *
 * So the honest degradation is the still: the room, correct, not live. The
 * keypad, the app, the scenes, the energy figures and the rules all keep
 * working, which is most of what this demo is for.
 */
function Fallback({ reason }: { reason: string }) {
  useEffect(() => {
    console.warn(`plates: falling back to the still — ${reason}`);
  }, [reason]);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
      <p className="text-xs text-white/70">
        Static view — this device has no WebGL2. Controls and scenes still run.
      </p>
    </div>
  );
}
