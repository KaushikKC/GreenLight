import { Check, CircleAlert, Info, Minus, TriangleAlert, X } from "lucide-react";

import type { CheckStatus, Verdict } from "@/lib/report-types";
import { VERDICT_LABELS } from "@/lib/report";

export const STATUS_STYLES: Record<CheckStatus, { chip: string; label: string }> = {
  pass: { chip: "bg-go-soft text-go", label: "Pass" },
  warn: { chip: "bg-wait-soft text-wait", label: "Warning" },
  fail: { chip: "bg-stop-soft text-stop", label: "Fail" },
  error: { chip: "bg-muted text-muted-foreground", label: "Couldn't check" },
  na: { chip: "bg-muted text-muted-foreground", label: "Not applicable" },
  info: { chip: "bg-muted text-muted-foreground", label: "Info" },
};

const ICONS = {
  pass: Check,
  warn: TriangleAlert,
  fail: X,
  error: CircleAlert,
  na: Minus,
  info: Info,
} as const;

export function StatusIcon({ status }: { status: CheckStatus }) {
  const Icon = ICONS[status];
  return (
    <span
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full ${STATUS_STYLES[status].chip}`}
      title={STATUS_STYLES[status].label}
    >
      <Icon className="size-4" strokeWidth={2.5} aria-hidden />
      <span className="sr-only">{STATUS_STYLES[status].label}</span>
    </span>
  );
}

export function EstimateBadge() {
  return (
    <span
      className="rounded-full border border-dashed px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
      title="Heuristic check: treat as a best guess"
    >
      estimate
    </span>
  );
}

export const VERDICT_STYLES: Record<Verdict, { chip: string; ring: string }> = {
  ready: { chip: "bg-go text-paper", ring: "stroke-go" },
  fix_first: { chip: "bg-wait text-on-color", ring: "stroke-wait" },
  not_ready: { chip: "bg-stop text-paper", ring: "stroke-stop" },
};

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${VERDICT_STYLES[verdict].chip}`}
      data-testid="verdict"
    >
      {VERDICT_LABELS[verdict]}
    </span>
  );
}
