import { describe, expect, it } from "vitest";

import type { Deal, RightsWindow } from "./rights";
import { buildTimeline } from "./timeline";

const deal: Deal = {
  id: "d1",
  brand: "Glow",
  category: "skincare",
  campaign: null,
  feeAmount: null,
  feeCurrency: null,
  paymentDueAt: null,
  paid: false,
};

const w = (p: Partial<RightsWindow>): RightsWindow => ({
  id: "w",
  dealId: "d1",
  brand: "Glow",
  kind: "usage",
  scope: null,
  platforms: [],
  territories: [],
  category: null,
  startsAt: "2026-03-03",
  endsAt: "2027-03-03",
  perpetual: false,
  ...p,
});

describe("buildTimeline", () => {
  it("spans all windows with padding and marks today", () => {
    const t = buildTimeline([deal], [w({})], "2026-09-23");
    expect(t.start).toBe("2026-02-17");
    expect(t.end).toBe("2027-03-17");
    expect(t.todayPct).toBeGreaterThan(40);
    expect(t.todayPct).toBeLessThan(60);
  });

  it("positions bars and lets perpetual windows run off the edge", () => {
    const t = buildTimeline(
      [deal],
      [w({ id: "a" }), w({ id: "b", perpetual: true, endsAt: null })],
      "2026-09-23",
    );
    const [a, b] = t.rows[0].bars;
    expect(a.leftPct).toBeGreaterThan(0);
    expect(a.continues).toBe(false);
    expect(b.continues).toBe(true);
    expect(b.leftPct + b.widthPct).toBeCloseTo(100);
  });

  it("skips windows without a start date", () => {
    const t = buildTimeline([deal], [w({ startsAt: null })], "2026-09-23");
    expect(t.rows[0].bars).toEqual([]);
  });

  it("labels January with the year and uses quarterly ticks for long ranges", () => {
    const short = buildTimeline([deal], [w({})], "2026-09-23");
    expect(short.months.some((m) => m.label === "Jan 2027")).toBe(true);
    const long = buildTimeline([deal], [w({ startsAt: "2025-01-01", endsAt: "2028-12-31" })], "2026-09-23");
    expect(long.months.length).toBeLessThan(15);
  });

  it("caps very long ranges around today", () => {
    const t = buildTimeline([deal], [w({ startsAt: "2020-01-01", endsAt: "2035-01-01" })], "2026-09-23");
    expect(t.start).toBe("2025-09-23");
    expect(t.todayPct).toBeGreaterThan(0);
  });
});
