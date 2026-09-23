import type { Metadata } from "next";
import { z } from "zod";

import { UploadForm } from "@/components/preflight/upload-form";
import { AppNav } from "@/components/app-nav";
import { PageHero } from "@/components/page-hero";
import { SiteHeader } from "@/components/site-header";
import { getPreflightForUser, recheckDefaults } from "@/lib/preflight";
import { uploadLimits } from "@/lib/rules";
import { getUserId } from "@/lib/session";

export const metadata: Metadata = { title: "New preflight · Greenlight" };

async function loadRecheck(parent: string | string[] | undefined) {
  if (typeof parent !== "string" || !z.uuid().safeParse(parent).success) return undefined;
  const userId = await getUserId();
  if (!userId) return undefined;
  const p = await getPreflightForUser(parent, userId);
  return p ? recheckDefaults(p) : undefined;
}

export default async function NewPreflightPage(props: PageProps<"/preflight/new">) {
  const { parent } = await props.searchParams;
  const defaults = await loadRecheck(parent);
  const { maxBytes, maxDurationS } = uploadLimits();
  return (
    <>
      <SiteHeader>
        <AppNav active="preflight" />
      </SiteHeader>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-2 pb-10">
        <PageHero feature="preflight" sticker={defaults ? "Re-check" : "Preflight"} title={defaults ? "Re-check your draft" : "Check a draft"}>
          {defaults
            ? "Upload the new version. We'll keep your brief and show what you fixed."
            : "Upload your ad draft and we'll tell you what to fix before the brand sees it."}
        </PageHero>
        <UploadForm maxBytes={maxBytes} maxDurationS={maxDurationS} defaults={defaults} />
      </main>
    </>
  );
}
