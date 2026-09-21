import { NextResponse } from "next/server";
import { z } from "zod";

import { getJob, toJobDto } from "@/lib/jobs";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/jobs/[id]">,
) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ job: toJobDto(job) });
}
