import type { CSSProperties, ReactNode } from "react";

import { FEATURES, type FeatureKey } from "@/lib/features";

/** Colourful page header: feature sticker, big title, subtitle, soft glow. */
export function PageHero({
  feature,
  title,
  children,
  sticker,
}: {
  feature: FeatureKey;
  title: string;
  children?: ReactNode;
  sticker?: string;
}) {
  const f = FEATURES[feature];
  return (
    <header className="relative flex flex-col gap-3">
      <div
        className="pointer-events-none absolute -inset-x-10 -top-16 -z-10 h-56 opacity-70 blur-2xl"
        style={{ background: `radial-gradient(60% 60% at 30% 40%, color-mix(in oklch, ${f.color} 55%, transparent), transparent 70%)` } as CSSProperties}
        aria-hidden
      />
      <span className={`sticker w-fit -rotate-2 ${f.solid}`}>
        {f.emoji} {sticker ?? f.label}
      </span>
      <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight">{title}</h1>
      {children && <div className="text-lg text-muted-foreground">{children}</div>}
    </header>
  );
}
