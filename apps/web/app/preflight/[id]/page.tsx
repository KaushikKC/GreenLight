import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AppNav } from "@/components/app-nav";
import { ReportView } from "@/components/report/report-view";
import { SiteHeader } from "@/components/site-header";
import { getPreflightForUser, toPreflightDto } from "@/lib/preflight";
import { getUserId } from "@/lib/session";

export const metadata: Metadata = { title: "Preflight report · Greenlight" };

export default async function PreflightPage(props: PageProps<"/preflight/[id]">) {
  const { id } = await props.params;
  const userId = await getUserId();
  if (!userId || !z.uuid().safeParse(id).success) notFound();
  const preflight = await getPreflightForUser(id, userId);
  if (!preflight) notFound();

  return (
    <>
      <SiteHeader>
        <AppNav active="preflight" />
      </SiteHeader>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-2 pb-6">
        <ReportView initial={await toPreflightDto(preflight)} />
      </main>
    </>
  );
}
