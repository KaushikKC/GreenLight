/** Turning extracted contract terms into an editable review draft. Pure. */

import type { WindowKind } from "./rights";
import { addDays, suggestEnd } from "./rights";

// ---------------------------------------------------------------------------
// Extracted terms (shape written by the analyzer, record_contract_terms)
// ---------------------------------------------------------------------------

type Sourced = { source_quote: string | null; confidence: number };
type Dated = Sourced & { start: string | null; end: string | null; duration_text: string | null };

export type ExtractedTerms = {
  brand: Sourced & { value: string | null };
  brand_category_id: string;
  campaign: Sourced & { value: string | null };
  signed_date: Sourced & { value: string | null };
  fee: Sourced & { amount: number | null; currency: string | null };
  payment_terms: Sourced & { net_days: number | null; trigger: string | null };
  deliverables: (Sourced & {
    platform: string | null;
    format: string | null;
    count: number | null;
    due_date: string | null;
  })[];
  usage_rights: (Dated & {
    scope: "organic" | "paid";
    platforms: string[];
    territories: string[];
    perpetual: boolean;
  })[];
  whitelisting: (Dated & { platforms: string[] })[];
  exclusivity: (Dated & { category: string; category_id: string; competitors_named: string[] })[];
  revision_rounds: Sourced & { value: string | null };
  raw_file_delivery: Sourced & { value: boolean | null };
  termination: Sourced & { value: string | null };
  kill_fee: Sourced & { value: string | null };
  red_flags: { type: string; quote: string; why: string }[];
};

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

export type DraftWindow = {
  kind: WindowKind;
  scope: "organic" | "paid" | null;
  platforms: string[];
  territories: string[];
  category: string | null;
  competitors: string[];
  startsAt: string | null;
  endsAt: string | null;
  perpetual: boolean;
  durationText: string | null;
  sourceQuote: string | null;
  confidence: number;
};

export type Draft = {
  brand: string;
  category: string;
  campaign: string;
  signedAt: string | null;
  feeAmount: number | null;
  feeCurrency: string;
  paymentTermsDays: number | null;
  paymentDueAt: string | null;
  /** True when paymentDueAt was estimated rather than stated. */
  paymentDueEstimated: boolean;
  deliverables: { platform: string | null; format: string | null; count: number | null; dueDate: string | null }[];
  windows: DraftWindow[];
  notes: string;
};

/** Payment due estimate: last deliverable date + net days (e.g. invoice after posting). */
export function estimatePaymentDue(t: ExtractedTerms): string | null {
  const net = t.payment_terms.net_days;
  const dates = t.deliverables.map((d) => d.due_date).filter((d): d is string => Boolean(d));
  if (net === null || dates.length === 0) return null;
  return addDays(dates.sort().at(-1)!, net);
}

function window(kind: WindowKind, w: Dated, extra: Partial<DraftWindow>): DraftWindow {
  const start = w.start ?? null;
  const perpetual = extra.perpetual ?? false;
  return {
    kind,
    scope: null,
    platforms: [],
    territories: [],
    category: null,
    competitors: [],
    startsAt: start,
    endsAt: perpetual ? null : (w.end ?? (start ? suggestEnd(start, w.duration_text) : null)),
    perpetual,
    durationText: w.duration_text,
    sourceQuote: w.source_quote,
    confidence: w.confidence,
    ...extra,
  };
}

export function initialReview(t: ExtractedTerms): Draft {
  const estimate = estimatePaymentDue(t);
  return {
    brand: t.brand.value ?? "",
    category: t.brand_category_id,
    campaign: t.campaign.value ?? "",
    signedAt: t.signed_date.value,
    feeAmount: t.fee.amount,
    feeCurrency: (t.fee.currency ?? "GBP").toUpperCase(),
    paymentTermsDays: t.payment_terms.net_days,
    paymentDueAt: estimate,
    paymentDueEstimated: estimate !== null,
    deliverables: t.deliverables.map((d) => ({
      platform: d.platform,
      format: d.format,
      count: d.count,
      dueDate: d.due_date,
    })),
    windows: [
      ...t.usage_rights.map((u) =>
        window("usage", u, {
          scope: u.scope,
          platforms: u.platforms,
          territories: u.territories,
          perpetual: u.perpetual,
        }),
      ),
      ...t.whitelisting.map((w) => window("whitelisting", w, { platforms: w.platforms })),
      ...t.exclusivity.map((e) =>
        window("exclusivity", e, { category: e.category_id, competitors: e.competitors_named }),
      ),
    ],
    notes: "",
  };
}

/** Windows the creator must still date before confirming. Never guess a start. */
export function windowsNeedingDates(d: Draft): number[] {
  return d.windows.flatMap((w, i) => (!w.startsAt || (!w.perpetual && !w.endsAt) ? [i] : []));
}

/** Body for POST /api/contracts/:id/confirm. */
export function toConfirmBody(d: Draft) {
  return {
    brand: d.brand,
    category: d.category,
    campaign: d.campaign || null,
    signedAt: d.signedAt,
    feeAmount: d.feeAmount,
    feeCurrency: d.feeCurrency || null,
    paymentTermsDays: d.paymentTermsDays,
    paymentDueAt: d.paymentDueAt,
    deliverables: d.deliverables,
    windows: d.windows.map((w) => ({
      kind: w.kind,
      scope: w.scope,
      platforms: w.platforms,
      territories: w.territories,
      category: w.kind === "exclusivity" ? w.category : null,
      startsAt: w.startsAt,
      endsAt: w.perpetual ? null : w.endsAt,
      perpetual: w.perpetual,
      durationText: w.durationText,
      sourceQuote: w.sourceQuote,
    })),
    notes: d.notes || null,
  };
}

// ---------------------------------------------------------------------------
// Quote highlighting
// ---------------------------------------------------------------------------

const QUOTE_CHARS: Record<string, string> = { "“": '"', "”": '"', "‘": "'", "’": "'" };

/**
 * Where `quote` appears in `text`, ignoring case, whitespace runs and curly vs
 * straight quotes. Returns character offsets into the original text.
 */
export function findQuote(text: string, quote: string | null | undefined): { start: number; end: number } | null {
  if (!quote?.trim()) return null;
  // Normalised copy of text with a map back to original offsets.
  let norm = "";
  const map: number[] = [];
  let prevSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = QUOTE_CHARS[text[i]] ?? text[i];
    if (/\s/.test(ch)) {
      if (prevSpace) continue;
      norm += " ";
      prevSpace = true;
    } else {
      norm += ch.toLowerCase();
      prevSpace = false;
    }
    map.push(i);
  }
  const needle = quote
    .trim()
    .replace(/[“”‘’]/g, (c) => QUOTE_CHARS[c])
    .replace(/\s+/g, " ")
    .toLowerCase();
  const at = norm.indexOf(needle);
  if (at === -1) return null;
  return { start: map[at], end: map[at + needle.length - 1] + 1 };
}
