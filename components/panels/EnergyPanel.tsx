"use client";

/**
 * Energy and ROI.
 *
 * Written to survive a facilities manager. Savings are split between what the
 * fixtures do and what the automation does, because they are two separate
 * purchase decisions and a single lump figure invites the obvious pushback —
 * "so I'll just change the bulbs". The assumptions behind the baseline are
 * printed on the panel rather than buried, and the annual extrapolation stays
 * hidden until a full simulated day has actually run.
 */

import { useSim } from "@/lib/sim/store";
import { formatKwh, formatWatts, savings } from "@/lib/sim/energy";
import { SectionLabel, StatTile } from "@/components/ui/Primitives";

function Bar({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: string;
}) {
  const pct = total > 0 ? Math.max(0, (value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[11px]">
        <span className="text-shell-400">{label}</span>
        <span className="font-mono text-shell-200">{formatWatts(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-shell-800">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${Math.min(100, pct)}%`, backgroundColor: tone }}
        />
      </div>
    </div>
  );
}

export function EnergyPanel() {
  const space = useSim((s) => s.space);
  const power = useSim((s) => s.power);
  const totals = useSim((s) => s.totals);

  if (!space) return null;

  const currency = space.currency;
  const result = savings(totals, space.tariffPerKwh);
  const hasRun = totals.hours > 0.05;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label="Drawing now"
          value={formatWatts(power?.totalW ?? 0)}
          hint={`vs ${formatWatts(power?.baselineW ?? 0)} conventional`}
        />
        <StatTile
          label="From grid"
          value={formatWatts(power?.gridW ?? 0)}
          hint={`solar ${formatWatts(power?.solarW ?? 0)}`}
          tone={
            (power?.solarW ?? 0) >= (power?.totalW ?? 0) && (power?.totalW ?? 0) > 0
              ? "good"
              : "neutral"
          }
        />
      </div>

      <div>
        <SectionLabel>Where it is going</SectionLabel>
        <div className="space-y-2 rounded-xl border border-shell-800 bg-shell-900/60 p-3">
          <Bar
            label="Lighting"
            value={power?.lightingW ?? 0}
            total={power?.totalW ?? 1}
            tone="var(--color-brass-500)"
          />
          <Bar
            label="Climate"
            value={power?.climateW ?? 0}
            total={power?.totalW ?? 1}
            tone="#5b8bb8"
          />
          <Bar
            label="Entertainment"
            value={power?.avW ?? 0}
            total={power?.totalW ?? 1}
            tone="#8b6bb8"
          />
          <Bar
            label="Air"
            value={power?.airW ?? 0}
            total={power?.totalW ?? 1}
            tone="var(--color-signal-500)"
          />
        </div>
      </div>

      <div>
        <SectionLabel>
          Measured over {totals.hours.toFixed(1)} simulated hours
        </SectionLabel>

        {!hasRun ? (
          <p className="rounded-xl border border-dashed border-shell-800 p-3 text-[12px] leading-snug text-shell-500">
            Run the clock to accumulate consumption. Set it to{" "}
            <span className="text-shell-300">Day in 60s</span> and a full day of
            savings builds up while you talk.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <StatTile
                label="This space used"
                value={formatKwh(totals.actualKwh)}
              />
              <StatTile
                label="Conventional would"
                value={formatKwh(totals.baselineKwh)}
              />
            </div>

            <div className="rounded-xl border border-shell-800 bg-shell-900/60 p-3">
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-shell-400">
                    Saved by LED fixtures
                  </span>
                  <span className="font-mono text-shell-200">
                    {formatKwh(result.ledKwh)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-shell-400">
                    Saved by automation
                  </span>
                  <span className="font-mono text-shell-200">
                    {formatKwh(result.automationKwh)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-shell-800 pt-1.5">
                  <span className="font-medium text-shell-200">
                    Consumption avoided
                  </span>
                  <span className="font-mono font-medium text-signal-500">
                    {formatKwh(result.consumptionSavedKwh)} ·{" "}
                    {(result.fraction * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-shell-400">
                    Generated on site
                    <span className="ml-1 text-shell-600">
                      ({(result.solarCoverage * 100).toFixed(0)}% of use)
                    </span>
                  </span>
                  <span className="font-mono text-shell-200">
                    {formatKwh(result.solarKwh)}
                  </span>
                </div>
                <div className="mt-1.5 flex justify-between border-t border-shell-800 pt-1.5">
                  <span className="font-medium text-shell-200">
                    Not bought from the grid
                  </span>
                  <span className="font-mono font-medium text-signal-500">
                    {formatKwh(result.totalKwh)} · {currency}
                    {result.costSaved.toFixed(0)}
                  </span>
                </div>
              </div>

              {result.annualKwh !== null && result.annualCostSaved !== null ? (
                <div className="mt-2.5 border-t border-shell-800 pt-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-shell-500">
                    Extrapolated annually
                  </div>
                  <div className="mt-0.5 font-mono text-base text-signal-500">
                    {formatKwh(result.annualKwh)}
                    <span className="ml-2 text-shell-200">
                      {currency}
                      {Math.round(result.annualCostSaved).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-shell-600">
                    At {currency}
                    {space.tariffPerKwh}/kWh. No capital cost is loaded, so this
                    is a savings figure, not a payback period.
                  </div>
                </div>
              ) : (
                <p className="mt-2.5 border-t border-shell-800 pt-2.5 text-[10px] leading-snug text-shell-600">
                  Annual figures appear once a full simulated day has run —
                  extrapolating a partial day would distort them.
                </p>
              )}
            </div>

            {result.automationKwh < 0 && (
              <p className="rounded-lg border border-warn-500/40 bg-warn-500/5 p-2.5 text-[10px] leading-snug text-warn-500">
                Automation savings are negative because the space is running
                outside the conventional baseline&apos;s operating hours — there
                is nothing to beat right now. Run a full day for a fair
                comparison. This is not clamped, deliberately.
              </p>
            )}
          </div>
        )}
      </div>

      <p className="px-1 text-[10px] leading-snug text-shell-600">
        <span className="text-shell-500">Baseline assumptions: </span>
        {space.baseline.note}
      </p>
    </div>
  );
}
