import Link from "next/link";

import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-start justify-center gap-4 px-4 py-16">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="text-3xl font-bold tracking-tight">We can&apos;t find that page</h1>
        <p className="text-muted-foreground">
          The link may be wrong, the report may belong to a different browser (Greenlight remembers you
          per device), or a shared link may have been mistyped.
        </p>
        <Link href="/" className="inline-flex h-11 items-center rounded-2xl bg-ink px-4 font-semibold text-paper">
          Go home
        </Link>
      </main>
    </>
  );
}
