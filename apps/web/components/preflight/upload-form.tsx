"use client";

import { useRouter } from "next/navigation";
import { Film, UploadCloud } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { platforms } from "@/lib/preflight-schema";

const PLATFORM_LABELS: Record<(typeof platforms)[number], string> = {
  tiktok: "TikTok",
  reels: "Reels",
  both: "Both",
};

export type RecheckDefaults = {
  parentId: string;
  platform: (typeof platforms)[number];
  briefText: string;
  captionText: string;
  brandName: string;
};

type Props = { maxBytes: number; maxDurationS: number; defaults?: RecheckDefaults };

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; pct: number }
  | { kind: "queuing" }
  | { kind: "error"; message: string };

function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null); // the worker's probe will be the judge
    };
    video.src = url;
  });
}

function putWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
    xhr.send(file);
  });
}

export function UploadForm({ maxBytes, maxDurationS, defaults }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [platform, setPlatform] = useState<(typeof platforms)[number]>(defaults?.platform ?? "tiktok");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const busy = phase.kind === "uploading" || phase.kind === "queuing";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    const form = new FormData(e.currentTarget);

    try {
      if (file.size > maxBytes) {
        throw new Error(`Videos must be under ${Math.round(maxBytes / 1024 / 1024)} MB.`);
      }
      const duration = await readDuration(file);
      if (duration !== null && duration > maxDurationS) {
        throw new Error(`Videos must be under ${Math.round(maxDurationS / 60)} minutes.`);
      }

      setPhase({ kind: "uploading", pct: 0 });
      const presign = await fetch("/api/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });
      const presigned = await presign.json();
      if (!presign.ok) throw new Error(presigned.message ?? "Couldn't start the upload.");

      await putWithProgress(presigned.url, file, (pct) =>
        setPhase({ kind: "uploading", pct }),
      );

      setPhase({ kind: "queuing" });
      const res = await fetch("/api/preflight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: presigned.key,
          filename: file.name,
          platform,
          briefText: form.get("brief"),
          captionText: form.get("caption"),
          brandName: form.get("brand"),
          parentId: defaults?.parentId,
        }),
      });
      const created = await res.json();
      if (!res.ok) throw new Error(created.message ?? "Couldn't start the check.");
      router.push(`/preflight/${created.id}`);
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <label
        htmlFor="video"
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-3xl border-2 border-dashed px-4 py-8 text-center transition ${
          file ? "border-go bg-go-soft/50" : "bg-card hover:border-ink/40"
        }`}
      >
        {file ? <Film className="size-8 text-go" aria-hidden /> : <UploadCloud className="size-8" aria-hidden />}
        <span className="font-semibold">{file ? file.name : "Choose your draft video"}</span>
        <span className="text-xs text-muted-foreground">
          {file
            ? `${(file.size / 1024 / 1024).toFixed(1)} MB · tap to change`
            : `MP4 or MOV, up to ${Math.round(maxBytes / 1024 / 1024)} MB and ${Math.round(maxDurationS / 60)} minutes`}
        </span>
        <input
          id="video"
          type="file"
          accept="video/mp4,video/quicktime"
          required
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="sr-only"
          aria-label="Draft video"
        />
      </label>

      <fieldset className="flex flex-col gap-2" disabled={busy}>
        <legend className="mb-2 text-sm font-medium">Where will it run?</legend>
        <div className="grid grid-cols-3 gap-2" role="radiogroup">
          {platforms.map((p) => (
            <label
              key={p}
              className="flex h-12 cursor-pointer items-center justify-center rounded-2xl border bg-card text-sm font-semibold has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper"
            >
              <input
                type="radio"
                name="platform"
                value={p}
                checked={platform === p}
                onChange={() => setPlatform(p)}
                className="sr-only"
              />
              {PLATFORM_LABELS[p]}
            </label>
          ))}
        </div>
      </fieldset>

      <details open={Boolean(defaults)} className="rounded-2xl border bg-card p-4 [&_summary]:cursor-pointer">
        <summary className="text-sm font-medium">
          Brief, caption and brand (optional)
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="brand">Brand name</Label>
            <Input id="brand" name="brand" maxLength={100} disabled={busy} defaultValue={defaults?.brandName} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="brief">Brand brief</Label>
            <Textarea
              id="brief"
              name="brief"
              rows={5}
              maxLength={10000}
              placeholder="Paste the talking points and dos & don'ts"
              disabled={busy}
              defaultValue={defaults?.briefText}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="caption">Planned caption</Label>
            <Textarea
              id="caption"
              name="caption"
              rows={3}
              maxLength={2200}
              placeholder="Include #ad or use the paid-partnership label"
              disabled={busy}
              defaultValue={defaults?.captionText}
            />
          </div>
        </div>
      </details>

      {phase.kind === "error" && (
        <p role="alert" className="text-sm text-stop">
          {phase.message}
        </p>
      )}

      <Button type="submit" size="lg" disabled={!file || busy} className="h-14 rounded-2xl text-base font-semibold">
        {phase.kind === "uploading"
          ? `Uploading… ${phase.pct}%`
          : phase.kind === "queuing"
            ? "Starting check…"
            : "Run preflight"}
      </Button>
    </form>
  );
}
