import "server-only";

import { and, count, eq, gt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/db";

import { type Decision, decide, LIMITS, type LimitKind, type Tier, WINDOW_SECONDS, type Window } from "./limits";

const TABLES = {
  preflights: schema.preflights,
  contracts: schema.contracts,
  posts: schema.posts,
  pitches: schema.pitches,
} as const;

async function tierOf(userId: string): Promise<Tier> {
  const [u] = await db.select({ isGuest: schema.users.isGuest }).from(schema.users).where(eq(schema.users.id, userId));
  return u && !u.isGuest ? "user" : "guest";
}

/** How many rows of `kind` the user created in each window. */
async function usage(userId: string, kind: LimitKind, windows: Window[]) {
  const table = TABLES[kind];
  const used: Partial<Record<Window, number>> = {};
  for (const w of windows) {
    const since = sql`now() - make_interval(secs => ${WINDOW_SECONDS[w]})`;
    const [row] = await db
      .select({ n: count() })
      .from(table)
      .where(and(eq(table.userId, userId), gt(table.createdAt, since)));
    used[w] = row.n;
  }
  return used;
}

export async function checkLimit(userId: string, kind: LimitKind, adding = 1): Promise<Decision> {
  const tier = await tierOf(userId);
  const windows = LIMITS[tier][kind].map((r) => r.per);
  return decide(tier, kind, await usage(userId, kind, windows), adding);
}

export function limitResponse(d: Exclude<Decision, { ok: true }>) {
  return NextResponse.json(
    { error: "rate_limited", message: d.message },
    { status: 429, headers: { "retry-after": String(d.retryAfterS) } },
  );
}
