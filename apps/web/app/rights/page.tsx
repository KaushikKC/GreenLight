import { CalendarPlus, FilePlus2, LoaderCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHero } from "@/components/page-hero";
import { Alerts } from "@/components/rights/alerts";
import { DealChecker } from "@/components/rights/deal-checker";
import { DealsList } from "@/components/rights/deals-list";
import { RightsTimeline } from "@/components/rights/timeline";
import { loadWallet } from "@/lib/contracts";
import { buildAlerts, todayIso } from "@/lib/rights";
import { ALERT_CONFIG } from "@/lib/rights-config";
import { getUserId } from "@/lib/session";
import { buildTimeline } from "@/lib/timeline";

export const metadata: Metadata = { title: "Rights Wallet · Greenlight" };

const PENDING_LABEL = {
  extracting: "Reading…",
  needs_review: "Ready to check",
  error: "Couldn't read",
  confirmed: "Saved",
} as const;

export default async function WalletPage() {
  const userId = await getUserId();
  const wallet = userId ? await loadWallet(userId) : { deals: [], windows: [], pending: [] };
  const today = todayIso();
  const alerts = buildAlerts(wallet.deals, wallet.windows, today, ALERT_CONFIG);
  const timeline = buildTimeline(wallet.deals, wallet.windows, today);
  const empty = wallet.deals.length === 0;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-2 pb-6 md:max-w-3xl">
      <header className="flex flex-col gap-3">
        <PageHero feature="rights" title="Rights Wallet">
          Every deal&apos;s usage, whitelisting and exclusivity in one place, with reminders before
          anything ends.
        </PageHero>
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/rights/new"
            className="pop-sm pop-press inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-violet font-bold text-on-color"
          >
            <FilePlus2 className="size-4" /> Add contract
          </Link>
          <a
            href="/api/rights/calendar.ics"
            className={`pop-sm pop-press inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-sun font-bold text-on-color ${
              empty ? "pointer-events-none opacity-50" : ""
            }`}
            aria-disabled={empty}
            data-testid="ics-export"
          >
            <CalendarPlus className="size-4" /> Export .ics
          </a>
        </div>
      </header>

      {wallet.pending.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Contracts in progress">
          {wallet.pending.map((p) => (
            <Link
              key={p.id}
              href={`/rights/${p.id}/review`}
              className="flex items-center justify-between rounded-2xl border border-dashed bg-card px-4 py-3 text-sm"
              data-testid="pending-contract"
            >
              <span className="truncate font-medium">{p.filename ?? "Pasted contract"}</span>
              <span
                className={`flex shrink-0 items-center gap-1.5 text-xs font-semibold ${
                  p.status === "error" ? "text-stop" : p.status === "needs_review" ? "text-go" : "text-muted-foreground"
                }`}
              >
                {p.status === "extracting" && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
                {PENDING_LABEL[p.status]}
              </span>
            </Link>
          ))}
        </section>
      )}

      {empty ? (
        <section className="pop rounded-[2rem] bg-violet-soft p-6 text-center" style={{ "--pop": "var(--violet)" } as React.CSSProperties}>
          <p className="font-display text-2xl font-extrabold">No deals yet 🗂️</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a contract (or paste the deal email) and we&apos;ll track its dates for you.
          </p>
        </section>
      ) : (
        <>
          <Alerts alerts={alerts} />
          <RightsTimeline timeline={timeline} />
          <DealChecker windows={wallet.windows} today={today} />
          <DealsList deals={wallet.deals} windows={wallet.windows} />
        </>
      )}
    </main>
  );
}
