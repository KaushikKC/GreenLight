import Link from "next/link";

import type { WalletDeal } from "@/lib/contracts";
import { formatMoney, type RightsWindow } from "@/lib/rights";
import { CATEGORY_LABELS } from "@/lib/rights-config";

const KIND = { usage: "Usage", whitelisting: "Whitelisting", exclusivity: "Exclusivity" } as const;

export function DealsList({ deals, windows }: { deals: WalletDeal[]; windows: RightsWindow[] }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="deals-heading">
      <h2 id="deals-heading" className="text-xl font-semibold">
        Deals
      </h2>
      <ul className="flex flex-col gap-3">
        {deals.map((d) => (
          <li key={d.id} className="rounded-2xl border bg-card p-4" data-testid="deal">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-lg font-semibold">{d.brand}</p>
                <p className="text-sm text-muted-foreground">
                  {[CATEGORY_LABELS[d.category ?? ""], d.campaign].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatMoney(d.feeAmount, d.feeCurrency) || "No fee"}</p>
                <p className={`text-xs ${d.paid ? "text-go" : "text-muted-foreground"}`}>
                  {d.paid ? "Paid" : d.paymentDueAt ? `Due ${d.paymentDueAt}` : "Unpaid"}
                </p>
              </div>
            </div>
            <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {windows
                .filter((w) => w.dealId === d.id)
                .map((w) => (
                  <li key={w.id} className="rounded-full bg-muted px-2 py-0.5">
                    {KIND[w.kind]}
                    {w.scope ? ` (${w.scope})` : ""}: {w.perpetual ? "forever" : `until ${w.endsAt}`}
                  </li>
                ))}
            </ul>
            {d.contractId && (
              <Link href={`/rights/${d.contractId}/review`} className="mt-3 inline-block text-xs font-semibold underline underline-offset-4">
                View contract
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
