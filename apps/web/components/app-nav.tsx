import Link from "next/link";

import { FEATURES, type FeatureKey } from "@/lib/features";

export function AppNav({ active }: { active?: FeatureKey }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm font-semibold" aria-label="Main">
      {(Object.keys(FEATURES) as FeatureKey[]).map((key) => {
        const f = FEATURES[key];
        const on = active === key;
        return (
          <Link
            key={key}
            href={f.href}
            aria-current={on ? "page" : undefined}
            className={`rounded-full px-2.5 py-1 transition ${
              on ? `${f.solid} pop-sm text-on-color` : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            style={on ? ({ "--pop": "var(--ink)" } as React.CSSProperties) : undefined}
          >
            {f.label}
          </Link>
        );
      })}
    </nav>
  );
}
