CREATE TABLE "tips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"booking_id" uuid,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"stripe_charge_id" text,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'eur' NOT NULL,
	"status" text NOT NULL,
	"customer_phone" text NOT NULL,
	"barber_name" text,
	"rating" integer,
	"rating_comment" text,
	"payment_link_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tips_stripe_checkout_session_id_unique" UNIQUE("stripe_checkout_session_id")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "followup_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "tips_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "tips_suggested_cents" integer[] DEFAULT '{200,300,500}' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "followup_minutes_after" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;