"use client";

import { Check, Clock, Copy } from "lucide-react";
import { useState } from "react";

import { formatTime } from "@/lib/report";
import type { FixItem } from "@/lib/report-types";

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function FixList({ items, onSeek }: { items: FixItem[]; onSeek?: (t: number) => void }) {
  const [copied, setCopied] = useState<number | "all" | null>(null);
  if (items.length === 0) return null;

  async function copyItem(key: number | "all", text: string) {
    if (await copy(text)) {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    }
  }

  const all = items
    .map((i) => `${i.n}. ${i.fix}${i.timestamp_s !== null ? ` (at ${formatTime(i.timestamp_s)})` : ""}`)
    .join("\n");

  return (
    <section
      className="pop rounded-[2rem] bg-card p-5"
      style={{ "--pop": "var(--tangerine)" } as React.CSSProperties}
      aria-labelledby="fix-heading"
      data-testid="fix-list"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="fix-heading" className="text-2xl font-extrabold">
          Fix list 🛠️
        </h2>
        <button
          type="button"
          onClick={() => copyItem("all", all)}
          className="pop-sm pop-press inline-flex items-center gap-1.5 rounded-full bg-sun px-3 py-1.5 text-sm font-bold text-on-color"
        >
          {copied === "all" ? <Check className="size-4 text-go" /> : <Copy className="size-4" />}
          {copied === "all" ? "Copied" : "Copy all"}
        </button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Most impactful first.</p>
      <ol className="mt-4 flex flex-col gap-3">
        {items.map((i) => (
          <li key={i.n} className="flex items-start gap-3" data-testid="fix-item">
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-ink font-display text-sm font-extrabold text-on-color ${
                i.status === "fail" ? "bg-pink" : "bg-sun"
              }`}
            >
              {i.n}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <p className="text-[15px] leading-snug">{i.fix}</p>
              {i.timestamp_s !== null && onSeek && (
                <button
                  type="button"
                  onClick={() => onSeek(i.timestamp_s!)}
                  className="inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-mono text-xs"
                >
                  <Clock className="size-3" aria-hidden />
                  {formatTime(i.timestamp_s)}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => copyItem(i.n, i.fix)}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
              aria-label={`Copy fix ${i.n}`}
            >
              {copied === i.n ? <Check className="size-4 text-go" /> : <Copy className="size-4" />}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
