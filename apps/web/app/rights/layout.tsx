import { AppNav } from "@/components/app-nav";
import { SiteHeader } from "@/components/site-header";
import { DISCLAIMER } from "@/lib/rights-config";

export default function RightsLayout({ children }: LayoutProps<"/rights">) {
  return (
    <>
      <SiteHeader>
        <AppNav active="rights" />
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
