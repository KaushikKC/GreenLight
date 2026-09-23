import { ExternalLink, Heart } from "lucide-react";

import { type BrandSummary, platformLabel } from "@/lib/brands";
import { formatDate } from "@/lib/rights";

import { PitchDrafter } from "./pitch-drafter";
import { Sparkline } from "./sparkline";

const MAX_EVIDENCE = 3;

const CARD_POPS = ["var(--pink)", "var(--sun)", "var(--sky)", "var(--lime)", "var(--tangerine)", "var(--violet)"];

export function BrandCard({ b, rank }: { b: BrandSummary; rank: number }) {
  return (
    <li
      className="pop rounded-[2rem] bg-card p-5"
      style={{ "--pop": CARD_POPS[(rank - 1) % CARD_POPS.length] } as React.CSSProperties}
      data-testid="brand-card"
      data-brand={b.brand}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="sticker w-fit bg-card text-[11px]">#{rank}{rank === 1 ? " 🏆" : ""}</p>
          <h3 className="mt-1.5 truncate font-display text-2xl font-extrabold">{b.brand}</h3>
          <p className="text-sm text-muted-foreground">
            {b.organicMentions} organic mention{b.organicMentions === 1 ? "" : "s"}
            {b.sponsoredMentions > 0 && ` · ${b.sponsoredMentions} sponsored`}
            {b.lastMentioned && ` · last ${formatDate(b.lastMentioned)}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="sticker bg-pink text-sm" title="Love score">
            <Heart className="size-3.5 fill-current" aria-hidden /> {b.loveScore.toFixed(2)}
          </span>
          <Sparkline values={b.sparkline} label={`${b.brand} mentions per month over the last year`} />
        </div>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {b.evidence.slice(0, MAX_EVIDENCE).map((m) => (
          <li key={m.id} className="rounded-xl bg-muted/60 px-3 py-2 text-sm">
            <p className="italic">&ldquo;{m.evidence}&rdquo;</p>
            <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              {platformLabel(m.platform)}
              {m.postedAt && ` · ${formatDate(m.postedAt)}`}
              {m.sentiment < 0 && <span className="text-wait">· not a fan here</span>}
              {m.postUrl && (
                <a href={m.postUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold underline underline-offset-4">
                  post <ExternalLink className="size-3" aria-hidden />
                </a>
              )}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <PitchDrafter brand={b.brand} />
      </div>
    </li>
  );
}
