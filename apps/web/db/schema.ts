import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: id(),
  email: text("email").unique(),
  name: text("name"),
  isGuest: boolean("is_guest").notNull().default(false),
  createdAt: createdAt(),
});

export const jobType = pgEnum("job_type", [
  "noop",
  "preflight",
  "contract",
  "brands_scan",
  "pitch",
]);

export const jobStatus = pgEnum("job_status", [
  "queued",
  "running",
  "done",
  "error",
]);

/** Postgres-backed queue. Worker claims rows with FOR UPDATE SKIP LOCKED. */
export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    type: jobType("type").notNull(),
    refId: uuid("ref_id"),
    status: jobStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    runAfter: timestamp("run_after", { withTimezone: true })
      .notNull()
      .defaultNow(),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("jobs_claim_idx")
      .on(t.status, t.runAfter)
      .where(sql`${t.status} = 'queued'`),
  ],
);

export const llmCalls = pgTable("llm_calls", {
  id: id(),
  jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
  model: text("model").notNull(),
  purpose: text("purpose").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
  latencyMs: integer("latency_ms"),
  createdAt: createdAt(),
});
