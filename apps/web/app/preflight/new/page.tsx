import type { Metadata } from "next";
import { z } from "zod";

import { UploadForm } from "@/components/preflight/upload-form";
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
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-2 pb-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">
            {defaults ? "Re-check your draft" : "Check a draft"}
          </h1>
          <p className="text-muted-foreground">
            {defaults
              ? "Upload the new version. We'll keep your brief and show what you fixed."
              : "Upload your ad draft and we'll tell you what to fix before the brand sees it."}
          </p>
        </header>
        <UploadForm maxBytes={maxBytes} maxDurationS={maxDurationS} defaults={defaults} />
      </main>
    </>
  );
}
