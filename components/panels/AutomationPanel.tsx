"use client";

/**
 * Automation rules and the activity feed.
 *
 * Every rule has a switch, and that is the feature. The strongest moment in a
 * lighting-automation pitch is turning daylight harvesting *off*, watching the
 * perimeter fixtures climb back to full output against a bright window, and
 * turning it back on. A demo that only ever shows the good state proves
 * nothing — so the off state is one tap away and labelled.
 */

import { useSim } from "@/lib/sim/store";
import { formatClock } from "@/lib/sim/clock";
import { SectionLabel, Toggle } from "@/components/ui/Primitives";

const KIND_LABEL: Record<string, string> = {
  occupancy: "Presence",
  daylight: "Daylight",
  circadian: "Circadian",
  schedule: "Schedule",
};

export function AutomationPanel() {
  const space = useSim((s) => s.space);
  const ruleEnabled = useSim((s) => s.ruleEnabled);
  const toggleRule = useSim((s) => s.toggleRule);
  const events = useSim((s) => s.events);

  if (!space) return null;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {space.rules.map((rule) => {
          const enabled = Boolean(ruleEnabled[rule.id]);
          return (
            <div
              key={rule.id}
              className={`rounded-xl border p-3 transition-colors ${
                enabled
                  ? "border-shell-800 bg-shell-900/60"
                  : "border-shell-800/60 bg-shell-950/40"
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-shell-800 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-shell-400">
                      {KIND_LABEL[rule.kind] ?? rule.kind}
                    </span>
                    <span
                      className={`truncate text-sm font-medium ${
                        enabled ? "text-shell-100" : "text-shell-500"
                      }`}
                    >
                      {rule.name}
                    </span>
                  </div>
                </div>
                <Toggle
                  on={enabled}
                  label={`${rule.name} enabled`}
                  onChange={() => toggleRule(rule.id)}
                />
              </div>
              <p
                className={`mt-1.5 text-[11px] leading-snug ${
                  enabled ? "text-shell-400" : "text-shell-600"
                }`}
              >
                {rule.explain}
              </p>
            </div>
          );
        })}
      </div>

      <div>
        <SectionLabel>Activity</SectionLabel>
        {events.length === 0 ? (
          <p className="rounded-xl border border-dashed border-shell-800 p-3 text-[12px] leading-snug text-shell-500">
            Nothing has fired yet. Set occupancy to Vacant, or run the clock
            through dusk, and the system&apos;s decisions appear here.
          </p>
        ) : (
          <ul className="space-y-1">
            {events.map((event, i) => (
              <li
                key={`${event.ruleId}-${event.atMin}-${i}`}
                className="flex gap-2 rounded-lg border border-shell-800 bg-shell-900/40 px-2.5 py-1.5"
              >
                <span className="shrink-0 font-mono text-[10px] text-shell-500">
                  {formatClock(event.atMin)}
                </span>
                <span className="min-w-0 flex-1 text-[11px] leading-snug text-shell-300">
                  <span className="text-shell-500">{event.ruleName}: </span>
                  {event.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
