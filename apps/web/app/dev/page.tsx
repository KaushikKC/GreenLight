import { JobRunner } from "@/components/dev/job-runner";

export const metadata = { title: "Queue smoke test · Greenlight" };

/** Phase 0 smoke test: enqueue a no-op job and watch the worker finish it. */
export default function DevPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-10">
      <h1 className="text-2xl font-semibold">Queue smoke test</h1>
      <JobRunner />
    </main>
  );
}
