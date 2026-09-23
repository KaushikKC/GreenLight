CREATE TYPE "public"."pitch_ask" AS ENUM('gifting', 'paid', 'affiliate');--> statement-breakpoint
ALTER TABLE "pitches" ALTER COLUMN "subject" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pitches" ALTER COLUMN "body" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pitches" ADD COLUMN "status" "job_status" DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "pitches" ADD COLUMN "ask" "pitch_ask";--> statement-breakpoint
ALTER TABLE "pitches" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "pitches" ADD COLUMN "claims" jsonb;--> statement-breakpoint
ALTER TABLE "pitches" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "scanned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "handle" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "niche" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "audience" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "followers" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "posts_user_url_idx" ON "posts" USING btree ("user_id","url") WHERE "posts"."url" is not null;