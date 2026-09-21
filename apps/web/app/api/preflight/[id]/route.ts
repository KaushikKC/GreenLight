import { NextResponse } from "next/server";
import { z } from "zod";

import { getPreflightForUser, toPreflightDto } from "@/lib/preflight";
import { getUserId } from "@/lib/session";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/preflight/[id]">,
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
  return NextResponse.json(await toPreflightDto(preflight), {
    headers: { "cache-control": "no-store" },
  });
}
