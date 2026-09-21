import { NextResponse } from "next/server";

import { createJob, createJobInput, listRecentJobs, toJobDto } from "@/lib/jobs";

export async function GET() {
  const jobs = await listRecentJobs();
  return NextResponse.json({ jobs: jobs.map(toJobDto) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createJobInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const job = await createJob(parsed.data);
  return NextResponse.json({ job: toJobDto(job) }, { status: 201 });
}
