import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { RawReport } from "@/components/preflight/raw-report";
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Preflight report</h1>
        <Link href="/preflight/new" className="text-sm underline underline-offset-4">
          New check
        </Link>
      </header>
      <RawReport initial={await toPreflightDto(preflight)} />
    </main>
  );
}
