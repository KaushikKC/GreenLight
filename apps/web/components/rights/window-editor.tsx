"use client";

import { CalendarClock, Trash2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { CATEGORIES } from "@/lib/rights-config";
import { suggestEnd } from "@/lib/rights";
import type { DraftWindow } from "@/lib/review";

import { DateInput, Field, listToText, QuoteButton, textToList } from "./fields";

const TITLES: Record<DraftWindow["kind"], string> = {
  usage: "Usage rights",
  whitelisting: "Whitelisting / partnership ads",
  exclusivity: "Exclusivity",
};

const ACCENT: Record<DraftWindow["kind"], string> = {
  usage: "border-l-go",
  whitelisting: "border-l-wait",
  exclusivity: "border-l-stop",
};

export function WindowEditor({
  index,
  w,
  onChange,
  onRemove,
  onQuote,
}: {
  index: number;
  w: DraftWindow;
  onChange: (w: DraftWindow) => void;
  onRemove: () => void;
  onQuote: (q: string) => void;
}) {
  const id = (f: string) => `w${index}-${f}`;
  const missingStart = !w.startsAt;
  const missingEnd = !w.perpetual && !w.endsAt;

  function setStart(start: string | null) {
    // Once the creator supplies a real start, fill the end from the contract's wording.
    const end = !w.endsAt && start ? suggestEnd(start, w.durationText) : w.endsAt;
    onChange({ ...w, startsAt: start, endsAt: end });
  }

  return (
    <article
      className={`flex flex-col gap-4 rounded-2xl border border-l-4 bg-card p-4 ${ACCENT[w.kind]}`}
      data-testid="window-editor"
      data-kind={w.kind}
      id={`window-${index}`}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-sans text-base font-semibold">
            {TITLES[w.kind]}
            {w.scope && <span className="ml-2 text-sm font-medium text-muted-foreground">({w.scope})</span>}
          </h3>
          {w.confidence < 0.7 && <p className="text-xs text-wait">Low confidence, check against the contract.</p>}
        </div>
        <div className="flex items-center gap-1">
          <QuoteButton quote={w.sourceQuote} onQuote={onQuote} />
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
            aria-label={`Remove ${TITLES[w.kind]}`}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </header>

      {w.durationText && (missingStart || missingEnd) && (
        <p className="flex gap-2 rounded-xl bg-wait-soft px-3 py-2 text-sm" data-testid="needs-date">
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-wait" aria-hidden />
          <span>
            The contract says &ldquo;{w.durationText}&rdquo;. Enter the date it{" "}
            {missingStart ? "starts" : "ends"}; we won&apos;t guess it.
          </span>
        </p>
      )}

      {w.kind === "usage" && (
        <Field label="Type" htmlFor={id("scope")}>
          <select
            id={id("scope")}
            value={w.scope ?? "organic"}
            onChange={(e) => onChange({ ...w, scope: e.target.value as DraftWindow["scope"] })}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="organic">Organic (brand reposts)</option>
            <option value="paid">Paid ads</option>
          </select>
        </Field>
      )}

      {w.kind === "exclusivity" ? (
        <>
          <Field label="Category" htmlFor={id("category")}>
            <select
              id={id("category")}
              value={w.category ?? "other"}
              onChange={(e) => onChange({ ...w, category: e.target.value })}
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          {w.competitors.length > 0 && (
            <p className="text-sm text-muted-foreground">Names: {w.competitors.join(", ")}</p>
          )}
        </>
      ) : (
        <Field label="Platforms" htmlFor={id("platforms")} hint="Comma-separated">
          <Input
            id={id("platforms")}
            value={listToText(w.platforms)}
            onChange={(e) => onChange({ ...w, platforms: textToList(e.target.value) })}
          />
        </Field>
      )}

      {w.kind === "usage" && (
        <Field label="Territories" htmlFor={id("territories")} hint="Comma-separated, e.g. UK, worldwide">
          <Input
            id={id("territories")}
            value={listToText(w.territories)}
            onChange={(e) => onChange({ ...w, territories: textToList(e.target.value) })}
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts" htmlFor={id("start")}>
          <DateInput id={id("start")} value={w.startsAt} onChange={setStart} invalid={missingStart} />
        </Field>
        <Field label="Ends" htmlFor={id("end")}>
          {w.perpetual ? (
            <p className="flex h-9 items-center rounded-md border border-dashed px-3 text-sm text-muted-foreground">
              Never
            </p>
          ) : (
            <DateInput
              id={id("end")}
              value={w.endsAt}
              onChange={(v) => onChange({ ...w, endsAt: v })}
              invalid={missingEnd}
            />
          )}
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={w.perpetual}
          onChange={(e) => onChange({ ...w, perpetual: e.target.checked, endsAt: e.target.checked ? null : w.endsAt })}
          className="size-4 accent-ink"
        />
        Perpetual (no end date)
      </label>
    </article>
  );
}
