import type { Metadata } from "next";

import { PageHero } from "@/components/page-hero";
import { NewContractForm } from "@/components/rights/new-contract-form";

export const metadata: Metadata = { title: "Add a contract · Greenlight" };

export default function NewContractPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-2 pb-6">
      <PageHero feature="rights" sticker="New contract" title="Add a contract">
        We&apos;ll pull out the fee, dates, usage rights, whitelisting and exclusivity, with the exact
        wording each came from.
      </PageHero>
      <NewContractForm />
    </main>
  );
}
