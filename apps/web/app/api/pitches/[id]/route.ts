import { NextResponse } from "next/server";
import { z } from "zod";

import { getPitchForUser } from "@/lib/brands-server";
import { getUserId } from "@/lib/session";

export async function GET(_request: Request, ctx: RouteContext<"/api/pitches/[id]">) {
  const { id } = await ctx.params;
  const userId = await getUserId();
  if (!userId || !z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const pitch = await getPitchForUser(id, userId);
  if (!pitch) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(pitch, { headers: { "cache-control": "no-store" } });
}
