import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import terms from "../../../services/analyzer/tests/fixtures/contract_glow_terms.json";
import { confirmContractInput } from "./contract-schema";
import {
  estimatePaymentDue,
  type ExtractedTerms,
  findQuote,
  initialReview,
  toConfirmBody,
  windowsNeedingDates,
} from "./review";

const T = terms as unknown as ExtractedTerms;
const contractText = readFileSync(
  path.resolve(__dirname, "../../../services/analyzer/tests/fixtures/contract_glow.txt"),
  "utf8",
);

describe("initialReview", () => {
  const d = initialReview(T);

  it("maps deal fields", () => {
    expect([d.brand, d.category, d.feeAmount, d.feeCurrency, d.paymentTermsDays]).toEqual([
      "Glow Serum (Glow Labs Ltd)",
      "skincare",
      2500,
      "GBP",
      90,
    ]);
  });

  it("creates one window per usage, whitelisting and exclusivity grant", () => {
    expect(d.windows.map((w) => [w.kind, w.scope, w.perpetual])).toEqual([
      ["usage", "organic", false],
      ["usage", "paid", true],
      ["whitelisting", null, false],
      ["exclusivity", null, false],
    ]);
    expect(d.windows[3].category).toBe("skincare");
    expect(d.windows[3].competitors).toContain("CeraVe");
  });

  it("never invents a start date for relative windows", () => {
    const wl = d.windows[2];
    expect(wl.startsAt).toBeNull();
    expect(wl.durationText).toContain("90 days");
    expect(windowsNeedingDates(d)).toEqual([2]);
  });

  it("estimates payment due from the last deliverable + net days", () => {
    expect(estimatePaymentDue(T)).toBe("2026-07-09"); // 10 Apr + 90 days
    expect(d.paymentDueEstimated).toBe(true);
  });

  it("produces a body the confirm API accepts once dates are filled", () => {
    const filled = structuredClone(d);
    filled.windows[2].startsAt = "2026-03-20";
    filled.windows[2].endsAt = "2026-06-18";
    expect(confirmContractInput.safeParse(toConfirmBody(filled)).success).toBe(true);
    expect(confirmContractInput.safeParse(toConfirmBody(d)).success).toBe(false);
  });
});

describe("findQuote", () => {
  it("finds every quote in the fixture verbatim", () => {
    const quotes = [
      T.fee.source_quote,
      T.payment_terms.source_quote,
      ...T.usage_rights.map((u) => u.source_quote),
      ...T.red_flags.map((f) => f.quote),
    ];
    for (const q of quotes) expect(findQuote(contractText, q), q ?? "").not.toBeNull();
  });

  it("ignores whitespace, case and curly quotes, returning original offsets", () => {
    const text = "Brand   will PAY\n“Creator” a fee.";
    const hit = findQuote(text, 'will pay "creator"');
    expect(hit).not.toBeNull();
    expect(text.slice(hit!.start, hit!.end)).toBe("will PAY\n“Creator”");
  });

  it("returns null when absent or empty", () => {
    expect(findQuote("abc", "xyz")).toBeNull();
    expect(findQuote("abc", "")).toBeNull();
    expect(findQuote("abc", null)).toBeNull();
  });
});
