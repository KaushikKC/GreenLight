import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { contractKey, contractUploadRequest } from "@/lib/contract-schema";
import { getOrCreateUserId } from "@/lib/session";
import { presignUpload } from "@/lib/storage";

/** Presigned PUT for a contract PDF/DOCX. */
export async function POST(request: Request) {
  const parsed = contractUploadRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", message: "Upload a PDF or Word (.docx) file under 20 MB." },
      { status: 400 },
    );
  }
  const userId = await getOrCreateUserId();
  const key = contractKey(userId, randomUUID(), parsed.data.contentType);
  return NextResponse.json({ key, url: await presignUpload(key, parsed.data.contentType) });
}
