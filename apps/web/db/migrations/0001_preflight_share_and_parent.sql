ALTER TABLE "preflights" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "preflights" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "preflights" ADD CONSTRAINT "preflights_parent_id_preflights_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."preflights"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preflights" ADD CONSTRAINT "preflights_share_token_unique" UNIQUE("share_token");