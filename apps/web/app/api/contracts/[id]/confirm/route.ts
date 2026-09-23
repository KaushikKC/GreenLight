import { NextResponse } from "next/server";
import { z } from "zod";

import { confirmContractInput } from "@/lib/contract-schema";
import { AlreadyConfirmedError, confirmContract, getContractForUser } from "@/lib/contracts";
import { getUserId } from "@/lib/session";

/** The creator has checked the extracted terms: create the deal and its windows. */
export async function POST(request: Request, ctx: RouteContext<"/api/contracts/[id]/confirm">) {
  const { id } = await ctx.params;
  const userId = await getUserId();
  if (!userId || !z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const contract = await getContractForUser(id, userId);
  if (!contract) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const parsed = confirmContractInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: "invalid_body", message: issue?.message, path: issue?.path, issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const dealId = await confirmContract(contract, parsed.data);
    return NextResponse.json({ dealId }, { status: 201 });
  } catch (e) {
    if (e instanceof AlreadyConfirmedError) {
      return NextResponse.json({ error: "already_confirmed" }, { status: 409 });
    }
    throw e;
  }
}
