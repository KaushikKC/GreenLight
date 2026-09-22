"use client";

import { Check, Link2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export function ReportActions({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "copied" | "error">("idle");

  async function share() {
    setState("busy");
    try {
      const res = await fetch(`/api/preflight/${id}/share`, { method: "POST" });
      if (!res.ok) throw new Error();
      const { url } = (await res.json()) as { url: string };
      setUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setState("copied");
      } catch {
        setState("idle"); // clipboard blocked: the link is shown to copy by hand
      }
    } catch {
      setState("error");
    }
  }

  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
      {url && (
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="mb-2 w-full rounded-xl border bg-card px-3 py-2 font-mono text-xs"
          aria-label="Share link"
          data-testid="share-url"
        />
      )}
      {state === "error" && <p className="mb-2 text-sm text-stop">Couldn&apos;t create a link. Try again.</p>}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={share}
          disabled={state === "busy"}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border bg-card font-semibold"
          data-testid="share"
        >
          {state === "copied" ? <Check className="size-4 text-go" /> : <Link2 className="size-4" />}
          {state === "copied" ? "Link copied" : "Share report"}
        </button>
        <Link
          href={`/preflight/new?parent=${id}`}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-ink font-semibold text-paper"
          data-testid="recheck"
        >
          <RotateCcw className="size-4" />
          Re-check v2
        </Link>
      </div>
    </div>
  );
}
