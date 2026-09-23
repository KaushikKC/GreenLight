import { ArrowRight, Clock, Heart, Link2, ScanLine, Wallet } from "lucide-react";
import Link from "next/link";

import { SiteHeader } from "@/components/site-header";

const POINTS = [
  { icon: ScanLine, title: "Checks what brands send back", body: "Hook, safe zones, captions, brief points, disclosure and audio." },
  { icon: Clock, title: "Every flag has a timestamp", body: "Tap an issue to jump straight to it, with a concrete fix." },
  { icon: Link2, title: "Share the report", body: "Send a read-only link to the brand or agency with your draft." },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 pt-6 pb-12">
        <section className="flex flex-col gap-4">
          <h1 className="text-[40px] leading-[1.05] font-bold tracking-tight">
            Know your ad is ready <span className="bg-highlight px-1 text-ink">before</span> the brand
            sees it.
          </h1>
          <p className="text-lg text-muted-foreground">
            Upload a draft and get a timestamped pre-flight report in about a minute.
          </p>
          <Link
            href="/preflight/new"
            className="mt-2 inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-ink text-lg font-semibold text-paper"
          >
            Check a draft <ArrowRight className="size-5" />
          </Link>
          <Link
            href="/rights"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border bg-card font-semibold"
          >
            <Wallet className="size-4" /> Rights Wallet
          </Link>
          <Link
            href="/brands"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border bg-card font-semibold"
          >
            <Heart className="size-4" /> Brands you already love
          </Link>
        </section>
        <ul className="flex flex-col gap-3">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3 rounded-2xl border bg-card p-4">
              <Icon className="mt-0.5 size-5 shrink-0 text-go" aria-hidden />
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
