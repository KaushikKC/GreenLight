import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureShareToken, getPreflightForUser } from "@/lib/preflight";
import { getUserId } from "@/lib/session";

/** Create (or return) the read-only public link for a finished report. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/preflight/[id]/share">,
) {
  const { id } = await ctx.params;
  const userId = await getUserId();
  if (!userId || !z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const preflight = await getPreflightForUser(id, userId);
  if (!preflight) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (preflight.status !== "done") {
    return NextResponse.json(
      { error: "not_ready", message: "Share the report once it's finished." },
      { status: 409 },
    );
  }
  const token = await ensureShareToken(preflight);
  const url = new URL(`/r/${token}`, request.url).toString();
  return NextResponse.json({ url });
}
