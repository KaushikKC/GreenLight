"use client";

import { useState, type CSSProperties } from "react";

const COLORS = ["var(--lime)", "var(--pink)", "var(--sun)", "var(--sky)", "var(--tangerine)", "var(--violet)"];
const PIECES = 42;

/** A one-off burst of confetti. Pure CSS; skipped with reduced motion. */
export function Confetti() {
  // Random layout, fixed for this burst (computed once on mount).
  const [pieces] = useState(() =>
    Array.from({ length: PIECES }, (_, i) => ({
      left: `${Math.random() * 100}%`,
      color: COLORS[i % COLORS.length],
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 10,
      round: Math.random() > 0.7,
      style: {
        "--drift": `${(Math.random() - 0.5) * 160}px`,
        "--spin": `${360 + Math.random() * 540}deg`,
        "--dur": `${1.4 + Math.random() * 1.2}s`,
        "--delay": `${Math.random() * 0.35}s`,
      } as CSSProperties,
    })),
  );
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-0 overflow-visible" aria-hidden data-testid="confetti">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="animate-confetti absolute top-0 block opacity-0"
          style={{
            ...p.style,
            left: p.left,
            width: p.w,
            height: p.h,
            background: p.color,
            borderRadius: p.round ? 9999 : 2,
          }}
        />
      ))}
    </div>
  );
}
