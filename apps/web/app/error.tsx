"use client"; // Error boundaries must be Client Components

import { CircleAlert, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-start justify-center gap-4 px-4 py-16">
      <CircleAlert className="size-8 text-stop" aria-hidden />
      <h1 className="text-3xl font-bold tracking-tight">Something went wrong</h1>
      <p className="text-muted-foreground">
        That&apos;s on us, not you. Your uploads and reports are safe.
        {error.digest && <span className="mt-1 block font-mono text-xs">Reference: {error.digest}</span>}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex h-11 items-center gap-2 rounded-2xl bg-ink px-4 font-semibold text-paper"
        >
          <RotateCcw className="size-4" /> Try again
        </button>
        <Link href="/" className="inline-flex h-11 items-center rounded-2xl border bg-card px-4 font-semibold">
          Home
        </Link>
      </div>
    </main>
  );
}
