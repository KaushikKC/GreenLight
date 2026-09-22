import Link from "next/link";
import type { ReactNode } from "react";

/** Wordmark: a tiny traffic light where only the green lamp is lit. */
export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-4">
      <Link href="/" className="flex items-center gap-2" aria-label="Greenlight home">
        <span className="flex flex-col gap-[3px] rounded-md bg-ink px-[5px] py-[5px]" aria-hidden>
          <span className="size-[7px] rounded-full bg-paper/20" />
          <span className="size-[7px] rounded-full bg-paper/20" />
          <span className="size-[7px] rounded-full bg-highlight shadow-[0_0_8px] shadow-highlight" />
        </span>
        <span className="font-display text-xl font-bold tracking-tight">Greenlight</span>
      </Link>
      {children}
    </header>
  );
}
