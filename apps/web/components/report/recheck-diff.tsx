import { ArrowRight, Check, Plus, TriangleAlert } from "lucide-react";

import { diffChecks, diffSummary } from "@/lib/report";
import type { Check as CheckT } from "@/lib/report-types";

export function RecheckDiff({
  previous,
  current,
  previousScore,
  score,
}: {
  previous: CheckT[];
  current: CheckT[];
  previousScore: number | null;
  score: number;
}) {
  const d = diffChecks(previous, current);
  return (
    <section className="rounded-3xl border-2 border-go bg-go-soft/60 p-5" data-testid="recheck-diff">
      <p className="text-xs font-semibold uppercase tracking-wide text-go">Re-check</p>
      <p className="mt-1 font-display text-xl font-semibold" data-testid="diff-summary">
        {diffSummary(d)}
      </p>
      {previousScore !== null && (
        <p className="mt-1 flex items-center gap-2 font-mono text-sm">
          {previousScore} <ArrowRight className="size-3.5" aria-hidden /> {score}
        </p>
      )}
      <ul className="mt-3 flex flex-col gap-1.5 text-sm">
        {d.fixed.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <Check className="size-4 shrink-0 text-go" strokeWidth={3} aria-hidden /> {c.title}
          </li>
        ))}
        {d.remaining.map((c) => (
          <li key={c.id} className="flex items-center gap-2 text-muted-foreground">
            <TriangleAlert className="size-4 shrink-0 text-wait" aria-hidden /> Still: {c.title}
          </li>
        ))}
        {d.introduced.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <Plus className="size-4 shrink-0 text-stop" strokeWidth={3} aria-hidden /> New: {c.title}
          </li>
        ))}
      </ul>
    </section>
  );
}
