"use client";

import { CircleAlert, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { ContractDto } from "@/lib/contracts";
import type { ExtractedTerms } from "@/lib/review";

import { ReviewForm } from "./review-form";
import { SourcePanel } from "./source-panel";

const POLL_MS = 2500;

export function ReviewView({ initial }: { initial: ContractDto }) {
  const [c, setC] = useState(initial);
  const [quote, setQuote] = useState<string | null>(null);
  const [tab, setTab] = useState<"terms" | "contract">("terms");

  useEffect(() => {
    if (c.status !== "extracting") return;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/contracts/${c.id}`, { cache: "no-store" });
      if (res.ok) setC(await res.json());
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [c]);

  const showQuote = useCallback((q: string) => {
    setQuote(q);
    setTab("contract");
  }, []);

  if (c.status === "extracting") {
    return (
      <section className="mx-auto flex w-full max-w-md items-center gap-3 rounded-3xl border bg-card p-5" aria-live="polite" data-testid="extracting">
        <LoaderCircle className="size-5 animate-spin text-go" aria-hidden />
        <div>
          <p className="font-semibold">Reading your contract…</p>
          <p className="text-sm text-muted-foreground">Usually under a minute. You can leave this page.</p>
        </div>
      </section>
    );
  }

  const error = c.extracted?.error as string | undefined;
  if (c.status === "error" || error) {
    return (
      <section className="mx-auto w-full max-w-md rounded-3xl border border-stop/40 bg-stop-soft p-5" role="alert">
        <p className="flex items-center gap-2 font-semibold text-stop">
          <CircleAlert className="size-5" /> We couldn&apos;t read this contract
        </p>
        <p className="mt-2 text-sm">{error ?? "Something went wrong."}</p>
        <Link href="/rights/new" className="mt-4 inline-block font-semibold underline underline-offset-4">
          Try again
        </Link>
      </section>
    );
  }

  if (c.status === "confirmed") {
    return (
      <section className="mx-auto w-full max-w-md rounded-3xl border border-go/40 bg-go-soft p-5">
        <p className="font-semibold">This contract is already in your wallet.</p>
        <Link href="/rights" className="mt-3 inline-block font-semibold underline underline-offset-4">
          Go to wallet
        </Link>
      </section>
    );
  }

  const terms = c.extracted?.terms as ExtractedTerms;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1 md:hidden" role="tablist">
        {(["terms", "contract"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`h-10 rounded-xl text-sm font-semibold capitalize ${tab === t ? "bg-card shadow-sm" : "text-muted-foreground"}`}
          >
            {t === "terms" ? "Terms" : "Contract"}
          </button>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className={tab === "terms" ? "" : "hidden md:block"}>
          <ReviewForm contractId={c.id} terms={terms} onQuote={showQuote} />
        </div>
        <div className={`md:sticky md:top-4 md:self-start ${tab === "contract" ? "" : "hidden md:block"}`}>
          <SourcePanel text={c.rawText} fileUrl={c.fileUrl} quote={quote} />
          <button
            type="button"
            onClick={() => setTab("terms")}
            className="mt-3 w-full rounded-2xl border py-3 text-sm font-semibold md:hidden"
          >
            Back to terms
          </button>
        </div>
      </div>
    </div>
  );
}
