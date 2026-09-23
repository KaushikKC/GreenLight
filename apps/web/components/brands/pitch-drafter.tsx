"use client";

import { Check, Copy, LoaderCircle, Mail, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PitchDto } from "@/lib/brands-server";
import { formatDate } from "@/lib/rights";

const ASKS = [
  ["gifting", "Gifting"],
  ["paid", "Paid post"],
  ["affiliate", "Affiliate"],
] as const;
const POLL_MS = 2000;
const MAX_WORDS = 150;

export function PitchDrafter({ brand }: { brand: string }) {
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState<(typeof ASKS)[number][0]>("gifting");
  const [note, setNote] = useState("");
  const [pitch, setPitch] = useState<PitchDto | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const drafting = pitch !== null && (pitch.status === "queued" || pitch.status === "running");

  useEffect(() => {
    if (!pitch || !drafting) return;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/pitches/${pitch.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const next: PitchDto = await res.json();
      setPitch(next);
      if (next.status === "done") {
        setSubject(next.subject ?? "");
        setBody(next.body ?? "");
      }
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [pitch, drafting]);

  async function draft() {
    setError(null);
    const res = await fetch("/api/pitches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brand, ask, note }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.message ?? "Couldn't start the draft.");
      return;
    }
    setPitch({ id: data.id, brand, status: "queued", ask, subject: null, body: null, claims: [], error: null, posts: [] });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the text is selectable */
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-2xl bg-ink px-4 text-sm font-semibold text-paper"
        data-testid="draft-pitch"
      >
        <Mail className="size-4" /> Draft pitch
      </button>
    );
  }

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const postById = new Map(pitch?.posts.map((p) => [p.id, p]) ?? []);

  return (
    <section className="mt-2 flex flex-col gap-3 rounded-2xl border bg-background p-4" data-testid="pitch-panel">
      <div className="flex items-center justify-between">
        <h4 className="font-sans font-semibold">Pitch {brand}</h4>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close pitch" className="rounded-full p-1 hover:bg-muted">
          <X className="size-4" />
        </button>
      </div>

      {pitch?.status !== "done" && (
        <>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="What are you asking for?">
            {ASKS.map(([value, label]) => (
              <label
                key={value}
                className="flex h-10 cursor-pointer items-center justify-center rounded-xl border text-sm font-medium has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper"
              >
                <input type="radio" name={`ask-${brand}`} value={value} checked={ask === value} onChange={() => setAsk(value)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything to mention? (optional)" aria-label="Note for the pitch" />
          {(error || pitch?.status === "error") && (
            <p role="alert" className="text-sm text-stop">
              {error ?? pitch?.error}
            </p>
          )}
          <button
            type="button"
            onClick={draft}
            disabled={drafting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-ink text-sm font-semibold text-paper"
            data-testid="draft-submit"
          >
            {drafting ? (
              <>
                <LoaderCircle className="size-4 animate-spin" /> Writing from your posts…
              </>
            ) : (
              "Write it"
            )}
          </button>
        </>
      )}

      {pitch?.status === "done" && (
        <>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" className="font-semibold" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} aria-label="Pitch body" data-testid="pitch-body" />
          <p className={`text-xs ${words > MAX_WORDS ? "text-stop" : "text-muted-foreground"}`}>
            {words}/{MAX_WORDS} words
          </p>
          <div className="rounded-xl bg-muted/60 p-3" data-testid="pitch-evidence">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Where each claim comes from</p>
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {pitch.claims.map((c, i) => (
                <li key={i}>
                  <p className="italic">&ldquo;{c.text}&rdquo;</p>
                  {c.post_ids.map((id) => {
                    const p = postById.get(id);
                    if (!p) return null;
                    const label = `${p.platform ?? "post"}${p.postedAt ? `, ${formatDate(p.postedAt)}` : ""}`;
                    return p.url ? (
                      <a key={id} href={p.url} target="_blank" rel="noreferrer" className="mr-2 text-xs font-semibold underline underline-offset-4">
                        {label}
                      </a>
                    ) : (
                      <span key={id} className="mr-2 text-xs text-muted-foreground">
                        {label}
                      </span>
                    );
                  })}
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={copy}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border bg-card text-sm font-semibold"
          >
            {copied ? <Check className="size-4 text-go" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy subject + email"}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            A draft for you to edit and send yourself. Greenlight never sends anything.
          </p>
        </>
      )}
    </section>
  );
}
