"use client";

import { Banknote, CalendarClock, OctagonAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Alert } from "@/lib/rights";

const ICON = {
  overdue: Banknote,
  due_soon: Banknote,
  conflict: OctagonAlert,
  expiring: CalendarClock,
};

export function Alerts({ alerts }: { alerts: Alert[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function markPaid(dealId: string) {
    setBusy(dealId);
    await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paid: true }),
    });
    router.refresh();
    setBusy(null);
  }

  if (alerts.length === 0) {
    return (
      <p className="rounded-2xl bg-go-soft px-4 py-3 text-sm font-medium text-go" data-testid="no-alerts">
        Nothing needs your attention right now.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" aria-label="Alerts" data-testid="alerts">
      {alerts.map((a, i) => {
        const Icon = ICON[a.kind];
        return (
          <li
            key={`${a.kind}-${a.dealId}-${i}`}
            className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ${
              a.severity === "high" ? "bg-stop-soft" : "bg-wait-soft"
            }`}
            data-testid="alert"
            data-kind={a.kind}
          >
            <Icon className={`mt-0.5 size-4 shrink-0 ${a.severity === "high" ? "text-stop" : "text-wait"}`} aria-hidden />
            <span className="flex-1 font-medium">{a.title}</span>
            {(a.kind === "overdue" || a.kind === "due_soon") && (
              <button
                type="button"
                onClick={() => markPaid(a.dealId)}
                disabled={busy === a.dealId}
                className="shrink-0 rounded-full border border-current/20 bg-card px-2.5 py-1 text-xs font-semibold"
              >
                {busy === a.dealId ? "…" : "Mark paid"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
