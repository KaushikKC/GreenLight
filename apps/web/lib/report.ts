/** Pure helpers for rendering a preflight report. No React, no I/O. */

import type {
  Box,
  Check,
  CheckStatus,
  Group,
  Region,
  Verdict,
} from "./report-types";

export const GROUP_ORDER: Group[] = [
  "hook",
  "format",
  "readability",
  "message",
  "compliance",
  "audio",
  "technical",
];

export const GROUP_LABELS: Record<Group, string> = {
  hook: "Hook",
  format: "Format",
  readability: "Readability",
  message: "Message",
  compliance: "Compliance",
  audio: "Audio",
  technical: "Technical",
};

export const VERDICT_LABELS: Record<Verdict, string> = {
  ready: "Ready",
  fix_first: "Fix first",
  not_ready: "Not ready",
};

const STATUS_RANK: Record<CheckStatus, number> = {
  fail: 0,
  warn: 1,
  error: 2,
  pass: 3,
  info: 4,
  na: 5,
};

export const isIssue = (c: Pick<Check, "status">) =>
  c.status === "fail" || c.status === "warn";

/** Checks grouped in report order; within a group, problems first. */
export function groupChecks(checks: Check[]) {
  return GROUP_ORDER.map((group) => {
    const items = checks
      .filter((c) => c.group === group)
      .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
    return {
      group,
      label: GROUP_LABELS[group],
      checks: items,
      issues: items.filter(isIssue).length,
      unchecked: items.filter((c) => c.status === "error").length,
    };
  }).filter((g) => g.checks.length > 0);
}

export type Marker = {
  id: string;
  t: number;
  pct: number;
  status: "fail" | "warn";
  title: string;
};

/** Timeline markers for timestamped problems, as % of duration. */
export function timelineMarkers(checks: Check[], durationS: number): Marker[] {
  if (!(durationS > 0)) return [];
  return checks
    .filter(
      (c): c is Check & { status: "fail" | "warn"; timestamp_s: number } =>
        isIssue(c) && typeof c.timestamp_s === "number",
    )
    .map((c) => ({
      id: c.id,
      t: c.timestamp_s,
      pct: Math.min(100, Math.max(0, (c.timestamp_s / durationS) * 100)),
      status: c.status,
      title: c.title,
    }))
    .sort((a, b) => a.t - b.t);
}

export type CheckDiff = {
  fixed: Check[]; // was an issue, now isn't
  remaining: Check[]; // still an issue
  introduced: Check[]; // new issue
};

/** Compare a re-check against the version it replaces. */
export function diffChecks(previous: Check[], current: Check[]): CheckDiff {
  const before = new Map(previous.map((c) => [c.id, c]));
  const diff: CheckDiff = { fixed: [], remaining: [], introduced: [] };
  for (const c of current) {
    const old = before.get(c.id);
    const wasIssue = old ? isIssue(old) : false;
    if (isIssue(c)) (wasIssue ? diff.remaining : diff.introduced).push(c);
    else if (wasIssue && (c.status === "pass" || c.status === "na"))
      diff.fixed.push(c);
  }
  return diff;
}

export function diffSummary(d: CheckDiff): string {
  const parts = [
    `${d.fixed.length} issue${d.fixed.length === 1 ? "" : "s"} fixed`,
    `${d.remaining.length} remaining`,
  ];
  if (d.introduced.length) parts.push(`${d.introduced.length} new`);
  return parts.join(", ");
}

/** Share of the box's area inside the region (0..1). Mirrors the analyzer. */
export function overlapFraction(box: Box, r: Region): number {
  const [x, y, w, h] = box;
  const ix = Math.max(0, Math.min(x + w, r.x + r.w) - Math.max(x, r.x));
  const iy = Math.max(0, Math.min(y + h, r.y + r.h) - Math.max(y, r.y));
  const area = w * h;
  return area > 0 ? (ix * iy) / area : 0;
}

export function inUnsafeZone(
  box: Box,
  regions: Region[],
  minOverlap: number,
): boolean {
  return regions.some((r) => overlapFraction(box, r) >= minOverlap);
}

/** The sampled frame closest to `t` (frames must be non-empty). */
export function nearestFrame<T extends { t: number }>(frames: T[], t: number): T {
  return frames.reduce((best, f) =>
    Math.abs(f.t - t) < Math.abs(best.t - t) ? f : best,
  );
}

export function formatTime(t: number): string {
  if (t < 60) return `${t.toFixed(1)}s`;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
