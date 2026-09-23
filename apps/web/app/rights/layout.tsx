import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { DISCLAIMER } from "@/lib/rights-config";

export default function RightsLayout({ children }: LayoutProps<"/rights">) {
  return (
    <>
      <SiteHeader>
        <nav className="flex items-center gap-3 text-sm font-semibold">
          <Link href="/rights" className="underline-offset-4 hover:underline">
            Wallet
          </Link>
          <Link href="/preflight/new" className="text-muted-foreground underline-offset-4 hover:underline">
            Preflight
          </Link>
        </nav>
      </SiteHeader>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer
        className="mx-auto w-full max-w-md px-4 py-6 text-center text-xs text-muted-foreground md:max-w-5xl"
        data-testid="rights-disclaimer"
      >
        {DISCLAIMER}
      </footer>
    </>
  );
}
