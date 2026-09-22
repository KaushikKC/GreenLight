"use client";

import { ChevronDown } from "lucide-react";

import { GROUP_LABELS } from "@/lib/report";
import type { Report, Verdict } from "@/lib/report-types";

import { VERDICT_STYLES, VerdictChip } from "./status";

const R = 52;
const CIRC = 2 * Math.PI * R;

const HEADLINES: Record<Verdict, string> = {
  ready: "Good to send.",
  fix_first: "Close. Fix a few things first.",
  not_ready: "Not ready to send yet.",
};

export function ScoreDial({
  score,
  verdict,
  breakdown,
  issues,
}: {
  score: number;
  verdict: Verdict;
  breakdown: Report["score_breakdown"];
  issues: number;
}) {
  const filled = (Math.max(0, Math.min(100, score)) / 100) * CIRC;
  return (
    <section className="rounded-3xl bg-ink p-5 text-paper shadow-sm">
      <div className="flex items-center gap-5">
        <svg
          viewBox="0 0 120 120"
          className="size-28 shrink-0 -rotate-90"
          role="img"
          aria-label={`Score ${score} out of 100`}
        >
          <circle cx="60" cy="60" r={R} className="fill-none stroke-paper/15" strokeWidth="10" />
          <circle
            cx="60"
            cy="60"
            r={R}
            className={`fill-none ${VERDICT_STYLES[verdict].ring} transition-[stroke-dasharray] duration-700`}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${CIRC}`}
          />
          <text
            x="60"
            y="60"
            className="rotate-90 fill-paper font-display text-[34px] font-bold"
            style={{ transformOrigin: "60px 60px" }}
            textAnchor="middle"
            dominantBaseline="central"
            data-testid="score"
          >
            {score}
          </text>
        </svg>
        <div className="flex min-w-0 flex-col items-start gap-2">
          <VerdictChip verdict={verdict} />
          <p className="font-display text-xl font-semibold leading-tight">{HEADLINES[verdict]}</p>
          <p className="text-sm text-paper/70">
            {issues === 0 ? "Nothing to fix." : `${issues} thing${issues === 1 ? "" : "s"} to fix.`}
          </p>
        </div>
      </div>

      {breakdown && (
        <details className="group mt-4 border-t border-paper/15 pt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-paper/80">
            Why this score
            <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="mt-3 flex flex-col gap-2 text-sm" data-testid="score-breakdown">
            {breakdown.groups.map((g) => (
              <li key={g.group} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-paper/80">{GROUP_LABELS[g.group]}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper/15">
                  <span
                    className="block h-full rounded-full bg-highlight"
                    style={{ width: `${Math.round(g.score * 100)}%` }}
                  />
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-xs text-paper/70">
                  {Math.round(g.score * g.effective_weight)}/{Math.round(g.effective_weight)}
                </span>
              </li>
            ))}
          </ul>
          {breakdown.caps.length > 0 && (
            <p className="mt-3 rounded-xl bg-stop/20 px-3 py-2 text-xs text-paper">
              Capped at 49 because of a hard fail ({breakdown.caps.join(", ")}). Without it you&apos;d
              score {breakdown.raw_score}.
            </p>
          )}
          {breakdown.uncounted_groups.length > 0 && (
            <p className="mt-2 text-xs text-paper/60">
              Not scored: {breakdown.uncounted_groups.map((g) => GROUP_LABELS[g]).join(", ")}. Their
              weight is shared across the rest.
            </p>
          )}
        </details>
      )}
    </section>
  );
}
