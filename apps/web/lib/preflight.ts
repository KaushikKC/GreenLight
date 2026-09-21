import "server-only";

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db";

import type { CreatePreflightInput } from "./preflight-schema";
import { presignRead } from "./storage";

export type Preflight = typeof schema.preflights.$inferSelect;

/** Video row + preflight row + queued job, all or nothing. */
export async function createPreflight(
  userId: string,
  input: CreatePreflightInput,
  sizeBytes: number,
): Promise<Preflight> {
  return db.transaction(async (tx) => {
    const [video] = await tx
      .insert(schema.videos)
      .values({
        userId,
        storageKey: input.key,
        filename: input.filename,
        sizeBytes,
      })
      .returning();
    const [preflight] = await tx
      .insert(schema.preflights)
      .values({
        userId,
        videoId: video.id,
        platform: input.platform,
        briefText: input.briefText,
        captionText: input.captionText,
        brandName: input.brandName,
      })
      .returning();
    await tx
      .insert(schema.jobs)
      .values({ type: "preflight", refId: preflight.id });
    return preflight;
  });
}

export async function getPreflightForUser(
  id: string,
  userId: string,
): Promise<Preflight | undefined> {
  const [row] = await db
    .select()
    .from(schema.preflights)
    .where(
      and(eq(schema.preflights.id, id), eq(schema.preflights.userId, userId)),
    )
    .limit(1);
  return row;
}

type Json = Record<string, unknown>;

/** Replace every storage key in the report with a short-lived signed URL. */
async function signReport(report: Json | null): Promise<Json | null> {
  if (!report || !Array.isArray(report.checks)) return report;
  const checks = await Promise.all(
    (report.checks as Json[]).map(async (check) => {
      const evidence = (check.evidence ?? {}) as Json;
      if (typeof evidence.frame_key !== "string") return check;
      return {
        ...check,
        evidence: {
          ...evidence,
          frame_url: await presignRead(evidence.frame_key),
        },
      };
    }),
  );
  return { ...report, checks };
}

async function signFrames(artifacts: Json | null) {
  const frames = (artifacts?.frames ?? []) as { t: number; key: string }[];
  return Promise.all(
    frames.map(async (f) => ({ t: f.t, url: await presignRead(f.key) })),
  );
}

export async function toPreflightDto(p: Preflight) {
  return {
    id: p.id,
    status: p.status,
    platform: p.platform,
    brandName: p.brandName,
    score: p.score,
    verdict: p.verdict,
    report: await signReport(p.report as Json | null),
    frames: await signFrames(p.artifacts as Json | null),
    createdAt: p.createdAt.toISOString(),
  };
}
export type PreflightDto = Awaited<ReturnType<typeof toPreflightDto>>;
