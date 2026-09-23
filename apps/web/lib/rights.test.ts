import { describe, expect, it } from "vitest";

import {
  activeWindows,
  addDays,
  addMonths,
  buildAlerts,
  type Category,
  daysBetween,
  type Deal,
  dealConflicts,
  exclusivityConflicts,
  expiringWithin,
  formatMoney,
  isActive,
  normalizeCategory,
  overduePayments,
  parseDuration,
  paymentsDueSoon,
  rangesOverlap,
  type RightsWindow,
  suggestEnd,
  toIcs,
} from "./rights";

const TODAY = "2026-09-23";

function win(p: Partial<RightsWindow> & Pick<RightsWindow, "kind">): RightsWindow {
  return {
    id: p.id ?? `${p.kind}-${p.brand ?? "glow"}`,
    dealId: p.dealId ?? "deal-glow",
    brand: p.brand ?? "Glow Serum",
    scope: null,
    platforms: [],
    territories: [],
    category: null,
    startsAt: "2026-03-03",
    endsAt: "2026-12-31",
    perpetual: false,
    ...p,
  };
}

function deal(p: Partial<Deal> = {}): Deal {
  return {
    id: "deal-glow",
    brand: "Glow Serum",
    category: "skincare",
    campaign: "Morning Glow",
    feeAmount: 2500,
    feeCurrency: "GBP",
    paymentDueAt: null,
    paid: false,
    ...p,
  };
}

const CATEGORIES: Category[] = [
  { id: "skincare", label: "Skincare", keywords: ["skincare", "serum", "spf"] },
  { id: "haircare", label: "Haircare", keywords: ["shampoo"] },
  { id: "other", label: "Other", keywords: [] },
];

describe("dates", () => {
  it("counts and adds days", () => {
    expect(daysBetween("2026-09-23", "2026-09-28")).toBe(5);
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("adds months and clamps to month end", () => {
    expect(addMonths("2026-03-03", 12)).toBe("2027-03-03");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("detects overlap with open ends", () => {
    expect(rangesOverlap("2026-01-01", "2026-01-31", "2026-01-31", "2026-02-10")).toBe(true);
    expect(rangesOverlap("2026-01-01", "2026-01-30", "2026-01-31", null)).toBe(false);
    expect(rangesOverlap("2026-01-01", null, "2030-01-01", "2030-02-01")).toBe(true);
  });
});

describe("durations", () => {
  it.each([
    ["90 days from the first post", { amount: 90, unit: "day" }],
    ["twelve (12) months from the Effective Date", { amount: 12, unit: "month" }],
    ["for ninety (90) days", { amount: 90, unit: "day" }],
    ["six months", { amount: 6, unit: "month" }],
    ["1 year", { amount: 1, unit: "year" }],
    ["2 weeks after posting", { amount: 2, unit: "week" }],
  ])("parses %s", (text, expected) => {
    expect(parseDuration(text)).toEqual(expected);
  });

  it("returns null when there's no period", () => {
    expect(parseDuration("in perpetuity")).toBeNull();
    expect(parseDuration(null)).toBeNull();
  });

  it("suggests an end once the start is known", () => {
    expect(suggestEnd("2026-03-20", "90 days from the first post")).toBe("2026-06-18");
    expect(suggestEnd("2026-03-20", "in perpetuity")).toBeNull();
  });
});

describe("windows", () => {
  const organic = win({ kind: "usage", scope: "organic", endsAt: "2026-10-01" });
  const paidForever = win({ kind: "usage", scope: "paid", endsAt: null, perpetual: true, id: "paid" });
  const unconfirmed = win({ kind: "whitelisting", startsAt: null, endsAt: null, id: "wl" });

  it("knows what's active, including perpetual windows", () => {
    expect(isActive(organic, TODAY)).toBe(true);
    expect(isActive(organic, "2026-10-02")).toBe(false);
    expect(isActive(paidForever, "2040-01-01")).toBe(true);
    expect(isActive(unconfirmed, TODAY)).toBe(false);
    expect(activeWindows([organic, paidForever, unconfirmed], TODAY).map((w) => w.id)).toEqual([
      organic.id,
      "paid",
    ]);
  });

  it("lists windows ending soon, soonest first, never perpetual ones", () => {
    const soon = win({ kind: "whitelisting", endsAt: "2026-09-25", id: "wl2" });
    const res = expiringWithin([organic, paidForever, soon], TODAY, 14);
    expect(res.map((w) => [w.id, w.daysLeft])).toEqual([
      ["wl2", 2],
      [organic.id, 8],
    ]);
  });
});

describe("payments", () => {
  const deals = [
    deal({ id: "a", brand: "A", paymentDueAt: "2026-09-11" }),
    deal({ id: "b", brand: "B", paymentDueAt: "2026-09-20", paid: true }),
    deal({ id: "c", brand: "C", paymentDueAt: "2026-09-26" }),
    deal({ id: "d", brand: "D", paymentDueAt: null }),
  ];

  it("finds unpaid overdue payments", () => {
    expect(overduePayments(deals, TODAY).map((d) => [d.id, d.daysOverdue])).toEqual([["a", 12]]);
  });

  it("finds payments due soon", () => {
    expect(paymentsDueSoon(deals, TODAY, 7).map((d) => [d.id, d.daysLeft])).toEqual([["c", 3]]);
  });
});

describe("categories", () => {
  it("maps ids, labels and keywords", () => {
    expect(normalizeCategory("Skincare", CATEGORIES)).toBe("skincare");
    expect(normalizeCategory("face serum brand", CATEGORIES)).toBe("skincare");
    expect(normalizeCategory("anti-dandruff shampoo", CATEGORIES)).toBe("haircare");
    expect(normalizeCategory("crypto", CATEGORIES)).toBe("other");
    expect(normalizeCategory("  ", CATEGORIES)).toBe("other");
  });
});

describe("exclusivityConflicts", () => {
  const ex = win({ kind: "exclusivity", category: "skincare", startsAt: "2026-03-03", endsAt: "2026-12-31" });

  it("flags a same-category offer from another brand that overlaps", () => {
    const [c] = exclusivityConflicts(
      { brand: "CeraVe", category: "skincare", start: "2026-11-01", end: "2027-02-01" },
      [ex],
    );
    expect(c.window.brand).toBe("Glow Serum");
    expect([c.from, c.to]).toEqual(["2026-11-01", "2026-12-31"]);
  });

  it("allows other categories, the same brand, and dates after it ends", () => {
    const windows = [ex];
    expect(exclusivityConflicts({ brand: "X", category: "haircare", start: TODAY, end: TODAY }, windows)).toEqual([]);
    expect(exclusivityConflicts({ brand: "glow serum ", category: "skincare", start: TODAY, end: TODAY }, windows)).toEqual([]);
    expect(
      exclusivityConflicts({ brand: "X", category: "skincare", start: "2027-01-01", end: "2027-02-01" }, windows),
    ).toEqual([]);
  });

  it("treats perpetual exclusivity as never ending", () => {
    const forever = { ...ex, endsAt: null, perpetual: true };
    const [c] = exclusivityConflicts({ brand: "X", category: "skincare", start: "2030-01-01", end: "2030-02-01" }, [forever]);
    expect(c.to).toBe("2030-02-01");
  });

  it("ignores usage windows and uncategorised exclusivity", () => {
    const usage = win({ kind: "usage", category: "skincare" });
    const other = { ...ex, category: "other" };
    expect(exclusivityConflicts({ brand: "X", category: "skincare", start: TODAY, end: TODAY }, [usage])).toEqual([]);
    expect(exclusivityConflicts({ brand: "X", category: "other", start: TODAY, end: TODAY }, [other])).toEqual([]);
  });
});

describe("dealConflicts", () => {
  it("finds a signed deal that breaks another deal's exclusivity", () => {
    const glow = deal();
    const rival = deal({ id: "deal-rival", brand: "CeraVe" });
    const windows = [
      win({ kind: "exclusivity", category: "skincare", startsAt: "2026-03-03", endsAt: "2026-12-31" }),
      win({ kind: "usage", dealId: "deal-rival", brand: "CeraVe", startsAt: "2026-10-01", endsAt: "2027-04-01", id: "rival-usage" }),
    ];
    const [c] = dealConflicts([glow, rival], windows);
    expect(c.other.brand).toBe("CeraVe");
    expect([c.from, c.to]).toEqual(["2026-10-01", "2026-12-31"]);
  });

  it("ignores different categories", () => {
    const windows = [
      win({ kind: "exclusivity", category: "skincare" }),
      win({ kind: "usage", dealId: "hair", brand: "Olaplex", id: "h" }),
    ];
    expect(dealConflicts([deal(), deal({ id: "hair", brand: "Olaplex", category: "haircare" })], windows)).toEqual([]);
  });
});

describe("buildAlerts", () => {
  it("orders overdue and conflicts before expiring and due soon", () => {
    const deals = [
      deal({ id: "y", brand: "Brand Y", paymentDueAt: "2026-09-11" }),
      deal({ id: "z", brand: "Brand Z", paymentDueAt: "2026-09-25" }),
    ];
    const windows = [win({ kind: "whitelisting", brand: "Brand X", dealId: "x", endsAt: "2026-09-28" })];
    const alerts = buildAlerts(deals, windows, TODAY, { expiringDays: 14, dueSoonDays: 7 });
    expect(alerts.map((a) => a.title)).toEqual([
      "Payment of £2,500 from Brand Y was due 12 days ago",
      "Whitelisting for Brand X ends in 5 days",
      "Payment from Brand Z is due in 2 days",
    ]);
    expect(alerts[0].severity).toBe("high");
  });

  it("says 'today' and uses singular days", () => {
    const windows = [win({ kind: "usage", endsAt: TODAY }), win({ kind: "exclusivity", endsAt: "2026-09-24", id: "e" })];
    const titles = buildAlerts([], windows, TODAY, { expiringDays: 14, dueSoonDays: 7 }).map((a) => a.title);
    expect(titles).toEqual(["Usage rights for Glow Serum ends today", "Exclusivity for Glow Serum ends in 1 day"]);
  });
});

describe("formatMoney", () => {
  it("formats known currencies and falls back gracefully", () => {
    expect(formatMoney(2500, "GBP")).toBe("£2,500");
    expect(formatMoney(99.5, "USD")).toBe("US$99.50");
    expect(formatMoney(10, "NOTREAL")).toBe("10 NOTREAL");
    expect(formatMoney(null, "GBP")).toBe("");
  });
});

describe("toIcs", () => {
  const ics = toIcs(
    [deal({ paymentDueAt: "2026-10-15" }), deal({ id: "paid", paymentDueAt: "2026-10-01", paid: true })],
    [
      win({ kind: "whitelisting", endsAt: "2026-06-18", sourceQuote: "for ninety (90) days, from first post" }),
      win({ kind: "usage", perpetual: true, endsAt: null, id: "forever" }),
    ],
    new Date("2026-09-23T10:00:00Z"),
  );

  it("is a valid calendar with CRLF line endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });

  it("has one all-day event per end date and unpaid payment, with reminders", () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260618");
    expect(ics).toContain("SUMMARY:Payment due: Glow Serum (£2\\,500)");
    expect(ics).toContain("TRIGGER:-P3D");
    expect(ics).not.toContain("forever");
  });

  it("escapes commas in quotes", () => {
    expect(ics.replace(/\r\n /g, "")).toContain("ninety (90) days\\, from first post");
  });
});
