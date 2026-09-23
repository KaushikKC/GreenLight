import { NextResponse } from "next/server";
import { z } from "zod";

import { setDealPaid } from "@/lib/contracts";
import { getUserId } from "@/lib/session";

const patchInput = z.object({ paid: z.boolean() });

/** Mark a deal's payment as received (or not). */
export async function PATCH(request: Request, ctx: RouteContext<"/api/deals/[id]">) {
  const { id } = await ctx.params;
  const userId = await getUserId();
  const parsed = patchInput.safeParse(await request.json().catch(() => null));
  if (!userId || !z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const ok = await setDealPaid(id, userId, parsed.data.paid);
  return ok
    ? NextResponse.json({ id, paid: parsed.data.paid })
    : NextResponse.json({ error: "not_found" }, { status: 404 });
}
