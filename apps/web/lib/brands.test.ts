import { describe, expect, it } from "vitest";

import { type Mention, mentionScore, monthlyCounts, rankBrands, recencyDecay } from "./brands";

const TODAY = "2026-09-23";

let n = 0;
function m(p: Partial<Mention>): Mention {
  n += 1;
  return {
    id: `m${n}`,
    postId: p.postId ?? `p${n}`,
    brand: "CeraVe",
    brandRaw: "cerave",
    product: null,
    modality: "caption",
    sentiment: 1,
    isSponsored: false,
    evidence: "love my cerave",
    confidence: 0.9,
    postedAt: TODAY,
    postUrl: null,
    platform: "instagram",
    ...p,
  };
}

describe("recencyDecay", () => {
  it("halves every 90 days", () => {
    expect(recencyDecay(TODAY, TODAY, 90)).toBe(1);
    expect(recencyDecay("2026-06-25", TODAY, 90)).toBeCloseTo(0.5);
    expect(recencyDecay("2026-03-27", TODAY, 90)).toBeCloseTo(0.25);
  });

  it("treats undated posts as a half-life old", () => {
    expect(recencyDecay(null, TODAY, 90)).toBeCloseTo(0.5);
  });
});

describe("mentionScore", () => {
  it("applies sentiment and modality weights from the plan", () => {
    expect(mentionScore(m({ modality: "spoken", sentiment: 1 }), TODAY)).toBe(1);
    expect(mentionScore(m({ modality: "on_screen", sentiment: 1 }), TODAY)).toBeCloseTo(0.8);
    expect(mentionScore(m({ modality: "caption", sentiment: 0 }), TODAY)).toBeCloseTo(0.3);
    expect(mentionScore(m({ modality: "visual", sentiment: -1 }), TODAY)).toBe(0);
  });

  it("gives sponsored mentions no love", () => {
    expect(mentionScore(m({ isSponsored: true }), TODAY)).toBe(0);
  });
});

describe("rankBrands", () => {
  it("ranks by love score and moves all-sponsored brands to past partners", () => {
    const { loved, pastPartners } = rankBrands(
      [
        m({ brand: "CeraVe", modality: "spoken" }),
        m({ brand: "CeraVe", modality: "caption", postedAt: "2026-06-25" }),
        m({ brand: "Glossier", modality: "caption" }),
        m({ brand: "Glow Serum", isSponsored: true }),
        m({ brand: "Glow Serum", isSponsored: true }),
      ],
      TODAY,
    );
    expect(loved.map((b) => b.brand)).toEqual(["CeraVe", "Glossier"]);
    expect(loved[0].loveScore).toBe(1.3); // 1.0 + 0.6 × 0.5
    expect(loved[0].organicMentions).toBe(2);
    expect(pastPartners.map((b) => [b.brand, b.sponsoredMentions])).toEqual([["Glow Serum", 2]]);
  });

  it("keeps a brand in loved if at least one mention is organic", () => {
    const { loved } = rankBrands([m({ brand: "Nike", isSponsored: true }), m({ brand: "Nike" })], TODAY);
    expect(loved[0].sponsoredMentions).toBe(1);
  });

  it("ignores low-confidence mentions", () => {
    const { loved } = rankBrands([m({ brand: "Maybe", confidence: 0.2 })], TODAY);
    expect(loved).toEqual([]);
  });

  it("orders evidence best first and counts distinct posts", () => {
    const { loved } = rankBrands(
      [
        m({ brand: "Oatly", postId: "a", modality: "caption", evidence: "weak" }),
        m({ brand: "Oatly", postId: "a", modality: "spoken", evidence: "strong" }),
      ],
      TODAY,
    );
    expect(loved[0].evidence[0].evidence).toBe("strong");
    expect(loved[0].posts).toBe(1);
  });
});

describe("monthlyCounts", () => {
  it("buckets mentions into the last 12 months, current month last", () => {
    const counts = monthlyCounts(
      [m({ postedAt: "2026-09-01" }), m({ postedAt: "2026-09-20" }), m({ postedAt: "2026-07-15" }), m({ postedAt: "2024-01-01" })],
      TODAY,
    );
    expect(counts).toHaveLength(12);
    expect(counts[11]).toBe(2);
    expect(counts[9]).toBe(1);
    expect(counts.reduce((a, b) => a + b)).toBe(3);
  });
});
