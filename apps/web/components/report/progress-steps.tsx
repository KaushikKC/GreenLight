import { Check, CircleDashed, LoaderCircle, X } from "lucide-react";

import type { ProgressStep } from "@/lib/report-types";

const ICON = {
  pending: <CircleDashed className="size-4 text-muted-foreground" aria-hidden />,
  running: <LoaderCircle className="size-4 animate-spin text-go" aria-hidden />,
  done: <Check className="size-4 text-go" strokeWidth={3} aria-hidden />,
  error: <X className="size-4 text-stop" strokeWidth={3} aria-hidden />,
};

export function ProgressSteps({ steps }: { steps: ProgressStep[] | undefined }) {
  const done = steps?.filter((s) => s.status === "done" || s.status === "error").length ?? 0;
  const total = steps?.length ?? 0;
  return (
    <section
      className="pop rounded-[2rem] bg-card p-5"
      style={{ "--pop": "var(--lime)" } as React.CSSProperties}
      data-testid="progress"
      aria-live="polite"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-extrabold">Checking your draft ✨</h2>
        {total > 0 && (
          <span className="font-mono text-xs text-muted-foreground">
            {done}/{total}
          </span>
        )}
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full border-2 border-ink bg-muted">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--lime),var(--sky),var(--violet))] transition-[width] duration-500"
          style={{ width: total ? `${(done / total) * 100}%` : "8%" }}
        />
      </div>
      <ol className="mt-4 flex flex-col gap-2.5 text-sm">
        {(steps ?? []).map((s) => (
          <li
            key={s.step}
            className={`flex items-center gap-3 ${s.status === "pending" ? "text-muted-foreground" : ""}`}
          >
            {ICON[s.status]}
            <span className={s.status === "running" ? "font-medium" : ""}>{s.label}</span>
            {s.status === "error" && (
              <span className="text-xs text-muted-foreground">skipped, the report will say so</span>
            )}
          </li>
        ))}
        {!steps && <li className="text-muted-foreground">Waiting for a free worker…</li>}
      </ol>
    </section>
  );
}
