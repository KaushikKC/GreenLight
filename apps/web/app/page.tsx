import Link from "next/link";

import { JobRunner } from "@/components/dev/job-runner";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-5 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Greenlight</h1>
        <p className="text-muted-foreground">
          The pre-flight check for creator ads.
        </p>
      </header>

      <Button asChild size="lg" className="h-12">
        <Link href="/preflight/new">Check a draft video</Link>
      </Button>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Queue smoke test
        </h2>
        <JobRunner />
      </section>
    </main>
  );
}
