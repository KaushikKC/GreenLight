import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { uploadRequest, videoKey } from "@/lib/preflight-schema";
import { checkLimit, limitResponse } from "@/lib/limits-server";
import { uploadLimits } from "@/lib/rules";
import { getOrCreateUserId } from "@/lib/session";
import { presignUpload } from "@/lib/storage";

/** Step 1 of an upload: get a presigned PUT URL for the browser. */
export async function POST(request: Request) {
  const parsed = uploadRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: "Upload an MP4 or MOV video.",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const { maxBytes } = uploadLimits();
  if (parsed.data.sizeBytes > maxBytes) {
    return NextResponse.json(
      {
        error: "too_large",
        message: `Videos must be under ${Math.round(maxBytes / 1024 / 1024)} MB.`,
      },
      { status: 413 },
    );
  }

  const userId = await getOrCreateUserId();
  const limit = await checkLimit(userId, "preflights");
  if (!limit.ok) return limitResponse(limit);
  const key = videoKey(userId, randomUUID(), parsed.data.contentType);
  const url = await presignUpload(key, parsed.data.contentType);
  return NextResponse.json({ key, url });
}
