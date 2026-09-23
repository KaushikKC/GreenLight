ALTER TYPE "public"."contract_status" ADD VALUE 'error';--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "filename" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "rights_windows" ADD COLUMN "scope" text;--> statement-breakpoint
ALTER TABLE "rights_windows" ADD COLUMN "duration_text" text;