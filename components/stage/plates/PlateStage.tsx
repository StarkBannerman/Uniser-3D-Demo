"use client";

/**
 * The plates stage.
 *
 * Fills whatever box it is given and owns one canvas. Everything live about
 * the room arrives through `useSim.subscribe` and leaves as one uniform per
 * layer — there is deliberately no React state in the hot path, because a
 * store ticking at sixty hertz through a component tree is the one way to
 * make a renderer this cheap expensive again.
 *
 * Four things are worth knowing before changing anything here:
 *
 *  1. **The layer list comes from the manifest.** Not from a constant in this
 *     repo. The set is re-rendered more often than this code changes, and the
 *     last reissue moved the camera, rebuilt the room and added `sky_day`.
 *  2. **It draws on change, not on a clock.** A fade redraws every frame; an
 *     idle room redraws never.
 *  3. **Clock-driven layers are eased here; circuits are not.** The scene
 *     engine already tweens levels and colour temperature over each scene's
 *     `fadeMs`, so those arrive smooth. What it does *not* tween is the
 *     clock: `applyScene` sets `clockMin` outright, so pressing Day used to
 *     fade the lights over two seconds while the window cut from night to
 *     morning in one frame. See `easeClockLayers`.
 *  4. **It is interactive before it is complete.** The layers the opening
 *     scene uses load first and the still covers the gap.
 */

import { useEffect, useRef, useState } from "react";
import { useSim } from "@/lib/sim/store";
import type { LightState, ShadeState } from "@/lib/sim/types";
import { curtainWindow } from "./window";
import { classifyRenderer, detectRenderPath, rendererString } from "@/lib/device";
import {
  DAY_ORDER,
  deviceIdOf,
  layerRole,
  layersOf,
  plateUrl,
  stillUrl,
  type HotspotFile,
  type PlateManifest,
  type PlateTier,
} from "./manifest";
import { PlateRenderer, type ToneCurve } from "./PlateRenderer";
import { CLOCK_EASE_MS } from "./profile";
import { profileFor } from "./profiles";
import {
  computeWeights,
  dayness,
  emptyWeights,
  isClockDriven,
} from "./weights";

function param(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * HD or SD.
 *
 * Narrow viewports take SD because the plate that matches the box is both
 * sharper and cheaper than the plate that matches the badge on the lid, and
 * a dense-pixel touch device takes it because four times the fill on a
 * phone GPU buys nothing a phone screen can show. A software rasteriser
 * takes it unconditionally.
 *
 * `sets` is how many plate sets this room holds, which is three for a room
 * with curtains — open, sheer across, blackout shut. Sixteen HD layers is
 * about 175 MB of texture with mipmaps, so forty-eight is 530, and that is
 * the figure the tier has to answer for.
 *
 * Measured on Apple silicon, 530 MB loads and a travelling curtain holds
 * 58 fps with three accumulate passes, so a GPU we can name as capable
 * gets HD. Anything in the low tier does not — it is the Intel integrated
 * part `lib/device.ts` was written for, sharing system RAM, and half a
 * gigabyte of plates is not a reasonable thing to ask of it. Nor does a
 * renderer string we cannot place at all: at two sets an unknown GPU was
 * worth the benefit of the doubt, and at three it is not.
 */
function pickTier(sets = 1): PlateTier {
  const forced = param("tier");
  if (forced === "hd" || forced === "sd") return forced;
  if (detectRenderPath() === "software") return "sd";
  if (window.innerWidth < 1200) return "sd";
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  if (coarse && (window.devicePixelRatio || 1) > 2) return "sd";
  if (sets > 1) {
    const gpu = classifyRenderer(rendererString());
    if (gpu === "low") return "sd";
    if (gpu === null && sets > 2) return "sd";
  }
  return "hd";
}

function toneCurve(): ToneCurve {
  return param("tone") === "aces" ? "aces" : "agx";
}

/** Keep a marker off the frame edge, where half the button would be clipped. */
const clampEdge = (v: number) => Math.min(Math.max(v, 0.03), 0.97);

/** Cubic ease-in-out. */
const easeInOut = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

/**
 * Which layers the opening frame actually needs.
 *
 * The circuits that are switched on, whichever of the two views the clock is
 * showing, and the sun angles that are contributing. Everything else can land
 * afterwards: a layer at weight zero changes nothing on screen, so a late
 * arrival is invisible rather than wrong.
 */
function loadOrder(
  layers: string[],
  states: Record<string, unknown>,
  clockMin: number,
): { needed: string[]; rest: string[] } {
  // `rest` is still returned because it is the other half of the statement
  // this function is making, and the caller builds its waves from both the
  // layer split and the plate-set split rather than from this list alone.
  const lit = dayness(clockMin);
  const needed: string[] = [];
  const rest: string[] = [];
  for (const layer of layers) {
    let wanted: boolean;
    switch (layerRole(layer)) {
      case "circuit": {
        const s = states[deviceIdOf(layer)] as LightState | undefined;
        wanted = Boolean(s?.on && s.level > 0);
        break;
      }
      case "sky":
        wanted = lit < 1;
        break;
      case "skyDay":
        wanted = lit > 0;
        break;
      default:
        wanted = lit > 0 && DAY_ORDER.includes(layer);
    }
    (wanted ? needed : rest).push(layer);
  }
  return { needed, rest };
}

async function loadImage(url: string): Promise<ImageBitmap | HTMLImageElement> {
  // `createImageBitmap` keeps the decode off the main thread; a dozen
  // 1920x1080 WebP decodes inline is about a second of jank landing exactly
  // while the client is first looking at the room.
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
  profile: profileName,
  curtain,
  controlsOpen = false,
}: {
  dir: string;
  /** Names the calibration in `plates/profiles`. */
  profile?: string;
  /**
   * The window's two further plate sets, and the shade that drives them.
   *
   * See `Space.plates.curtain`. Absent for the three rooms with no curtain,
   * which take the single-pass path unchanged.
   */
  curtain?: { sheerDir?: string; closedDir: string; deviceId: string };
  /** Controls tab is showing, so the room should say where each circuit is. */
  controlsOpen?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tier, setTier] = useState<PlateTier | null>(null);
  const [hotspots, setHotspots] = useState<HotspotFile | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // Destructured so the effect depends on two strings rather than on an
  // object literal the space file rebuilds on every render.
  const sheerDir = curtain?.sheerDir;
  const closedDir = curtain?.closedDir;
  const curtainId = curtain?.deviceId;

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
      /** The two curtain sets, in shader order: sheer drawn, then shut. */
      let extra: PlateManifest[] = [];
      let hotspotFile: HotspotFile;
      let chosen: PlateTier;
      try {
        // In shader order: the middle state, if there is one, then shut.
        const dirs = closedDir ? [...(sheerDir ? [sheerDir] : []), closedDir] : [];
        const [m, h, ...rest] = await Promise.all([
          fetch(`${dir}/manifest.json`).then((r) => r.json() as Promise<PlateManifest>),
          fetch(`${dir}/hotspots.json`).then((r) => r.json() as Promise<HotspotFile>),
          ...dirs.map((d) =>
            fetch(`${d}/manifest.json`).then((r) => r.json() as Promise<PlateManifest>),
          ),
        ]);
        if (cancelled) return;
        manifest = m;
        hotspotFile = h;
        extra = rest;
        chosen = pickTier(1 + extra.length);
        setTier(chosen);
        setHotspots(h);
      } catch (e) {
        if (!cancelled) setFailed(e instanceof Error ? e.message : "plate set would not load");
        return;
      }

      const layers = layersOf(manifest);
      const plateW = chosen === "hd" ? manifest.width : manifest.sd[0];
      const plateH = chosen === "hd" ? manifest.height : manifest.sd[1];

      /**
       * The curtain sets must describe the same circuits as the first.
       *
       * The layer list and the sampler order come from the open manifest, so
       * a set that renamed or dropped a layer would quietly composite one
       * circuit's plate under another's weight. Better to fall back to the
       * single set and say so than to show a wrong room.
       */
      if (extra.some((e) => layers.some((l) => e.layers[l] === undefined))) {
        console.error(
          `plates: ${sheerDir} / ${closedDir} do not have every layer ${dir} has — ignoring the curtain`,
        );
        extra = [];
      }

      /**
       * Where the glass is, so a covering can travel across it rather than
       * dissolving over it.
       *
       * Null is a working outcome and often the intended one: a venetian
       * blind lowering and tilting is the whole aperture closing at once,
       * not an edge crossing it, so a plate set with no quad crossfades on
       * purpose. Only a quad that is *present and unusable* is worth
       * saying anything about.
       */
      const glass = extra.length
        ? curtainWindow(hotspotFile.curtain, { width: plateW, height: plateH })
        : null;
      if (extra.length && hotspotFile.curtain && !glass) {
        console.warn(
          `plates: ${dir}/hotspots.json has a curtain quad that will not resolve — the covering will crossfade rather than travel`,
        );
      }

      try {
        renderer = new PlateRenderer(
          canvas,
          manifest.gamma,
          [manifest, ...extra].map((m) => layers.map((l) => m.layers[l].scale)),
          toneCurve(),
          glass,
        );
      } catch (e) {
        if (!cancelled) {
          setFailed(e instanceof Error ? e.message : "WebGL2 unavailable");
          useSim.getState().setStageStatic(true);
        }
        return;
      }

      const profile = profileFor(profileName);
      const exposure = Number(param("exposure")) || profile.exposure;
      const clockIdx = layers.map((l) => isClockDriven(l));

      /** Where the store says each layer should be. */
      const target = emptyWeights(layers.length);
      /** What is actually on screen, which lags `target` for clock layers. */
      const shown = emptyWeights(layers.length);
      /** The tween's start value, for the clock layers only. */
      const from = emptyWeights(layers.length);
      /**
       * The clock layers' last *target*, which is what decides a new tween.
       *
       * Restarting whenever any weight moved looked equivalent and was not:
       * a scene fade changes the circuit weights on every tick, so the clock
       * tween was re-based sixty times a second, `p` never grew past a frame
       * and the window crawled from night to day over far longer than the
       * 1.5 s it was supposed to take. Only a change in where the clock
       * layers are *going* starts a tween.
       */
      const lastClockTarget = emptyWeights(layers.length);
      let tweenStart = 0;
      let tweening = false;
      let dirty = true;

      /**
       * Walk the eased layers toward their target.
       *
       * Only the clock-driven ones: circuit levels and colour temperatures
       * are already being tweened by the scene engine over each scene's own
       * `fadeMs`, and easing them a second time here would both slow the
       * Dinner sequence past its three-second budget and make two different
       * parts of the app disagree about how long a fade is.
       *
       * Returns true while there is still movement left to draw.
       */
      const easeClockLayers = (now: number): boolean => {
        if (!tweening) return false;
        const p = Math.min(1, (now - tweenStart) / CLOCK_EASE_MS);
        const e = easeInOut(p);
        for (let i = 0; i < layers.length; i++) {
          if (!clockIdx[i]) continue;
          for (let c = 0; c < 3; c++) {
            const o = i * 3 + c;
            shown[o] = from[o] + (target[o] - from[o]) * e;
          }
        }
        if (p >= 1) tweening = false;
        // True because something moved this frame, including the frame that
        // lands on the target — returning `tweening` there skipped the draw
        // that put the final value on screen.
        return true;
      };

      const schedule = () => {
        if (frame) return;
        frame = requestAnimationFrame((now) => {
          frame = 0;
          if (!renderer) return;
          const moved = easeClockLayers(now);
          if (dirty || moved) {
            dirty = false;
            renderer.draw(shown, exposure, curtainPos);
          }
          if (tweening) schedule();
        });
      };

      /**
       * Where the curtain is, 0 drawn back to 1 shut.
       *
       * Outside `target` because it is not a layer weight — it mixes the two
       * plate sets rather than scaling one of them, so it reaches the GPU as
       * its own uniform and has to be watched for change separately.
       */
      const trackPositions = (): [number, number] => {
        if (!extra.length || !curtainId) return [0, 0];
        const st = useSim.getState().states[curtainId] as ShadeState | undefined;
        const clamp = (v: number) => Math.min(Math.max(v / 100, 0), 1);
        // A one-covering window reports no middle track, so its shade's
        // unused `sheer` never reaches the shader as a position.
        return [extra.length === 2 ? clamp(st?.sheer ?? 0) : 0, clamp(st?.blackout ?? 0)];
      };
      let curtainPos: [number, number] = trackPositions();

      const refresh = () => {
        const { space, states, clockMin, daylightMix } = useSim.getState();
        if (!space) return;
        const weightsMoved = computeWeights(
          target,
          layers,
          space,
          states,
          clockMin,
          profile,
          daylightMix,
        );
        let curtainMoved = false;
        if (extra.length && curtainId) {
          const shade = states[curtainId] as ShadeState | undefined;
          const clamp = (v: number) => Math.min(Math.max(v / 100, 0), 1);
          const next: [number, number] = [
            extra.length === 2 ? clamp(shade?.sheer ?? 0) : 0,
            clamp(shade?.blackout ?? 0),
          ];
          /**
           * Exactly, with no deadband — unlike the layer weights.
           *
           * The weights need one because the simulation never quite sits
           * still: the lux sensor resamples at 10 Hz and the rules nudge
           * levels by fractions, so an exact test redrew a room nobody was
           * touching. A shade position does not do that. It is a tween
           * that stops, and between tweens it is a constant, so an exact
           * test costs nothing and never fires at rest.
           *
           * It also has to be exact. `inOutCubic` decelerates hard, so the
           * frame before a curtain lands is four parts in a million from
           * its target — under any sensible deadband. The last frame, the
           * one that carries the exact 1.0, was therefore being dropped,
           * the shader never saw a fully drawn track, and a closed
           * blackout kept a seam of night sky down the middle of it.
           */
          if (next[0] !== curtainPos[0] || next[1] !== curtainPos[1]) {
            curtainPos = next;
            curtainMoved = true;
          }
        }
        if (!weightsMoved && !curtainMoved) return;

        // Circuits pass straight through; the clock layers start a tween from
        // wherever they currently are, so a scene that moves the clock slides
        // the window instead of cutting it.
        let clockRetargeted = false;
        for (let i = 0; i < layers.length; i++) {
          for (let c = 0; c < 3; c++) {
            const o = i * 3 + c;
            if (!clockIdx[i]) {
              shown[o] = target[o];
            } else if (Math.abs(lastClockTarget[o] - target[o]) > 1e-6) {
              lastClockTarget[o] = target[o];
              clockRetargeted = true;
            }
          }
        }
        if (clockRetargeted) {
          from.set(shown);
          tweenStart = performance.now();
          tweening = true;
        }
        dirty = true;
        schedule();
      };

      /**
       * Size the drawing buffer to the box, capped at the plate.
       *
       * Rendering more pixels than the plate has cannot add detail, it only
       * magnifies the same texels through a bigger framebuffer.
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

      const { states, clockMin } = useSim.getState();
      const { needed } = loadOrder(layers, states, clockMin);

      refresh();
      // The first frame has nothing to slide from, so land it rather than
      // tween it up from black.
      shown.set(target);
      lastClockTarget.set(target);
      tweening = false;
      unsubscribe = useSim.subscribe(refresh);

      const setDirs = [dir, ...(extra.length ? [...(sheerDir ? [sheerDir] : []), closedDir!] : [])];
      const fetchLayer = async (layer: string, set: number) => {
        try {
          const image = await loadImage(plateUrl(setDirs[set], chosen, layer));
          if (cancelled || !renderer) return;
          renderer.setLayer(layers.indexOf(layer), image, set);
          if ("close" in image) image.close();
          dirty = true;
          schedule();
        } catch (e) {
          // One missing plate is a dark circuit, not a dead room.
          console.error(e);
        }
      };

      /**
       * Which plate sets the opening frame is actually showing.
       *
       * A curtain sits at one end or the other almost always, and the set at
       * the other end contributes nothing until it moves — so with the
       * curtain open the whole closed set is second-wave, and with it shut
       * the whole open set is. Only a scene that opens on sheer needs both
       * before the room can be shown.
       */
      const [sheerNow, blackoutNow] = curtainPos;
      const first: (() => Promise<void>)[] = [];
      const later: (() => Promise<void>)[] = [];
      // The same test `draw` uses to decide which sets contribute, so the
      // first wave is exactly the plates the opening frame will sample.
      const byRole = [
        sheerNow < 1 && blackoutNow < 1,
        sheerNow > 0 && blackoutNow < 1,
        blackoutNow > 0,
      ];
      const roles = extra.length === 2 ? [0, 1, 2] : extra.length === 1 ? [0, 2] : [0];
      const showing = roles.map((r) => byRole[r]);
      for (let set = 0; set < showing.length; set++) {
        for (const layer of layers) {
          const urgent = showing[set] && needed.includes(layer);
          (urgent ? first : later).push(() => fetchLayer(layer, set));
        }
      }
      // Two waves, each in parallel. Over HTTP/2 the expensive part of a
      // small file is the round trip, so awaiting thirteen in a row turns one
      // 300 ms penalty into thirteen.
      await Promise.all(first.map((run) => run()));
      if (cancelled) return;
      setReady(true);
      await Promise.all(later.map((run) => run()));
    })();

    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      unsubscribe?.();
      // Drops the thirteen textures, the program and the context. Without
      // this, leaving and re-entering the room leaks a plate set each time,
      // which on the HD tier is about 130 MB a visit.
      renderer?.dispose();
      useSim.getState().setStageStatic(false);
    };
  }, [dir, profileName, sheerDir, closedDir, curtainId]);

  const space = useSim((s) => s.space);
  const select = useSim((s) => s.select);
  const hoveredDeviceId = useSim((s) => s.hoveredDeviceId);
  const selectionId = useSim((s) => s.selectionId);
  const setSelection = useSim((s) => s.setSelection);
  /**
   * Markers appear with the Controls tab, and not otherwise.
   *
   * An earlier version revealed them whenever the pointer crossed the stage,
   * which meant they turned up in screenshots and in screen-shares the
   * moment anyone moved the mouse — on the one surface in this demo that is
   * meant to look like a photograph. Now they belong to the Controls tab,
   * where someone is already looking at a list of circuit names and wants to
   * know which part of the room each one is. The single exception is a row
   * being hovered: that marker shows wherever you are, because pointing at
   * one control and lighting one spot is unambiguous in a way eight spots
   * are not.
   */
  const showHotspots = controlsOpen;

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ opacity: ready && !failed ? 1 : 0, transition: "opacity 400ms ease-out" }}
      />

      {/* The still, holding the frame until the scene's own layers land. */}
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
        <div className="pointer-events-none absolute inset-0">
          {Object.entries(hotspots.points).map(([pointId, point]) => {
            if (!point.visible) return null;
            // A point of interest resolves to the circuit that lights it,
            // and keeps its own name for the tooltip.
            const alias = space.plates?.hotspotAliases?.[pointId];
            const deviceId = alias?.deviceId ?? pointId;
            const device = space.devices.find((d) => d.id === deviceId);
            if (!device) return null;
            const caption = alias?.label ?? device.name;
            const option = space.selection?.options.find(
              (o) => o.deviceId === deviceId,
            );
            const chosen =
              Boolean(option) &&
              (selectionId ?? space.selection?.defaultDeviceId) === deviceId;
            /**
             * A circuit marker belongs to the Controls tab; a selectable
             * thing is always there.
             *
             * The rule for circuits has not changed — markers over a
             * photograph read as dirt, and they turned up in every
             * screen-share the moment the mouse crossed the room. But a
             * space that declares a selection is a space where picking the
             * subject is the point, and a car you cannot click until you
             * have found the right tab is not clickable. So the six
             * vehicles sit there quietly, and the chosen one wears its name.
             */
            const vehicle = Boolean(option);
            const shown = showHotspots || hoveredDeviceId === deviceId || vehicle;
            return (
              <button
                key={pointId}
                type="button"
                tabIndex={shown ? 0 : -1}
                onClick={() => {
                  select(deviceId);
                  if (option) setSelection(deviceId);
                }}
                aria-pressed={option ? chosen : undefined}
                aria-label={
                  option ? `Select ${option.name}` : `Show ${caption} controls`
                }
                className="group absolute -translate-x-1/2 -translate-y-1/2 p-2.5 transition-opacity duration-200"
                style={{
                  left: `${clampEdge(point.u) * 100}%`,
                  top: `${clampEdge(point.v) * 100}%`,
                  opacity: shown ? 1 : 0,
                  pointerEvents: shown ? "auto" : "none",
                }}
              >
                <span
                  className={`block rounded-full ring-1 ring-black/50 transition group-hover:scale-125 group-hover:bg-brass-300 ${
                    chosen
                      ? "h-2.5 w-2.5 bg-brass-300 ring-2 ring-brass-300/40"
                      : hoveredDeviceId === deviceId
                        ? "h-2 w-2 scale-150 bg-brass-300"
                        : vehicle
                          ? "h-2 w-2 bg-white/45"
                          : "h-2 w-2 bg-brass-400/80"
                  }`}
                />
                <span
                  className={`pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[10px] transition group-hover:opacity-100 group-focus-visible:opacity-100 ${
                    chosen
                      ? "text-brass-300 opacity-100"
                      : "text-shell-100 opacity-0"
                  }`}
                >
                  {option ? option.name : caption}
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
 * `multiply`, and it does not survive this encoding: the plates carry a
 * gamma-5 curve that has to be undone per channel before the layers can be
 * summed, and `globalCompositeOperation` has no exponent. In `ImageData` that
 * is thirteen layers of 518 400 pixels per redraw, some hundreds of
 * milliseconds a frame, which is not a fallback but a slower way to fail.
 *
 * So the honest degradation is the still: the room, correct, not live. The
 * keypad, the app, the scenes, the energy figures and the rules keep working.
 */
function Fallback({ reason }: { reason: string }) {
  useEffect(() => {
    console.warn(`plates: falling back to the still — ${reason}`);
  }, [reason]);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
      <p className="text-xs text-white/70">
        Static view — this device has no WebGL2, so the room cannot change.
        Scenes are disabled; the keypad, schedules and energy figures still run.
      </p>
    </div>
  );
}
