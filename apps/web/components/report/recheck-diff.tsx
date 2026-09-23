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
    <section
      className="pop animate-pop-in rounded-[2rem] bg-[linear-gradient(135deg,var(--lime-soft),var(--sky-soft))] p-5"
      style={{ "--pop": "var(--lime)" } as React.CSSProperties}
      data-testid="recheck-diff"
    >
      <p className="sticker bg-lime">🔁 Re-check</p>
      <p className="mt-2 font-display text-2xl font-extrabold" data-testid="diff-summary">
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
