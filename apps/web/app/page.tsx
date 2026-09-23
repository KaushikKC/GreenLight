import { ArrowRight, BadgeCheck, Heart, ScanLine, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { AppNav } from "@/components/app-nav";
import { SiteHeader } from "@/components/site-header";

const VIBES = [
  "🎬 Hook in 1.5s",
  "📱 9:16",
  "🟩 Safe zones",
  "💬 Captions",
  "#ad ✔",
  "🔊 −14 LUFS",
  "✨ Brief points",
  "🗂️ Usage rights",
  "🤝 Whitelisting",
  "🚫 Exclusivity",
  "🎁 Gifting",
  "💸 Affiliate",
  "💖 Brands you love",
];

const FEATURES = [
  {
    href: "/preflight/new",
    icon: ScanLine,
    title: "Preflight",
    kicker: "Ready to run?",
    body: "Score your draft like a brand would: hook, safe zones, captions, brief points, #ad, sound. Every flag comes with a timestamp and a fix.",
    cta: "Open Preflight",
    soft: "bg-lime-soft",
    solid: "bg-lime",
    pop: "var(--lime)",
    tilt: "-1.5deg",
  },
  {
    href: "/rights",
    icon: Wallet,
    title: "Rights Wallet",
    kicker: "Know what you signed",
    body: "Drop in a contract and see usage, whitelisting and exclusivity on one timeline, with reminders before anything ends.",
    cta: "Open Rights Wallet",
    soft: "bg-violet-soft",
    solid: "bg-violet",
    pop: "var(--violet)",
    tilt: "1deg",
  },
  {
    href: "/brands",
    icon: Heart,
    title: "Brands you already love",
    kicker: "Pitch with proof",
    body: "Find the brands you mention for free, then send a warm pitch built only from your real posts.",
    cta: "Find my brands",
    soft: "bg-pink-soft",
    solid: "bg-pink",
    pop: "var(--pink)",
    tilt: "-0.75deg",
  },
];

const STEPS = [
  { n: "1", title: "Drop your draft", body: "MP4 or MOV, straight from your camera roll. Add the brief if you have it.", color: "text-pink" },
  { n: "2", title: "Get your report", body: "About a minute later: a score, a timeline of issues and a numbered fix list.", color: "text-tangerine" },
  { n: "3", title: "Fix it and send it", body: "Re-check v2 to see what you fixed, then share a read-only link with the brand.", color: "text-violet" },
];

/** Decorative mini report, so the hero shows what you get. */
function ReportPreview() {
  const R = 38;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative mx-auto w-full max-w-[20rem]" aria-hidden>
      <div
        className="animate-float pop rounded-[2rem] bg-card p-5"
        style={{ "--pop": "var(--pink)", "--tilt": "2deg" } as CSSProperties}
      >
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 100 100" className="size-24 -rotate-90">
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--muted)" strokeWidth="11" />
            <circle
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke="var(--lime)"
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={`${0.97 * C} ${C}`}
            />
            <text
              x="50"
              y="50"
              className="rotate-90 fill-foreground font-display text-[28px] font-extrabold"
              style={{ transformOrigin: "50px 50px" }}
              textAnchor="middle"
              dominantBaseline="central"
            >
              97
            </text>
          </svg>
          <div>
            <span className="sticker bg-lime">Ready ✨</span>
            <p className="mt-2 font-display text-lg leading-tight font-bold">Good to send.</p>
            <p className="text-xs text-muted-foreground">5 issues fixed since v1</p>
          </div>
        </div>
        <ul className="mt-4 flex flex-col gap-2 text-sm">
          {[
            ["✅", "Product shows up at 0.5s"],
            ["✅", "Text clear of TikTok's caption bar"],
            ["⚠️", "One claim a brand may reject"],
          ].map(([icon, text]) => (
            <li key={text} className="flex items-center gap-2 rounded-xl bg-muted/70 px-3 py-2">
              <span>{icon}</span>
              {text}
            </li>
          ))}
        </ul>
      </div>
      <span
        className="sticker animate-float absolute -top-4 -left-3 bg-sun"
        style={{ "--tilt": "-8deg", animationDelay: "-1s" } as CSSProperties}
      >
        #ad found
      </span>
      <span
        className="sticker animate-float absolute -right-3 -bottom-4 bg-sky"
        style={{ "--tilt": "6deg", animationDelay: "-2.5s" } as CSSProperties}
      >
        🔊 −14 LUFS
      </span>
    </div>
  );
}

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div
        className="glow pointer-events-none absolute inset-x-0 top-0 h-[52rem] opacity-80 [mask-image:linear-gradient(to_bottom,black_60%,transparent)]"
        aria-hidden
      />
      <SiteHeader wide>
        <AppNav />
      </SiteHeader>

      <main className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 px-4 pt-6 pb-16">
        {/* Hero */}
        <section className="grid items-center gap-12 md:grid-cols-[1.15fr_1fr]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-2">
              <span className="sticker -rotate-2 bg-sun">✨ Made for creators</span>
              <span className="sticker rotate-1 bg-sky">🚫 No scraping</span>
              <span className="sticker -rotate-1 bg-lime">💸 Free to try</span>
            </div>
            <h1 className="text-[2.75rem] leading-[1.02] font-extrabold tracking-tight md:text-6xl">
              Get the <span className="text-rainbow whitespace-nowrap">green light</span> before the brand sees your
              draft.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              Greenlight checks your ad like a brand reviewer would, keeps your deals and rights in one
              place, and helps you pitch the brands you already love.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/preflight/new"
                className="pop pop-press inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-lime px-6 text-lg font-bold text-on-color"
              >
                Check a draft <ArrowRight className="size-5" />
              </Link>
              <Link
                href="/rights"
                className="pop-sm pop-press inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-card px-6 font-semibold"
                style={{ "--pop": "var(--violet)" } as CSSProperties}
              >
                <Wallet className="size-5" /> Rights Wallet
              </Link>
            </div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <BadgeCheck className="size-4 text-go" aria-hidden /> Every flag comes with evidence and a
              concrete fix.
            </p>
          </div>
          <ReportPreview />
        </section>

        {/* Vibes strip */}
        <div className="relative left-1/2 w-screen -translate-x-1/2 -rotate-1 overflow-hidden border-y-2 border-ink bg-ink py-3" aria-hidden>
          <div className="animate-marquee flex w-max gap-3">
            {[...VIBES, ...VIBES].map((v, i) => (
              <span
                key={i}
                className={`rounded-full px-3 py-1 text-sm font-bold text-on-color ${
                  ["bg-lime", "bg-pink", "bg-sun", "bg-sky", "bg-tangerine"][i % 5]
                }`}
              >
                {v}
              </span>
            ))}
          </div>
        </div>

        {/* Features */}
        <section className="flex flex-col gap-6" aria-labelledby="features-heading">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold tracking-widest text-muted-foreground uppercase">What you get</p>
            <h2 id="features-heading" className="text-4xl font-extrabold tracking-tight">
              Three tools, one creator toolkit.
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {FEATURES.map(({ href, icon: Icon, title, kicker, body, cta, soft, solid, pop, tilt }) => (
              <Link
                key={href}
                href={href}
                className={`pop pop-press group flex flex-col gap-4 rounded-3xl p-6 ${soft}`}
                style={{ "--pop": pop, transform: `rotate(${tilt})` } as CSSProperties}
              >
                <span className={`flex size-12 items-center justify-center rounded-2xl border-2 border-ink ${solid}`}>
                  <Icon className="size-6 text-on-color" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-bold text-muted-foreground">{kicker}</p>
                  <h3 className="text-2xl font-extrabold tracking-tight">{title}</h3>
                </div>
                <p className="flex-1 text-[15px] leading-relaxed">{body}</p>
                <span className="inline-flex items-center gap-1 font-bold">
                  {cta} <ArrowRight className="size-4 transition group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="flex flex-col gap-6" aria-labelledby="how-heading">
          <h2 id="how-heading" className="text-4xl font-extrabold tracking-tight">
            How Preflight works
          </h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="pop-sm rounded-3xl bg-card p-6">
                <span className={`font-display text-6xl leading-none font-extrabold ${s.color}`}>{s.n}</span>
                <h3 className="mt-3 text-xl font-bold">{s.title}</h3>
                <p className="mt-1 text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Promises */}
        <section className="grid gap-4 md:grid-cols-3">
          {[
            [Sparkles, "Evidence, not vibes", "Every flag shows the frame, quote or clause behind it."],
            [ShieldCheck, "Your content stays yours", "Videos auto-delete after 7 days. We never post or send for you."],
            [Heart, "Pitch what you love", "Pitches only cite posts where you genuinely used the brand."],
          ].map(([Icon, title, body]) => {
            const I = Icon as typeof Sparkles;
            return (
              <div key={title as string} className="flex gap-3 rounded-3xl bg-muted/60 p-5">
                <I className="mt-0.5 size-5 shrink-0 text-pink" aria-hidden />
                <div>
                  <p className="font-bold">{title as string}</p>
                  <p className="text-sm text-muted-foreground">{body as string}</p>
                </div>
              </div>
            );
          })}
        </section>

        {/* CTA band */}
        <section
          className="pop relative overflow-hidden rounded-[2rem] bg-[linear-gradient(120deg,var(--sun),var(--tangerine)_45%,var(--pink))] px-6 py-10 text-on-color md:px-12"
          style={{ "--pop": "var(--ink)" } as CSSProperties}
        >
          <p className="text-sm font-bold tracking-widest uppercase">Your next brand deal</p>
          <h2 className="mt-2 max-w-2xl text-4xl font-extrabold tracking-tight">
            Send drafts that come back with &ldquo;approved&rdquo;, not &ldquo;one more round&rdquo;.
          </h2>
          <Link
            href="/preflight/new"
            className="mt-6 inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-ink bg-ink px-5 font-bold text-paper transition hover:-translate-y-0.5"
          >
            Start a check <ArrowRight className="size-4" />
          </Link>
        </section>
      </main>
    </div>
  );
}
