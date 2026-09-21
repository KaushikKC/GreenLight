"use client";

import { useEffect, useState } from "react";

import type { PreflightDto } from "@/lib/preflight";

const POLL_MS = 2000;
const DONE = new Set(["done", "error"]);

type Step = { step: string; label: string; status: string };

const STEP_ICON: Record<string, string> = {
  pending: "○",
  running: "◌",
  done: "●",
  error: "✕",
};

const VERDICT_LABEL: Record<string, string> = {
  ready: "Ready",
  fix_first: "Fix first",
  not_ready: "Not ready",
};

/** Phase 1 report view: live progress, then score + raw JSON. Phase 3 replaces this. */
export function RawReport({ initial }: { initial: PreflightDto }) {
  const [data, setData] = useState(initial);

  useEffect(() => {
    if (DONE.has(data.status)) return;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/preflight/${data.id}`, { cache: "no-store" });
      if (res.ok) setData(await res.json());
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [data]);

  const report = (data.report ?? {}) as {
    progress?: Step[];
    error?: string;
  };

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-col gap-1.5 text-sm" data-testid="progress">
        {(report.progress ?? []).map((s) => (
          <li
            key={s.step}
            className={
              s.status === "error"
                ? "text-red-600"
                : s.status === "pending"
                  ? "text-muted-foreground"
                  : ""
            }
          >
            <span aria-hidden className="mr-2 inline-block w-3">
              {STEP_ICON[s.status] ?? "○"}
            </span>
            {s.label}
          </li>
        ))}
        {!report.progress && (
          <li className="text-muted-foreground">Waiting for a worker…</li>
        )}
      </ol>

      {data.status === "error" && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {report.error ?? "Analysis failed."}
        </p>
      )}

      {data.status === "done" && (
        <div className="flex items-baseline gap-3" data-testid="score">
          <span className="text-5xl font-semibold tabular-nums">{data.score}</span>
          <span className="rounded-full border px-3 py-1 text-sm">
            {VERDICT_LABEL[data.verdict ?? ""] ?? data.verdict}
          </span>
        </div>
      )}

      {data.frames.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
          {data.frames.map((f) => (
            <figure key={f.t} className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URLs */}
              <img src={f.url} alt={`Frame at ${f.t}s`} className="h-32 rounded border" />
              <figcaption className="text-center text-xs text-muted-foreground">
                {f.t.toFixed(1)}s
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <details open={data.status === "done"}>
        <summary className="cursor-pointer text-sm font-medium">Raw report JSON</summary>
        <pre className="mt-2 max-h-[70vh] overflow-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(data.report, null, 2)}
        </pre>
      </details>
    </div>
  );
}
