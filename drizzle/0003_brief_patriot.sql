ALTER TABLE "clients" ADD COLUMN "meta_webhook_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "meta_token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "onboarding_test_message_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "onboarding_notes" text;