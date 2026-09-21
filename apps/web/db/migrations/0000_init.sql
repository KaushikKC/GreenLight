CREATE TYPE "public"."contract_source" AS ENUM('pdf', 'docx', 'text');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('extracting', 'needs_review', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'done', 'error');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('noop', 'preflight', 'contract', 'brands_scan', 'pitch');--> statement-breakpoint
CREATE TYPE "public"."mention_modality" AS ENUM('spoken', 'caption', 'on_screen', 'visual');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('tiktok', 'reels', 'both');--> statement-breakpoint
CREATE TYPE "public"."post_source" AS ENUM('manual', 'csv', 'export', 'upload');--> statement-breakpoint
CREATE TYPE "public"."rights_kind" AS ENUM('usage', 'whitelisting', 'exclusivity');--> statement-breakpoint
CREATE TYPE "public"."verdict" AS ENUM('ready', 'fix_first', 'not_ready');--> statement-breakpoint
CREATE TABLE "brand_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"brand_canonical" text NOT NULL,
	"brand_raw" text NOT NULL,
	"product" text,
	"modality" "mention_modality" NOT NULL,
	"sentiment" real DEFAULT 0 NOT NULL,
	"is_sponsored" boolean DEFAULT false NOT NULL,
	"evidence" text,
	"confidence" real
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"storage_key" text,
	"source" "contract_source" NOT NULL,
	"raw_text" text,
	"extracted" jsonb,
	"status" "contract_status" DEFAULT 'extracting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"contract_id" uuid,
	"brand" text NOT NULL,
	"campaign" text,
	"signed_at" timestamp with time zone,
	"fee_amount" numeric(12, 2),
	"fee_currency" text,
	"payment_terms_days" integer,
	"payment_due_at" timestamp with time zone,
	"paid" boolean DEFAULT false NOT NULL,
	"deliverables" jsonb,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "job_type" NOT NULL,
	"ref_id" uuid,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"model" text NOT NULL,
	"purpose" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6),
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pitches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"brand_canonical" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"evidence_post_ids" uuid[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text,
	"url" text,
	"posted_at" timestamp with time zone,
	"caption" text,
	"transcript" text,
	"ocr_text" text,
	"source" "post_source" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preflights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"brief_text" text,
	"caption_text" text,
	"brand_name" text,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"score" integer,
	"verdict" "verdict",
	"report" jsonb,
	"artifacts" jsonb,
	"prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rights_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"kind" "rights_kind" NOT NULL,
	"platforms" text[],
	"territories" text[],
	"category" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"perpetual" boolean DEFAULT false NOT NULL,
	"source_quote" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"name" text,
	"is_guest" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"duration_s" real,
	"width" integer,
	"height" integer,
	"fps" real,
	"has_audio" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delete_after" timestamp with time zone DEFAULT now() + interval '7 days' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_mentions" ADD CONSTRAINT "brand_mentions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitches" ADD CONSTRAINT "pitches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preflights" ADD CONSTRAINT "preflights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preflights" ADD CONSTRAINT "preflights_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_windows" ADD CONSTRAINT "rights_windows_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_mentions_canonical_idx" ON "brand_mentions" USING btree ("brand_canonical");--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("status","run_after") WHERE "jobs"."status" = 'queued';