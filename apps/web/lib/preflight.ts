import "server-only";

import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db";

import type { CreatePreflightInput } from "./preflight-schema";
import type { Check, OcrBox, Region, Report, ReportFrame } from "./report-types";
import { safeZones } from "./rules";
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
        parentId: input.parentId,
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

export async function getPreflightByShareToken(
  token: string,
): Promise<Preflight | undefined> {
  const [row] = await db
    .select()
    .from(schema.preflights)
    .where(eq(schema.preflights.shareToken, token))
    .limit(1);
  return row;
}

/** Idempotent: returns the existing token if the report is already shared. */
export async function ensureShareToken(p: Preflight): Promise<string> {
  if (p.shareToken) return p.shareToken;
  const token = randomBytes(18).toString("base64url");
  const [row] = await db
    .update(schema.preflights)
    .set({ shareToken: token })
    .where(eq(schema.preflights.id, p.id))
    .returning({ shareToken: schema.preflights.shareToken });
  return row.shareToken!;
}

/** Fields the new-upload form pre-fills for a re-check. */
export function recheckDefaults(p: Preflight) {
  return {
    parentId: p.id,
    platform: p.platform,
    briefText: p.briefText ?? "",
    captionText: p.captionText ?? "",
    brandName: p.brandName ?? "",
  };
}

type Json = Record<string, unknown>;

/** Replace every storage key in the report with a short-lived signed URL. */
async function signReport(report: Json | null): Promise<Report | null> {
  if (!report) return null;
  if (!Array.isArray(report.checks)) return report as Report;
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
  return { ...report, checks } as Report;
}

async function signFrames(artifacts: Json | null): Promise<ReportFrame[]> {
  const frames = (artifacts?.frames ?? []) as {
    t: number;
    key: string;
    ocr?: OcrBox[];
  }[];
  return Promise.all(
    frames.map(async (f) => ({
      t: f.t,
      url: await presignRead(f.key),
      ocr: f.ocr ?? [],
    })),
  );
}

async function videoInfo(videoId: string): Promise<{ url: string | null; deleted: boolean }> {
  const [video] = await db
    .select({ key: schema.videos.storageKey, deletedAt: schema.videos.deletedAt })
    .from(schema.videos)
    .where(eq(schema.videos.id, videoId))
    .limit(1);
  if (!video) return { url: null, deleted: false };
  if (video.deletedAt) return { url: null, deleted: true };
  return { url: await presignRead(video.key), deleted: false };
}

/** After the 7-day auto-delete, frames are gone too: drop their links. */
function withoutFrames(report: Report | null): Report | null {
  if (!report?.checks) return report;
  return {
    ...report,
    checks: report.checks.map((c) => {
      if (typeof c.evidence.frame_key !== "string") return c;
      const evidence = Object.fromEntries(
        Object.entries(c.evidence).filter(([k]) => k !== "frame_key"),
      );
      return { ...c, evidence };
    }),
  };
}

async function parentSummary(p: Preflight) {
  if (!p.parentId) return null;
  const [parent] = await db
    .select()
    .from(schema.preflights)
    .where(
      and(
        eq(schema.preflights.id, p.parentId),
        eq(schema.preflights.userId, p.userId),
      ),
    )
    .limit(1);
  if (!parent || parent.status !== "done") return null;
  return {
    id: parent.id,
    score: parent.score,
    checks: ((parent.report as Report | null)?.checks ?? []) as Check[],
  };
}

export type PreflightDto = {
  id: string;
  status: Preflight["status"];
  platform: Preflight["platform"];
  brandName: string | null;
  score: number | null;
  verdict: Preflight["verdict"];
  report: Report | null;
  frames: ReportFrame[];
  videoUrl: string | null;
  /** The video and frames were removed after 7 days; the report text remains. */
  mediaDeleted: boolean;
  safeZones: { regions: Region[]; minOverlap: number };
  parent: Awaited<ReturnType<typeof parentSummary>>;
  shared: boolean;
  createdAt: string;
};

export async function toPreflightDto(p: Preflight): Promise<PreflightDto> {
  const video = await videoInfo(p.videoId);
  const [report, frames, parent] = await Promise.all([
    video.deleted
      ? withoutFrames(p.report as Report | null)
      : signReport(p.report as Json | null),
    video.deleted ? [] : signFrames(p.artifacts as Json | null),
    parentSummary(p),
  ]);
  return {
    id: p.id,
    status: p.status,
    platform: p.platform,
    brandName: p.brandName,
    score: p.score,
    verdict: p.verdict,
    report,
    frames,
    videoUrl: video.url,
    mediaDeleted: video.deleted,
    safeZones: safeZones(p.platform),
    parent,
    shared: p.shareToken !== null,
    createdAt: p.createdAt.toISOString(),
  };
}
