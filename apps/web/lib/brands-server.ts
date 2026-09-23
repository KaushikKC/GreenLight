import "server-only";

import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

import { db, schema } from "@/db";

import type { Mention } from "./brands";
import type { ProfileInput } from "./brand-schema";
import type { ImportedPost } from "./post-import";

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Insert new posts (duplicate URLs are ignored) and queue a scan if needed. */
export async function importPosts(
  userId: string,
  posts: ImportedPost[],
  source: "manual" | "csv",
): Promise<{ imported: number; duplicates: number }> {
  if (posts.length === 0) return { imported: 0, duplicates: 0 };
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.posts)
      .values(
        posts.map((p) => ({
          userId,
          url: p.url,
          platform: p.platform,
          postedAt: p.postedAt ? new Date(`${p.postedAt}T12:00:00Z`) : null,
          caption: p.caption,
          source,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: schema.posts.id });
    if (inserted.length > 0) {
      await tx.insert(schema.jobs).values({ type: "brands_scan", refId: userId });
    }
    return { imported: inserted.length, duplicates: posts.length - inserted.length };
  });
}

export type ScanStatus = {
  posts: number;
  unscanned: number;
  state: "idle" | "scanning" | "error";
  error: string | null;
};

export async function scanStatus(userId: string): Promise<ScanStatus> {
  const [[totals], [job]] = await Promise.all([
    db
      .select({
        posts: count(),
        unscanned: sql<number>`count(*) filter (where ${schema.posts.scannedAt} is null)`.mapWith(Number),
      })
      .from(schema.posts)
      .where(eq(schema.posts.userId, userId)),
    db
      .select({ status: schema.jobs.status, error: schema.jobs.error })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.type, "brands_scan"), eq(schema.jobs.refId, userId)))
      .orderBy(desc(schema.jobs.createdAt))
      .limit(1),
  ]);
  const active = job && (job.status === "queued" || job.status === "running");
  return {
    posts: totals.posts,
    unscanned: totals.unscanned,
    state: active ? "scanning" : job?.status === "error" ? "error" : "idle",
    error: job?.status === "error" ? job.error : active ? job.error : null,
  };
}

export async function loadMentions(userId: string): Promise<Mention[]> {
  const rows = await db
    .select({
      id: schema.brandMentions.id,
      postId: schema.brandMentions.postId,
      brand: schema.brandMentions.brandCanonical,
      brandRaw: schema.brandMentions.brandRaw,
      product: schema.brandMentions.product,
      modality: schema.brandMentions.modality,
      sentiment: schema.brandMentions.sentiment,
      isSponsored: schema.brandMentions.isSponsored,
      evidence: schema.brandMentions.evidence,
      confidence: schema.brandMentions.confidence,
      postedAt: schema.posts.postedAt,
      postUrl: schema.posts.url,
      platform: schema.posts.platform,
    })
    .from(schema.brandMentions)
    .innerJoin(schema.posts, eq(schema.posts.id, schema.brandMentions.postId))
    .where(eq(schema.posts.userId, userId));
  return rows.map((r) => ({ ...r, postedAt: isoDate(r.postedAt) }));
}

export async function getProfile(userId: string) {
  const [u] = await db
    .select({
      handle: schema.users.handle,
      niche: schema.users.niche,
      audience: schema.users.audience,
      followers: schema.users.followers,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return u ?? { handle: null, niche: null, audience: null, followers: null };
}

export async function saveProfile(userId: string, p: ProfileInput) {
  await db.update(schema.users).set(p).where(eq(schema.users.id, userId));
}

/** True if the creator has at least one organic mention of the brand. */
export async function hasOrganicMention(userId: string, brand: string): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.brandMentions)
    .innerJoin(schema.posts, eq(schema.posts.id, schema.brandMentions.postId))
    .where(
      and(
        eq(schema.posts.userId, userId),
        eq(schema.brandMentions.brandCanonical, brand),
        eq(schema.brandMentions.isSponsored, false),
      ),
    );
  return row.n > 0;
}

export type Pitch = typeof schema.pitches.$inferSelect;

export async function createPitch(
  userId: string,
  input: { brand: string; ask: Pitch["ask"]; note: string | null },
): Promise<Pitch> {
  return db.transaction(async (tx) => {
    const [pitch] = await tx
      .insert(schema.pitches)
      .values({ userId, brandCanonical: input.brand, ask: input.ask, note: input.note })
      .returning();
    await tx.insert(schema.jobs).values({ type: "pitch", refId: pitch.id });
    return pitch;
  });
}

export async function getPitchForUser(id: string, userId: string) {
  const [pitch] = await db
    .select()
    .from(schema.pitches)
    .where(and(eq(schema.pitches.id, id), eq(schema.pitches.userId, userId)))
    .limit(1);
  if (!pitch) return undefined;
  const posts = pitch.evidencePostIds.length
    ? await db
        .select({
          id: schema.posts.id,
          url: schema.posts.url,
          caption: schema.posts.caption,
          postedAt: schema.posts.postedAt,
          platform: schema.posts.platform,
        })
        .from(schema.posts)
        .where(inArray(schema.posts.id, pitch.evidencePostIds))
    : [];
  return {
    id: pitch.id,
    brand: pitch.brandCanonical,
    status: pitch.status,
    ask: pitch.ask,
    subject: pitch.subject,
    body: pitch.body,
    claims: (pitch.claims ?? []) as { text: string; post_ids: string[] }[],
    error: pitch.error,
    posts: posts.map((p) => ({ ...p, postedAt: isoDate(p.postedAt) })),
  };
}
export type PitchDto = NonNullable<Awaited<ReturnType<typeof getPitchForUser>>>;
