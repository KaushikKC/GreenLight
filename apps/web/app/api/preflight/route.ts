import { NextResponse } from "next/server";

import { createPreflight, getPreflightForUser } from "@/lib/preflight";
import { createPreflightInput, ownsKey } from "@/lib/preflight-schema";
import { uploadLimits } from "@/lib/rules";
import { getOrCreateUserId } from "@/lib/session";
import { objectSize } from "@/lib/storage";

/** Step 2 of an upload: register the uploaded video and queue the analysis. */
export async function POST(request: Request) {
  const parsed = createPreflightInput.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const userId = await getOrCreateUserId();
  if (!ownsKey(userId, parsed.data.key)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const size = await objectSize(parsed.data.key);
  if (size === null) {
    return NextResponse.json(
      { error: "not_uploaded", message: "The upload didn't finish. Try again." },
      { status: 409 },
    );
  }
  if (size > uploadLimits().maxBytes) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  if (parsed.data.parentId) {
    const parent = await getPreflightForUser(parsed.data.parentId, userId);
    if (!parent) {
      return NextResponse.json({ error: "parent_not_found" }, { status: 404 });
    }
  }

  const preflight = await createPreflight(userId, parsed.data, size);
  return NextResponse.json({ id: preflight.id }, { status: 201 });
}
