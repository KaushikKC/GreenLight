import Link from "next/link";
import type { ReactNode } from "react";

/** Wordmark: a tiny traffic light where only the green lamp is lit. */
export function SiteHeader({ children, wide = false }: { children?: ReactNode; wide?: boolean }) {
  return (
    <header
      className={`mx-auto flex w-full items-center justify-between gap-3 px-4 py-4 ${wide ? "max-w-6xl" : "max-w-md md:max-w-5xl"}`}
    >
      <Link href="/" className="group flex items-center gap-2" aria-label="Greenlight home">
        <span
          className="flex flex-col gap-[3px] rounded-lg border-2 border-ink bg-ink px-[5px] py-[5px] shadow-[2px_2px_0_0_var(--pink)] transition group-hover:-rotate-6"
          aria-hidden
        >
          <span className="size-[7px] rounded-full bg-stop/60" />
          <span className="size-[7px] rounded-full bg-sun/50" />
          <span className="size-[7px] rounded-full bg-lime shadow-[0_0_8px] shadow-lime" />
        </span>
        <span className="font-display text-xl font-extrabold tracking-tight">Greenlight</span>
      </Link>
      {children}
    </header>
  );
}
