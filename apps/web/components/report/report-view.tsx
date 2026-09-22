"use client";

import { CircleAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { PreflightDto } from "@/lib/preflight";
import { isIssue, timelineMarkers } from "@/lib/report";

import { Checklist } from "./checklist";
import { FixList } from "./fix-list";
import { ProgressSteps } from "./progress-steps";
import { RecheckDiff } from "./recheck-diff";
import { ReportActions } from "./report-actions";
import { ScoreDial } from "./score-dial";
import { VideoPlayer } from "./video-player";

const POLL_MS = 2000;

/**
 * The creator's report. With `readOnly`, renders the shared (public) view:
 * no polling, no share/re-check actions.
 */
export function ReportView({ initial, readOnly = false }: { initial: PreflightDto; readOnly?: boolean }) {
  const [data, setData] = useState(initial);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const running = data.status === "queued" || data.status === "running";

  useEffect(() => {
    if (readOnly || !running) return;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/preflight/${data.id}`, { cache: "no-store" });
      if (res.ok) setData(await res.json());
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [data, readOnly, running]);

  const seek = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    v.pause();
    v.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const report = data.report;

  if (running) return <ProgressSteps steps={report?.progress} />;

  if (data.status === "error" || !report?.checks || data.score === null || !data.verdict) {
    return (
      <section className="rounded-3xl border border-stop/40 bg-stop-soft p-5" role="alert">
        <div className="flex items-center gap-2 font-semibold text-stop">
          <CircleAlert className="size-5" /> We couldn&apos;t check this video
        </div>
        <p className="mt-2 text-sm">{report?.error ?? "Something went wrong during analysis."}</p>
        {!readOnly && (
          <Link href="/preflight/new" className="mt-4 inline-block font-semibold underline underline-offset-4">
            Upload again
          </Link>
        )}
      </section>
    );
  }

  const checks = report.checks;
  const meta = report.meta!;
  const markers = timelineMarkers(checks, meta.duration_s);
  const issues = checks.filter(isIssue).length;

  return (
    <div className="flex flex-col gap-5">
      <ScoreDial score={data.score} verdict={data.verdict} breakdown={report.score_breakdown} issues={issues} />

      {data.parent && (
        <RecheckDiff
          previous={data.parent.checks}
          current={checks}
          previousScore={data.parent.score}
          score={data.score}
        />
      )}

      {meta.ai_review_error && (
        <p className="flex items-start gap-2 rounded-2xl bg-muted px-4 py-3 text-sm">
          <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            AI review wasn&apos;t available for this report
            {readOnly ? "." : ` (${meta.ai_review_error.replace(/\.$/, "")}).`} Hook, brief and
            claims checks are marked &ldquo;couldn&apos;t check&rdquo;.
          </span>
        </p>
      )}

      {data.videoUrl && (
        <VideoPlayer
          src={data.videoUrl}
          width={meta.width}
          height={meta.height}
          durationS={meta.duration_s}
          markers={markers}
          frames={data.frames}
          regions={data.safeZones.regions}
          minOverlap={data.safeZones.minOverlap}
          videoRef={videoRef}
        />
      )}

      <FixList items={report.fix_list ?? []} onSeek={data.videoUrl ? seek : undefined} />
      <Checklist checks={checks} onSeek={data.videoUrl ? seek : undefined} />

      {!readOnly && <ReportActions id={data.id} />}
    </div>
  );
}
