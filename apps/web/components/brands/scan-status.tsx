"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { ScanStatus } from "@/lib/brands-server";

const POLL_MS = 2500;

/**
 * Shows scan progress and refreshes the page when the scan finishes.
 * The page keys this on the server status, so fresh data remounts it.
 */
export function ScanStatusBar({ initial }: { initial: ScanStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const scanning = status.state === "scanning";

  useEffect(() => {
    if (!scanning) return;
    const timer = setTimeout(async () => {
      const res = await fetch("/api/brands/status", { cache: "no-store" });
      if (!res.ok) return;
      const next: ScanStatus = await res.json();
      setStatus(next);
      if (next.state !== "scanning") router.refresh();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [status, scanning, router]);

  if (status.state === "error") {
    return (
      <p className="rounded-2xl bg-stop-soft px-4 py-3 text-sm" role="alert">
        The last scan stopped: {status.error ?? "something went wrong"}. Import again to retry.
      </p>
    );
  }
  if (!scanning) return null;
  return (
    <p className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-sm" aria-live="polite" data-testid="scanning">
      <LoaderCircle className="size-4 animate-spin text-go" aria-hidden />
      Finding brands in {status.unscanned} post{status.unscanned === 1 ? "" : "s"}…
      {status.error && <span className="text-muted-foreground"> (waiting: {status.error})</span>}
    </p>
  );
}
