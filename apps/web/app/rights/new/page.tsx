import type { Metadata } from "next";

import { NewContractForm } from "@/components/rights/new-contract-form";

export const metadata: Metadata = { title: "Add a contract · Greenlight" };

export default function NewContractPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-2 pb-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Add a contract</h1>
        <p className="text-muted-foreground">
          We&apos;ll pull out the fee, dates, usage rights, whitelisting and exclusivity, with the exact
          wording each came from.
        </p>
      </header>
      <NewContractForm />
    </main>
  );
}
