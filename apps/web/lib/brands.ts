/**
 * Brands You Already Love: ranking (BUILD_PLAN §8.2). Pure, unit-tested.
 *
 *   love_score = Σ organic mentions × recency_decay(90-day half-life)
 *                × (0.5 + sentiment/2) × modality_weight
 *
 * Brands where every mention is sponsored are "past partners", not loves.
 */

import brandsJson from "../../../services/analyzer/rules/brands.json";

import { daysBetween } from "./rights";

export type Modality = "spoken" | "caption" | "on_screen" | "visual";

export type Mention = {
  id: string;
  postId: string;
  brand: string; // canonical display name
  brandRaw: string;
  product: string | null;
  modality: Modality;
  sentiment: number; // -1..1
  isSponsored: boolean;
  evidence: string | null;
  confidence: number | null;
  postedAt: string | null; // YYYY-MM-DD
  postUrl: string | null;
  platform: string | null;
};

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  other: "Post",
};

export function platformLabel(p: string | null | undefined): string {
  return (p && PLATFORM_LABELS[p]) || "Post";
}

export type RankConfig = {
  halfLifeDays: number;
  modalityWeights: Record<Modality, number>;
  minConfidence: number;
};

export const RANK_CONFIG: RankConfig = {
  halfLifeDays: brandsJson.half_life_days,
  modalityWeights: brandsJson.modality_weights as Record<Modality, number>,
  minConfidence: brandsJson.min_confidence,
};

export function recencyDecay(postedAt: string | null, today: string, halfLifeDays: number): number {
  // Undated posts count as if a full half-life old.
  const age = postedAt ? Math.max(0, daysBetween(postedAt, today)) : halfLifeDays;
  return Math.pow(0.5, age / halfLifeDays);
}

export function mentionScore(m: Mention, today: string, cfg: RankConfig = RANK_CONFIG): number {
  if (m.isSponsored) return 0;
  const sentiment = Math.max(-1, Math.min(1, m.sentiment));
  return (
    recencyDecay(m.postedAt, today, cfg.halfLifeDays) *
    (0.5 + sentiment / 2) *
    (cfg.modalityWeights[m.modality] ?? 0.5)
  );
}

export type BrandSummary = {
  brand: string;
  loveScore: number;
  mentions: number;
  organicMentions: number;
  sponsoredMentions: number;
  posts: number;
  lastMentioned: string | null;
  /** Mentions per month, oldest first, ending with the current month. */
  sparkline: number[];
  /** Best organic evidence first. */
  evidence: Mention[];
};

export function monthlyCounts(mentions: Mention[], today: string, months = 12): number[] {
  const [ty, tm] = today.split("-").map(Number);
  const counts = new Array(months).fill(0);
  for (const m of mentions) {
    if (!m.postedAt) continue;
    const [y, mo] = m.postedAt.split("-").map(Number);
    const ago = (ty - y) * 12 + (tm - mo);
    if (ago >= 0 && ago < months) counts[months - 1 - ago] += 1;
  }
  return counts;
}

export function rankBrands(
  all: Mention[],
  today: string,
  cfg: RankConfig = RANK_CONFIG,
): { loved: BrandSummary[]; pastPartners: BrandSummary[] } {
  const mentions = all.filter((m) => (m.confidence ?? 1) >= cfg.minConfidence);
  const byBrand = new Map<string, Mention[]>();
  for (const m of mentions) byBrand.set(m.brand, [...(byBrand.get(m.brand) ?? []), m]);

  const loved: BrandSummary[] = [];
  const pastPartners: BrandSummary[] = [];
  for (const [brand, ms] of byBrand) {
    const organic = ms.filter((m) => !m.isSponsored);
    const scoreOf = (m: Mention) => mentionScore(m, today, cfg);
    const dates = ms.map((m) => m.postedAt).filter((d): d is string => Boolean(d)).sort();
    const summary: BrandSummary = {
      brand,
      loveScore: Math.round(organic.reduce((s, m) => s + scoreOf(m), 0) * 100) / 100,
      mentions: ms.length,
      organicMentions: organic.length,
      sponsoredMentions: ms.length - organic.length,
      posts: new Set(ms.map((m) => m.postId)).size,
      lastMentioned: dates.at(-1) ?? null,
      sparkline: monthlyCounts(ms, today),
      evidence: [...(organic.length ? organic : ms)].sort((a, b) => scoreOf(b) - scoreOf(a)),
    };
    (organic.length ? loved : pastPartners).push(summary);
  }
  loved.sort((a, b) => b.loveScore - a.loveScore || b.organicMentions - a.organicMentions);
  pastPartners.sort((a, b) => b.mentions - a.mentions);
  return { loved, pastPartners };
}
