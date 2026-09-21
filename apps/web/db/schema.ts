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

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

export const videos = pgTable("videos", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  filename: text("filename").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  durationS: real("duration_s"),
  width: integer("width"),
  height: integer("height"),
  fps: real("fps"),
  hasAudio: boolean("has_audio"),
  createdAt: createdAt(),
  /** Videos auto-delete after 7 days. */
  deleteAfter: timestamp("delete_after", { withTimezone: true })
    .notNull()
    .default(sql`now() + interval '7 days'`),
});

export const platform = pgEnum("platform", ["tiktok", "reels", "both"]);
export const verdict = pgEnum("verdict", ["ready", "fix_first", "not_ready"]);

export const preflights = pgTable("preflights", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  videoId: uuid("video_id")
    .notNull()
    .references(() => videos.id, { onDelete: "cascade" }),
  platform: platform("platform").notNull(),
  briefText: text("brief_text"),
  captionText: text("caption_text"),
  brandName: text("brand_name"),
  status: jobStatus("status").notNull().default("queued"),
  score: integer("score"),
  verdict: verdict("verdict"),
  report: jsonb("report"),
  artifacts: jsonb("artifacts"),
  promptVersion: text("prompt_version"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Rights Wallet
// ---------------------------------------------------------------------------

export const contractSource = pgEnum("contract_source", ["pdf", "docx", "text"]);
export const contractStatus = pgEnum("contract_status", [
  "extracting",
  "needs_review",
  "confirmed",
]);

export const contracts = pgTable("contracts", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  storageKey: text("storage_key"),
  source: contractSource("source").notNull(),
  rawText: text("raw_text"),
  extracted: jsonb("extracted"),
  status: contractStatus("status").notNull().default("extracting"),
  createdAt: createdAt(),
});

export const deals = pgTable("deals", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  contractId: uuid("contract_id").references(() => contracts.id, {
    onDelete: "set null",
  }),
  brand: text("brand").notNull(),
  campaign: text("campaign"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  feeAmount: numeric("fee_amount", { precision: 12, scale: 2 }),
  feeCurrency: text("fee_currency"),
  paymentTermsDays: integer("payment_terms_days"),
  paymentDueAt: timestamp("payment_due_at", { withTimezone: true }),
  paid: boolean("paid").notNull().default(false),
  deliverables: jsonb("deliverables"),
  notes: text("notes"),
});
