import type { WindowKind } from "@/lib/rights";
import type { Timeline } from "@/lib/timeline";

const BAR: Record<WindowKind, string> = {
  usage: "bg-go",
  whitelisting: "bg-wait",
  exclusivity: "bg-[repeating-linear-gradient(135deg,var(--stop)_0_6px,color-mix(in_oklch,var(--stop)_70%,transparent)_6px_12px)]",
};

const LABEL: Record<WindowKind, string> = {
  usage: "Usage",
  whitelisting: "Whitelisting",
  exclusivity: "Exclusivity",
};

function describe(b: Timeline["rows"][number]["bars"][number]) {
  const w = b.window;
  const kind = w.kind === "usage" && w.scope ? `${LABEL[w.kind]} (${w.scope})` : LABEL[w.kind];
  return `${kind}: ${w.startsAt} → ${w.perpetual ? "forever" : w.endsAt}`;
}

export function RightsTimeline({ timeline }: { timeline: Timeline }) {
  if (timeline.rows.every((r) => r.bars.length === 0)) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="timeline-heading" data-testid="timeline">
      <div className="flex items-baseline justify-between">
        <h2 id="timeline-heading" className="text-xl font-semibold">
          Timeline
        </h2>
        <ul className="flex gap-3 text-xs text-muted-foreground">
          {(Object.keys(LABEL) as WindowKind[]).map((k) => (
            <li key={k} className="flex items-center gap-1">
              <span className={`inline-block h-2 w-3 rounded-sm ${BAR[k]}`} aria-hidden />
              {LABEL[k]}
            </li>
          ))}
        </ul>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div className="relative min-w-[560px] rounded-2xl border bg-card p-3">
          <div className="relative ml-24 h-5 text-[11px] text-muted-foreground">
            {timeline.months.map((m) => (
              <span key={`${m.label}-${m.pct}`} className="absolute -translate-x-1/2" style={{ left: `${m.pct}%` }}>
                {m.label}
              </span>
            ))}
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 right-0 left-24">
              {timeline.months.map((m) => (
                <span key={m.pct} className="absolute inset-y-0 w-px bg-border" style={{ left: `${m.pct}%` }} />
              ))}
              <span
                className="absolute inset-y-[-6px] z-10 w-0.5 bg-ink"
                style={{ left: `${timeline.todayPct}%` }}
                data-testid="today-line"
              >
                <span className="absolute -top-4 -translate-x-1/2 rounded bg-ink px-1 text-[10px] font-semibold text-paper">
                  today
                </span>
              </span>
            </div>
            {timeline.rows.map((row) => (
              <div key={row.deal.id} className="flex min-h-12 items-center border-t first:border-t-0">
                <span className="w-24 shrink-0 truncate pr-2 text-sm font-semibold" title={row.deal.brand}>
                  {row.deal.brand}
                </span>
                <div className="relative flex-1 py-1.5">
                  {row.bars.map((b) => (
                    <div
                      key={b.window.id}
                      className={`relative my-1 h-2.5 rounded-full ${BAR[b.window.kind]} ${b.continues ? "rounded-r-none" : ""}`}
                      style={{ marginLeft: `${b.leftPct}%`, width: `${b.widthPct}%` }}
                      title={describe(b)}
                      aria-label={describe(b)}
                      role="img"
                      data-kind={b.window.kind}
                    >
                      {b.continues && (
                        <span className="absolute top-1/2 -right-2 -translate-y-1/2 text-xs leading-none text-muted-foreground">
                          →
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
