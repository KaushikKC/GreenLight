import { NextResponse } from "next/server";

import { importInput } from "@/lib/brand-schema";
import { importPosts } from "@/lib/brands-server";
import { parseCsv, parsePasted } from "@/lib/post-import";
import { checkLimit, limitResponse } from "@/lib/limits-server";
import { getOrCreateUserId } from "@/lib/session";

/** Import the creator's own posts (paste or CSV) and queue a brand scan. */
export async function POST(request: Request) {
  const parsed = importInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }
  const { format, text } = parsed.data;
  const result = format === "csv" ? parseCsv(text) : parsePasted(text);
  if (result.posts.length === 0) {
    return NextResponse.json(
      {
        error: "no_posts",
        message:
          format === "csv"
            ? "No posts found. The CSV needs a `caption` column (and ideally `url`, `posted_at`)."
            : "No posts found. Put each post's link at the start of a line, followed by its caption.",
        skipped: result.skipped,
      },
      { status: 422 },
    );
  }
  const userId = await getOrCreateUserId();
  const limit = await checkLimit(userId, "posts", result.posts.length);
  if (!limit.ok) return limitResponse(limit);
  const saved = await importPosts(userId, result.posts, format === "csv" ? "csv" : "manual");
  return NextResponse.json({ ...saved, skipped: result.skipped.length }, { status: 201 });
}
