"use client";

import { ChevronDown } from "lucide-react";
import type { CSSProperties } from "react";

import { GROUP_LABELS } from "@/lib/report";
import type { Report, Verdict } from "@/lib/report-types";

import { Confetti } from "./confetti";
import { VERDICT_STYLES, VerdictChip } from "./status";

const R = 52;
const CIRC = 2 * Math.PI * R;

const HEADLINES: Record<Verdict, string> = {
  ready: "Good to send. Go get that approval!",
  fix_first: "Close! Fix a few things first.",
  not_ready: "Not ready yet, but fixable.",
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
  const style = VERDICT_STYLES[verdict];
  return (
    <section
      className={`pop animate-pop-in relative rounded-[2rem] p-5 text-on-color ${style.card}`}
      style={{ "--pop": "var(--ink)" } as CSSProperties}
    >
      {verdict === "ready" && <Confetti />}
      <div className="flex items-center gap-5">
        <div className="relative shrink-0 rounded-full bg-white/70 p-1.5">
          <svg viewBox="0 0 120 120" className="size-28 -rotate-90" role="img" aria-label={`Score ${score} out of 100`}>
            <circle cx="60" cy="60" r={R} className="fill-none stroke-[color-mix(in_oklch,var(--on-color)_15%,transparent)]" strokeWidth="11" />
            <circle
              cx="60"
              cy="60"
              r={R}
              className={`fill-none ${style.ring} transition-[stroke-dasharray] duration-700`}
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${CIRC}`}
            />
            <text
              x="60"
              y="60"
              className="rotate-90 fill-[var(--on-color)] font-display text-[36px] font-extrabold"
              style={{ transformOrigin: "60px 60px" }}
              textAnchor="middle"
              dominantBaseline="central"
              data-testid="score"
            >
              {score}
            </text>
          </svg>
        </div>
        <div className="flex min-w-0 flex-col items-start gap-2">
          <VerdictChip verdict={verdict} />
          <p className="font-display text-xl leading-tight font-extrabold">{HEADLINES[verdict]}</p>
          <p className="text-sm font-medium opacity-80">
            {issues === 0 ? "Nothing to fix 🎉" : `${issues} thing${issues === 1 ? "" : "s"} to fix.`}
          </p>
        </div>
      </div>

      {breakdown && (
        <details className="group mt-4 border-t-2 border-[color-mix(in_oklch,var(--on-color)_20%,transparent)] pt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold">
            Why this score
            <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="mt-3 flex flex-col gap-2 text-sm" data-testid="score-breakdown">
            {breakdown.groups.map((g) => (
              <li key={g.group} className="flex items-center gap-3">
                <span className="w-24 shrink-0 font-medium">{GROUP_LABELS[g.group]}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/50">
                  <span
                    className="block h-full rounded-full bg-[var(--on-color)]"
                    style={{ width: `${Math.round(g.score * 100)}%` }}
                  />
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-xs">
                  {Math.round(g.score * g.effective_weight)}/{Math.round(g.effective_weight)}
                </span>
              </li>
            ))}
          </ul>
          {breakdown.caps.length > 0 && (
            <p className="mt-3 rounded-xl bg-white/60 px-3 py-2 text-xs font-medium">
              Capped at 49 because of a hard fail ({breakdown.caps.join(", ")}). Without it you&apos;d
              score {breakdown.raw_score}.
            </p>
          )}
          {breakdown.uncounted_groups.length > 0 && (
            <p className="mt-2 text-xs opacity-75">
              Not scored: {breakdown.uncounted_groups.map((g) => GROUP_LABELS[g]).join(", ")}. Their
              weight is shared across the rest.
            </p>
          )}
        </details>
      )}
    </section>
  );
}
