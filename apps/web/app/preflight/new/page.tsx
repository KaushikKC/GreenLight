import type { Metadata } from "next";

import { UploadForm } from "@/components/preflight/upload-form";
import { uploadLimits } from "@/lib/rules";

export const metadata: Metadata = { title: "New preflight · Greenlight" };

export default function NewPreflightPage() {
  const { maxBytes, maxDurationS } = uploadLimits();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Check a draft</h1>
        <p className="text-muted-foreground">
          Upload your ad draft and we&apos;ll tell you what to fix before the
          brand sees it.
        </p>
      </header>
      <UploadForm maxBytes={maxBytes} maxDurationS={maxDurationS} />
    </main>
  );
}
