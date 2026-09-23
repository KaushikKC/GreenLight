"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";

import { findQuote } from "@/lib/review";

/** The contract text with the selected term's source quote highlighted. */
export function SourcePanel({
  text,
  fileUrl,
  quote,
}: {
  text: string | null;
  fileUrl: string | null;
  quote: string | null;
}) {
  const markRef = useRef<HTMLElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const hit = text ? findQuote(text, quote) : null;

  useEffect(() => {
    // Scroll only the contract box, so the page itself doesn't slide around.
    const box = boxRef.current;
    const mark = markRef.current;
    if (!box || !mark) return;
    // The box is position:relative, so offsetTop is measured from its top.
    box.scrollTop = mark.offsetTop - box.clientHeight / 2 + mark.offsetHeight / 2;
  }, [quote]);

  return (
    <section className="flex flex-col gap-3" aria-label="Contract" data-testid="source-panel">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Contract</h2>
        {fileUrl && (
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-4"
          >
            Original <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
      {quote && !hit && (
        <p className="rounded-xl bg-wait-soft px-3 py-2 text-sm" data-testid="quote-not-found">
          We couldn&apos;t find this wording exactly in the text: &ldquo;{quote}&rdquo;
        </p>
      )}
      {text ? (
        <div
          ref={boxRef}
          className="relative max-h-[70vh] overflow-y-auto rounded-2xl border bg-card p-4 font-serif text-[15px] leading-relaxed whitespace-pre-wrap"
        >
          {hit ? (
            <>
              {text.slice(0, hit.start)}
              <mark
                ref={markRef}
                className="rounded bg-highlight px-0.5 text-ink"
                data-testid="quote-highlight"
              >
                {text.slice(hit.start, hit.end)}
              </mark>
              {text.slice(hit.end)}
            </>
          ) : (
            text
          )}
        </div>
      ) : (
        <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
          This is a scanned document, so there&apos;s no text to highlight. Open the original to check
          the quotes.
        </p>
      )}
    </section>
  );
}
