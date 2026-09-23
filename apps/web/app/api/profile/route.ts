import { NextResponse } from "next/server";

import { profileInput } from "@/lib/brand-schema";
import { saveProfile } from "@/lib/brands-server";
import { getOrCreateUserId } from "@/lib/session";

/** Creator profile used in pitches (niche, audience, optional follower count). */
export async function PUT(request: Request) {
  const parsed = profileInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  await saveProfile(await getOrCreateUserId(), parsed.data);
  return NextResponse.json(parsed.data);
}
