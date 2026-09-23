import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ReviewView } from "@/components/rights/review-view";
import { getContractForUser, toContractDto } from "@/lib/contracts";
import { getUserId } from "@/lib/session";

export const metadata: Metadata = { title: "Check contract terms · Greenlight" };

export default async function ReviewPage(props: PageProps<"/rights/[id]/review">) {
  const { id } = await props.params;
  const userId = await getUserId();
  if (!userId || !z.uuid().safeParse(id).success) notFound();
  const contract = await getContractForUser(id, userId);
  if (!contract) notFound();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-2 pb-6 md:max-w-5xl">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Check the terms</h1>
        <p className="text-muted-foreground">
          Tap <span className="font-semibold">Source</span> to see the exact wording. Fix anything that&apos;s wrong, then save.
        </p>
      </header>
      <ReviewView initial={await toContractDto(contract)} />
    </main>
  );
}
