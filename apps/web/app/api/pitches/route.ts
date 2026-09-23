import { NextResponse } from "next/server";

import { pitchInput } from "@/lib/brand-schema";
import { createPitch, hasOrganicMention } from "@/lib/brands-server";
import { getUserId } from "@/lib/session";

/** Queue a pitch draft for a brand the creator genuinely mentions. Never sent. */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const parsed = pitchInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  if (!(await hasOrganicMention(userId, parsed.data.brand))) {
    return NextResponse.json(
      { error: "no_evidence", message: "Pitches need at least one organic (unsponsored) post about the brand." },
      { status: 422 },
    );
  }
  const pitch = await createPitch(userId, parsed.data);
  return NextResponse.json({ id: pitch.id }, { status: 201 });
}
