import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ReportView } from "@/components/report/report-view";
import { SiteHeader } from "@/components/site-header";
import { getPreflightByShareToken, toPreflightDto } from "@/lib/preflight";

export const metadata: Metadata = {
  title: "Shared preflight report · Greenlight",
  robots: { index: false, follow: false },
};

/** Read-only report anyone with the link can open (e.g. the brand or agency). */
export default async function SharedReportPage(props: PageProps<"/r/[token]">) {
  const { token } = await props.params;
  if (!/^[\w-]{16,64}$/.test(token)) notFound();
  const preflight = await getPreflightByShareToken(token);
  if (!preflight || preflight.status !== "done") notFound();
  const dto = await toPreflightDto(preflight);

  return (
    <>
      <SiteHeader>
        <span className="rounded-full border px-2.5 py-1 text-xs font-semibold" data-testid="shared-badge">
          Shared report · read-only
        </span>
      </SiteHeader>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pt-2 pb-10">
        {dto.brandName && (
          <p className="text-sm text-muted-foreground">
            Draft for <span className="font-semibold text-foreground">{dto.brandName}</span>
          </p>
        )}
        <ReportView initial={{ ...dto, parent: null }} readOnly />
        <p className="text-center text-xs text-muted-foreground">
          Checked with{" "}
          <Link href="/" className="font-semibold underline underline-offset-4">
            Greenlight
          </Link>
          . Heuristic checks are marked &ldquo;estimate&rdquo;.
        </p>
      </main>
    </>
  );
}
