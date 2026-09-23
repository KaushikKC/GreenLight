import { NextResponse } from "next/server";

import { scanStatus } from "@/lib/brands-server";
import { getUserId } from "@/lib/session";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ posts: 0, unscanned: 0, state: "idle", error: null });
  }
  return NextResponse.json(await scanStatus(userId), { headers: { "cache-control": "no-store" } });
}
