"use client";

import { Smartphone } from "lucide-react";
import { type RefObject, useEffect, useMemo, useState } from "react";

import { formatTime, inUnsafeZone, type Marker, nearestFrame } from "@/lib/report";
import type { Region, ReportFrame } from "@/lib/report-types";

// OCR boxes come from sampled frames; only show them when one is this close.
const FRAME_MATCH_S = 0.75;

const REGION_LABELS: Record<string, string> = {
  top_bar: "Top bar",
  right_action_rail: "Buttons",
  bottom_caption_area: "Caption",
};

type Props = {
  src: string;
  width: number;
  height: number;
  durationS: number;
  markers: Marker[];
  frames: ReportFrame[];
  regions: Region[];
  minOverlap: number;
  videoRef: RefObject<HTMLVideoElement | null>;
};

export function VideoPlayer({
  src,
  width,
  height,
  durationS,
  markers,
  frames,
  regions,
  minOverlap,
  videoRef,
}: Props) {
  const [time, setTime] = useState(0);
  const [overlay, setOverlay] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setTime(v.currentTime);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeked", onTime);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeked", onTime);
    };
  }, [videoRef]);

  const boxes = useMemo(() => {
    if (!overlay || frames.length === 0) return [];
    const f = nearestFrame(frames, time);
    if (Math.abs(f.t - time) > FRAME_MATCH_S) return [];
    return f.ocr.map((o) => ({ ...o, unsafe: inUnsafeZone(o.box, regions, minOverlap) }));
  }, [overlay, frames, time, regions, minOverlap]);

  function seek(t: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    v.pause();
    setTime(t);
  }

  const pct = durationS > 0 ? Math.min(100, (time / durationS) * 100) : 0;

  return (
    <section className="flex flex-col gap-3" aria-label="Video">
      <div
        className="relative mx-auto max-h-[70vh] w-full overflow-hidden rounded-3xl bg-black"
        style={{ aspectRatio: `${width} / ${height}`, maxWidth: `calc(70vh * ${width} / ${height})` }}
      >
        <video
          ref={videoRef}
          src={src}
          controls
          playsInline
          preload="metadata"
          className="size-full object-fill"
          data-testid="video"
        />
        {overlay && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 size-full"
            data-testid="safe-zone-overlay"
          >
            <defs>
              <pattern id="hatch" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="1" height="2" fill="white" fillOpacity="0.28" />
              </pattern>
            </defs>
            {regions.map((r) => (
              <rect
                key={`${r.platform}-${r.name}`}
                x={r.x * 100}
                y={r.y * 100}
                width={r.w * 100}
                height={r.h * 100}
                fill="url(#hatch)"
                stroke="white"
                strokeOpacity="0.6"
                strokeWidth="0.3"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {boxes.map((b, i) => (
              <rect
                key={i}
                x={b.box[0] * 100}
                y={b.box[1] * 100}
                width={b.box[2] * 100}
                height={b.box[3] * 100}
                fill={b.unsafe ? "rgb(229 72 77 / 0.25)" : "none"}
                stroke={b.unsafe ? "rgb(229 72 77)" : "rgb(198 244 50)"}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                data-unsafe={b.unsafe}
              />
            ))}
          </svg>
        )}
        {overlay && (
          <ul className="pointer-events-none absolute inset-0 text-[10px] font-semibold uppercase tracking-wide text-white">
            {regions
              .filter((r, i, all) => all.findIndex((o) => o.name === r.name) === i)
              .map((r) => (
                <li
                  key={r.name}
                  className="absolute rounded bg-black/55 px-1.5 py-0.5"
                  style={{ left: `${r.x * 100 + 1}%`, top: `${r.y * 100 + 1}%` }}
                >
                  {REGION_LABELS[r.name] ?? r.name}
                </li>
              ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div
          className="relative h-8 flex-1"
          role="group"
          aria-label="Issues on the timeline"
          data-testid="timeline"
        >
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted">
            <div className="h-full rounded-full bg-ink/40" style={{ width: `${pct}%` }} />
          </div>
          {markers.map((m) => (
            <button
              key={`${m.id}-${m.t}`}
              type="button"
              onClick={() => seek(m.t)}
              className={`absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper shadow ${
                m.status === "fail" ? "bg-stop" : "bg-wait"
              } focus-visible:outline-2 focus-visible:outline-ring`}
              style={{ left: `${m.pct}%` }}
              aria-label={`${m.title} at ${formatTime(m.t)}`}
              title={`${formatTime(m.t)} · ${m.title}`}
              data-testid="timeline-marker"
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setOverlay((o) => !o)}
          aria-pressed={overlay}
          className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition ${
            overlay ? "border-ink bg-ink text-paper" : "bg-card"
          }`}
          data-testid="overlay-toggle"
        >
          <Smartphone className="size-4" aria-hidden />
          Safe zones
        </button>
      </div>
      <p className="font-mono text-xs text-muted-foreground" aria-live="off" data-testid="current-time">
        {formatTime(time)} / {formatTime(durationS)}
      </p>
    </section>
  );
}
