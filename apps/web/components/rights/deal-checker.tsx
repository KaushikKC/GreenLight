"use client";

import { CircleCheck, OctagonAlert } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { type Conflict, exclusivityConflicts, formatDate, type RightsWindow } from "@/lib/rights";
import { CATEGORIES, CATEGORY_LABELS } from "@/lib/rights-config";

type Result = { conflicts: Conflict[]; brand: string; category: string } | null;

export function DealChecker({ windows, today }: { windows: RightsWindow[]; today: string }) {
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0].id);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState("");
  const [result, setResult] = useState<Result>(null);

  function check(e: React.FormEvent) {
    e.preventDefault();
    const offer = { brand: brand.trim(), category, start, end: end || start };
    setResult({ conflicts: exclusivityConflicts(offer, windows), brand: offer.brand, category });
  }

  return (
    <section
      className="pop rounded-[2rem] bg-violet-soft p-5"
      style={{ "--pop": "var(--violet)" } as React.CSSProperties}
      aria-labelledby="checker-heading"
      data-testid="deal-checker"
    >
      <h2 id="checker-heading" className="text-2xl font-extrabold">
        Can I take this deal? 🤔
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Checks the offer against your exclusivity clauses.</p>
      <form onSubmit={check} className="mt-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Brand
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} required placeholder="e.g. CeraVe" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 rounded-md border bg-transparent px-3 text-sm"
              aria-label="Offer category"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            From
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} required aria-label="Offer start" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Until
            <Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} aria-label="Offer end" />
          </label>
        </div>
        <button type="submit" className="pop-sm pop-press h-11 rounded-2xl bg-violet font-bold text-on-color">
          Check
        </button>
      </form>

      {result && (
        <div aria-live="polite" className="mt-4" data-testid="checker-result">
          {result.conflicts.length === 0 ? (
            <p className="flex items-start gap-2 rounded-2xl bg-go-soft px-4 py-3 text-sm">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-go" aria-hidden />
              <span>
                <span className="font-semibold">No clashes found.</span> None of your exclusivity clauses cover{" "}
                {CATEGORY_LABELS[result.category]?.toLowerCase()} on those dates.
              </span>
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {result.conflicts.map((c) => (
                <li key={c.window.id} className="rounded-2xl bg-stop-soft px-4 py-3 text-sm">
                  <p className="flex items-start gap-2 font-semibold">
                    <OctagonAlert className="mt-0.5 size-4 shrink-0 text-stop" aria-hidden />
                    Clashes with your {c.window.brand} exclusivity ({CATEGORY_LABELS[c.window.category ?? ""] ?? c.window.category}) from {formatDate(c.from)}
                    {c.to ? ` to ${formatDate(c.to)}` : " onwards"}.
                  </p>
                  {c.window.sourceQuote && (
                    <blockquote className="mt-2 border-l-2 border-stop/40 pl-3 text-muted-foreground italic">
                      “{c.window.sourceQuote}”
                    </blockquote>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
