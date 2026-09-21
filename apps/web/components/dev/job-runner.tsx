"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { JobDto } from "@/lib/jobs";

const POLL_MS = 2000;
const TERMINAL = new Set<JobDto["status"]>(["done", "error"]);

const statusStyles: Record<JobDto["status"], string> = {
  queued: "bg-amber-100 text-amber-900",
  running: "bg-sky-100 text-sky-900",
  done: "bg-emerald-100 text-emerald-900",
  error: "bg-red-100 text-red-900",
};

/** Phase 0 smoke test: enqueue a no-op job and watch the worker pick it up. */
export function JobRunner() {
  const [job, setJob] = useState<JobDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!job || TERMINAL.has(job.status)) return;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
      if (res.ok) setJob((await res.json()).job);
      else setError(`Polling failed (${res.status})`);
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [job]);

  async function createDummyJob() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "noop" }),
      });
      if (!res.ok) throw new Error(`Create failed (${res.status})`);
      setJob((await res.json()).job);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Button onClick={createDummyJob} disabled={creating} size="lg">
        {creating ? "Creating…" : "Create dummy job"}
      </Button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {job && (
        <div className="rounded-lg border p-4 text-sm" data-testid="job-card">
          <div className="flex items-center justify-between gap-2">
            <code className="truncate text-xs text-muted-foreground">
              {job.id}
            </code>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[job.status]}`}
              data-testid="job-status"
            >
              {job.status}
            </span>
          </div>
          {job.error && <p className="mt-2 text-red-600">{job.error}</p>}
        </div>
      )}
    </div>
  );
}
