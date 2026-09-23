"use client";

import { Quote } from "lucide-react";
import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";

export function QuoteButton({ quote, onQuote }: { quote: string | null; onQuote: (q: string) => void }) {
  if (!quote) return null;
  return (
    <button
      type="button"
      onClick={() => onQuote(quote)}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium hover:bg-secondary"
      title={quote}
      data-testid="quote-button"
    >
      <Quote className="size-3" aria-hidden />
      Source
    </button>
  );
}

export function Field({
  label,
  htmlFor,
  quote,
  onQuote,
  confidence,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  quote?: string | null;
  onQuote?: (q: string) => void;
  confidence?: number;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
          {confidence !== undefined && confidence < 0.7 && (
            <span className="ml-2 rounded-full bg-wait-soft px-1.5 py-0.5 text-[11px] font-semibold text-wait">
              check this
            </span>
          )}
        </label>
        {onQuote && <QuoteButton quote={quote ?? null} onQuote={onQuote} />}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function DateInput({
  id,
  value,
  onChange,
  invalid,
}: {
  id?: string;
  value: string | null;
  onChange: (v: string | null) => void;
  invalid?: boolean;
}) {
  return (
    <Input
      id={id}
      type="date"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      aria-invalid={invalid || undefined}
      className={invalid ? "border-wait ring-2 ring-wait/40" : ""}
    />
  );
}

export const listToText = (v: string[]) => v.join(", ");
export const textToList = (v: string) =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
