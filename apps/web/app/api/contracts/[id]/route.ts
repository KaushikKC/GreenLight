import { NextResponse } from "next/server";
import { z } from "zod";

import { getContractForUser, toContractDto } from "@/lib/contracts";
import { getUserId } from "@/lib/session";

export async function GET(_request: Request, ctx: RouteContext<"/api/contracts/[id]">) {
  const { id } = await ctx.params;
  const userId = await getUserId();
  if (!userId || !z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const contract = await getContractForUser(id, userId);
  if (!contract) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(await toContractDto(contract), { headers: { "cache-control": "no-store" } });
}
