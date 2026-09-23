import type { Metadata } from "next";

import { AppNav } from "@/components/app-nav";
import { BrandCard } from "@/components/brands/brand-card";
import { ImportPanel } from "@/components/brands/import-panel";
import { ProfileCard } from "@/components/brands/profile-card";
import { ScanStatusBar } from "@/components/brands/scan-status";
import { SiteHeader } from "@/components/site-header";
import { rankBrands } from "@/lib/brands";
import { getProfile, loadMentions, scanStatus } from "@/lib/brands-server";
import { todayIso } from "@/lib/rights";
import { getUserId } from "@/lib/session";

export const metadata: Metadata = { title: "Brands You Already Love · Greenlight" };

export default async function BrandsPage() {
  const userId = await getUserId();
  const [mentions, profile, status] = userId
    ? await Promise.all([loadMentions(userId), getProfile(userId), scanStatus(userId)])
    : [[], { handle: null, niche: null, audience: null, followers: null }, { posts: 0, unscanned: 0, state: "idle" as const, error: null }];
  const { loved, pastPartners } = rankBrands(mentions, todayIso());

  return (
    <>
      <SiteHeader>
        <AppNav active="brands" />
      </SiteHeader>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-2 pb-10 md:max-w-2xl">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Brands you already love</h1>
          <p className="text-muted-foreground">
            The brands you mention on your own, ranked by how often, how recently and how warmly. Pitch
            them with your real posts as proof.
          </p>
        </header>

        <ScanStatusBar key={`${status.state}-${status.unscanned}-${status.posts}`} initial={status} />
        <ImportPanel open={status.posts === 0} />
        <ProfileCard initial={profile} />

        {status.posts > 0 && loved.length === 0 && status.state !== "scanning" && (
          <p className="rounded-2xl bg-muted px-4 py-3 text-sm">
            No brand mentions found in your {status.posts} posts yet. Try importing more.
          </p>
        )}

        {loved.length > 0 && (
          <section className="flex flex-col gap-3" aria-labelledby="loved-heading">
            <h2 id="loved-heading" className="text-xl font-semibold">
              Top brands ({loved.length})
            </h2>
            <ol className="flex flex-col gap-3">
              {loved.map((b, i) => (
                <BrandCard key={b.brand} b={b} rank={i + 1} />
              ))}
            </ol>
          </section>
        )}

        {pastPartners.length > 0 && (
          <section className="flex flex-col gap-2" aria-labelledby="partners-heading" data-testid="past-partners">
            <h2 id="partners-heading" className="text-xl font-semibold">
              Past partners
            </h2>
            <p className="text-sm text-muted-foreground">Only mentioned in sponsored or gifted posts, so not counted as love.</p>
            <ul className="flex flex-wrap gap-2">
              {pastPartners.map((b) => (
                <li key={b.brand} className="rounded-full border bg-card px-3 py-1 text-sm">
                  {b.brand} <span className="text-muted-foreground">· {b.sponsoredMentions}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
