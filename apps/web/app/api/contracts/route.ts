import { NextResponse } from "next/server";

import { createContractInput, MAX_CONTRACT_BYTES, ownsContractKey } from "@/lib/contract-schema";
import { createContract } from "@/lib/contracts";
import { checkLimit, limitResponse } from "@/lib/limits-server";
import { getOrCreateUserId } from "@/lib/session";
import { objectSize } from "@/lib/storage";

/** Paste text, or register an uploaded file, and queue extraction. */
export async function POST(request: Request) {
  const parsed = createContractInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", message: parsed.error.issues[0]?.message, issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const userId = await getOrCreateUserId();
  if (parsed.data.source !== "text") {
    if (!ownsContractKey(userId, parsed.data.key)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const size = await objectSize(parsed.data.key);
    if (size === null) {
      return NextResponse.json(
        { error: "not_uploaded", message: "The upload didn't finish. Try again." },
        { status: 409 },
      );
    }
    if (size > MAX_CONTRACT_BYTES) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }
  }
  const limit = await checkLimit(userId, "contracts");
  if (!limit.ok) return limitResponse(limit);
  const contract = await createContract(userId, parsed.data);
  return NextResponse.json({ id: contract.id }, { status: 201 });
}
