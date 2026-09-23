"use client";

import { Flag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORIES } from "@/lib/rights-config";
import { type Draft, type ExtractedTerms, initialReview, toConfirmBody, windowsNeedingDates } from "@/lib/review";
import { formatDate } from "@/lib/rights";

import { DateInput, Field, QuoteButton } from "./fields";
import { WindowEditor } from "./window-editor";

const FLAG_LABELS: Record<string, string> = {
  perpetual_usage: "Perpetual usage",
  worldwide_paid_usage: "Worldwide paid usage",
  unlimited_revisions: "Unlimited revisions",
  late_payment: "Slow payment",
  exclusivity_exceeds_usage: "Exclusivity outlasts usage",
  ai_likeness: "AI / likeness rights",
  raw_footage: "Raw footage handover",
  no_kill_fee: "No kill fee",
  other: "Worth a look",
};

export function ReviewForm({
  contractId,
  terms,
  onQuote,
}: {
  contractId: string;
  terms: ExtractedTerms;
  onQuote: (q: string) => void;
}) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(() => initialReview(terms));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const missing = useMemo(() => windowsNeedingDates(d), [d]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  async function confirm() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/contracts/${contractId}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toConfirmBody(d)),
    });
    if (res.ok) {
      router.push("/rights");
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.message ?? "Couldn't save. Check the highlighted fields.");
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-6" data-testid="review-form">
      {terms.red_flags.length > 0 && (
        <section className="rounded-2xl border border-stop/30 bg-stop-soft/60 p-4" data-testid="red-flags">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Flag className="size-4 text-stop" aria-hidden /> {terms.red_flags.length} clause
            {terms.red_flags.length === 1 ? "" : "s"} to look at twice
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {terms.red_flags.map((f, i) => (
              <li key={i} className="flex items-start justify-between gap-2 text-sm">
                <div>
                  <p className="font-semibold">{FLAG_LABELS[f.type] ?? f.type}</p>
                  <p className="text-muted-foreground">{f.why}</p>
                </div>
                <QuoteButton quote={f.quote} onQuote={onQuote} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
        <h2 className="text-lg font-semibold">The deal</h2>
        <Field label="Brand" htmlFor="brand" quote={terms.brand.source_quote} onQuote={onQuote} confidence={terms.brand.confidence}>
          <Input id="brand" value={d.brand} onChange={(e) => set("brand", e.target.value)} />
        </Field>
        <Field label="Product category" htmlFor="category" hint="Used to check exclusivity clashes.">
          <select
            id="category"
            value={d.category}
            onChange={(e) => set("category", e.target.value)}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Campaign" htmlFor="campaign" quote={terms.campaign.source_quote} onQuote={onQuote}>
          <Input id="campaign" value={d.campaign} onChange={(e) => set("campaign", e.target.value)} />
        </Field>
        <Field label="Signed" htmlFor="signed" quote={terms.signed_date.source_quote} onQuote={onQuote}>
          <DateInput id="signed" value={d.signedAt} onChange={(v) => set("signedAt", v)} />
        </Field>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label="Fee" htmlFor="fee" quote={terms.fee.source_quote} onQuote={onQuote} confidence={terms.fee.confidence}>
            <Input
              id="fee"
              type="number"
              inputMode="decimal"
              min={0}
              value={d.feeAmount ?? ""}
              onChange={(e) => set("feeAmount", e.target.value === "" ? null : Number(e.target.value))}
            />
          </Field>
          <Field label="Currency" htmlFor="currency">
            <Input
              id="currency"
              maxLength={3}
              value={d.feeCurrency}
              onChange={(e) => set("feeCurrency", e.target.value.toUpperCase())}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid within (days)" htmlFor="net" quote={terms.payment_terms.source_quote} onQuote={onQuote}>
            <Input
              id="net"
              type="number"
              min={0}
              value={d.paymentTermsDays ?? ""}
              onChange={(e) => set("paymentTermsDays", e.target.value === "" ? null : Number(e.target.value))}
            />
          </Field>
          <Field
            label="Payment due"
            htmlFor="due"
            hint={d.paymentDueEstimated ? "Estimate: last deliverable + payment days." : undefined}
          >
            <DateInput
              id="due"
              value={d.paymentDueAt}
              onChange={(v) => setD((p) => ({ ...p, paymentDueAt: v, paymentDueEstimated: false }))}
            />
          </Field>
        </div>
      </section>

      {d.deliverables.length > 0 && (
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
          <h2 className="text-lg font-semibold">Deliverables</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {d.deliverables.map((x, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span>
                  {x.count ?? 1}× {x.platform ?? "post"} {x.format ?? ""}
                </span>
                <span className="text-xs text-muted-foreground">{x.dueDate ? formatDate(x.dueDate) : "no date"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Rights</h2>
        {d.windows.map((w, i) => (
          <WindowEditor
            key={i}
            index={i}
            w={w}
            onQuote={onQuote}
            onChange={(nw) => set("windows", d.windows.map((old, j) => (j === i ? nw : old)))}
            onRemove={() => set("windows", d.windows.filter((_, j) => j !== i))}
          />
        ))}
        {d.windows.length === 0 && <p className="text-sm text-muted-foreground">No usage, whitelisting or exclusivity found.</p>}
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border bg-card p-4 text-sm">
        <h2 className="text-lg font-semibold">Other terms</h2>
        {(
          [
            ["Revisions", terms.revision_rounds.value, terms.revision_rounds.source_quote],
            ["Raw footage", terms.raw_file_delivery.value === null ? null : terms.raw_file_delivery.value ? "Yes" : "No", terms.raw_file_delivery.source_quote],
            ["Termination", terms.termination.value, terms.termination.source_quote],
            ["Kill fee", terms.kill_fee.value, terms.kill_fee.source_quote],
          ] as const
        ).map(([label, value, quote]) => (
          <div key={label} className="flex items-start justify-between gap-2">
            <span>
              <span className="font-medium">{label}: </span>
              {value ?? <span className="text-muted-foreground">not stated</span>}
            </span>
            <QuoteButton quote={quote} onQuote={onQuote} />
          </div>
        ))}
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        {missing.length > 0 && (
          <p className="mb-2 text-sm text-wait" data-testid="missing-dates">
            <a href={`#window-${missing[0]}`} className="underline underline-offset-4">
              {missing.length} date{missing.length === 1 ? "" : "s"} to fill in
            </a>{" "}
            before saving.
          </p>
        )}
        {error && (
          <p role="alert" className="mb-2 text-sm text-stop">
            {error}
          </p>
        )}
        <Button
          type="button"
          size="lg"
          onClick={confirm}
          disabled={missing.length > 0 || saving || !d.brand.trim()}
          className="h-12 w-full rounded-2xl text-base font-semibold"
          data-testid="confirm"
        >
          {saving ? "Saving…" : "Looks right, save to wallet"}
        </Button>
      </div>
    </div>
  );
}
