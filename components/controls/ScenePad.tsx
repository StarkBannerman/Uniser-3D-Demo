"use client";

/**
 * The scene pad — the control the salesperson's thumb lives on.
 *
 * Scene buttons are large, always visible, and never scroll out of reach,
 * because the demo is driven from here and everything else is elaboration. The
 * active scene clears itself the instant anything is adjusted by hand (see
 * `patch` in the store): a highlighted scene has to mean "the room is in this
 * state", or it means nothing.
 */

import { useSim } from "@/lib/sim/store";

export function ScenePad() {
  const space = useSim((s) => s.space);
  const activeSceneId = useSim((s) => s.activeSceneId);
  const applyScene = useSim((s) => s.applyScene);

  if (!space) return null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {space.scenes.map((scene) => {
        const active = scene.id === activeSceneId;
        return (
          <button
            key={scene.id}
            type="button"
            onClick={() => applyScene(scene.id)}
            title={scene.blurb}
            className={`group flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-all duration-150 ${
              active
                ? "border-brass-500 bg-brass-500/12 shadow-[0_0_0_1px_rgba(224,163,63,0.3)]"
                : "border-shell-800 bg-shell-900/70 hover:border-shell-600 hover:bg-shell-850"
            }`}
          >
            <span className="text-lg leading-none">{scene.icon}</span>
            <span
              className={`text-[13px] font-medium leading-tight ${
                active ? "text-brass-300" : "text-shell-100"
              }`}
            >
              {scene.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The blurb for whatever scene is running, so the salesperson has a line to say
 * without memorising the deck.
 */
export function SceneCue() {
  const space = useSim((s) => s.space);
  const activeSceneId = useSim((s) => s.activeSceneId);
  const scene = space?.scenes.find((s) => s.id === activeSceneId);

  return (
    <p className="min-h-[2.5rem] text-[13px] leading-snug text-shell-400">
      {scene ? (
        scene.blurb
      ) : (
        <span className="text-shell-500">
          Adjusted by hand — the room no longer matches a scene.
        </span>
      )}
    </p>
  );
}
