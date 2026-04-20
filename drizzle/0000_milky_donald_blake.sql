CREATE TABLE "analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"date" timestamp NOT NULL,
	"messages_received" integer DEFAULT 0,
	"messages_replied" integer DEFAULT 0,
	"bookings_made" integer DEFAULT 0,
	"bookings_cancelled" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_name" text,
	"service" text NOT NULL,
	"barber" text,
	"date" text NOT NULL,
	"time" text NOT NULL,
	"duration" integer NOT NULL,
	"price" integer,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"google_event_id" text,
	"source" text DEFAULT 'bot' NOT NULL,
	"booksy_booking_id" text,
	"raw_email_snippet" text,
	"reminder_sent" boolean DEFAULT false,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_name" text NOT NULL,
	"owner_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"whatsapp_number" text,
	"city" text DEFAULT 'Barcelona',
	"address" text,
	"whatsapp_phone_number_id" text,
	"whatsapp_access_token" text,
	"booksy_profile_url" text,
	"booksy_services" jsonb,
	"booksy_inbound_email" text,
	"use_db_availability" boolean DEFAULT false NOT NULL,
	"google_calendar_id" text,
	"google_calendar_connected" boolean DEFAULT false,
	"status" text DEFAULT 'pending' NOT NULL,
	"plan" text DEFAULT 'chatbot' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"chatbot_greeting" text,
	"chatbot_services" jsonb,
	"chatbot_hours" jsonb,
	"blocked_dates" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"onboarded_at" timestamp,
	CONSTRAINT "clients_email_unique" UNIQUE("email"),
	CONSTRAINT "clients_booksy_inbound_email_unique" UNIQUE("booksy_inbound_email")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"customer_phone" text NOT NULL,
	"step" text DEFAULT 'idle' NOT NULL,
	"selected_service" text,
	"selected_slot" text,
	"context" jsonb,
	"last_interaction" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"total_bookings" integer DEFAULT 0,
	"no_shows" integer DEFAULT 0,
	"cancellations" integer DEFAULT 0,
	"reputation" text DEFAULT 'good',
	"last_booking_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"business_name" text,
	"phone" text NOT NULL,
	"email" text,
	"message" text,
	"source" text DEFAULT 'website',
	"status" text DEFAULT 'new',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"plan" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'eur',
	"status" text NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_name" text,
	"date" text NOT NULL,
	"time" text,
	"service" text,
	"barber" text,
	"status" text DEFAULT 'waiting' NOT NULL,
	"notified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics" ADD CONSTRAINT "analytics_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;