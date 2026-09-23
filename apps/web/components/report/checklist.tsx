import { ChevronDown, Clock } from "lucide-react";

import { formatTime, groupChecks } from "@/lib/report";
import type { Check } from "@/lib/report-types";

import { EstimateBadge, StatusIcon } from "./status";

const GROUP_COLORS = ["var(--lime)", "var(--sky)", "var(--violet)", "var(--pink)", "var(--sun)", "var(--tangerine)", "var(--lime)"];

function quoteOf(evidence: Check["evidence"]): string | null {
  for (const key of ["quote", "text", "opening_line"] as const) {
    const v = evidence[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

function FrameEvidence({ url, box }: { url: string; box?: number[] }) {
  return (
    <div className="relative w-20 shrink-0 overflow-hidden rounded-lg border bg-black" style={{ aspectRatio: "9 / 16" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URLs */}
      <img src={url} alt="Frame this check refers to" className="size-full object-cover" loading="lazy" />
      {box && box.length === 4 && (
        <span
          className="absolute rounded-sm border-2 border-stop"
          style={{
            left: `${box[0] * 100}%`,
            top: `${box[1] * 100}%`,
            width: `${box[2] * 100}%`,
            height: `${box[3] * 100}%`,
          }}
        />
      )}
    </div>
  );
}

function CheckRow({ check, onSeek }: { check: Check; onSeek?: (t: number) => void }) {
  const quote = quoteOf(check.evidence);
  const frameUrl = typeof check.evidence.frame_url === "string" ? check.evidence.frame_url : null;
  return (
    <li className="flex gap-3 py-4" data-testid="check" data-check-id={check.id} data-status={check.status}>
      <StatusIcon status={check.status} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-sans text-[15px] font-semibold leading-snug">{check.title}</h4>
          {check.estimate && <EstimateBadge />}
        </div>
        <div className="flex gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-sm leading-relaxed text-muted-foreground">{check.explanation}</p>
            {quote && check.status !== "pass" && !check.explanation.includes(quote) && (
              <blockquote className="border-l-2 border-border pl-3 text-sm italic">“{quote}”</blockquote>
            )}
          </div>
          {frameUrl && <FrameEvidence url={frameUrl} box={check.evidence.box} />}
        </div>
        {check.fix && (check.status === "fail" || check.status === "warn") && (
          <p className="rounded-2xl border-2 border-dashed border-lime bg-lime-soft px-3 py-2 text-sm">
            <span className="font-semibold">Fix: </span>
            {check.fix}
          </p>
        )}
        {typeof check.timestamp_s === "number" && onSeek && (
          <button
            type="button"
            onClick={() => onSeek(check.timestamp_s!)}
            className="inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-mono text-xs hover:bg-secondary"
            data-testid="seek"
          >
            <Clock className="size-3" aria-hidden />
            {formatTime(check.timestamp_s)}
          </button>
        )}
      </div>
    </li>
  );
}

export function Checklist({ checks, onSeek }: { checks: Check[]; onSeek?: (t: number) => void }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="checklist-heading">
      <h2 id="checklist-heading" className="text-2xl font-extrabold">
        Full checklist
      </h2>
      {groupChecks(checks).map((g, i) => (
        <details
          key={g.group}
          open={g.issues > 0}
          className="pop-sm group rounded-3xl bg-card px-4"
          style={{ "--pop": GROUP_COLORS[i % GROUP_COLORS.length] } as React.CSSProperties}
          data-testid="check-group"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between py-4">
            <span className="flex items-center gap-2 font-display text-lg font-bold">
              <span
                className="size-3 rounded-full border-2 border-ink"
                style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }}
                aria-hidden
              />
              {g.label}
            </span>
            <span className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  g.issues
                    ? "bg-stop-soft text-stop"
                    : g.unchecked
                      ? "bg-muted text-muted-foreground"
                      : "bg-go-soft text-go"
                }`}
              >
                {g.issues
                  ? `${g.issues} to fix`
                  : g.unchecked
                    ? `${g.unchecked} not checked`
                    : "All good"}
              </span>
              <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
            </span>
          </summary>
          <ul className="divide-y border-t">
            {g.checks.map((c) => (
              <CheckRow key={c.id} check={c} onSeek={onSeek} />
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}
