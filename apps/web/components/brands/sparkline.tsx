/** Tiny monthly mentions chart. Last point = this month. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values);
  const w = 96;
  const h = 24;
  const step = w / Math.max(1, values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-24 overflow-visible" role="img" aria-label={label}>
      <polyline points={points.join(" ")} fill="none" className="stroke-go" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) =>
        v > 0 ? <circle key={i} cx={i * step} cy={h - 2 - (v / max) * (h - 4)} r="1.8" className="fill-go" /> : null,
      )}
    </svg>
  );
}
