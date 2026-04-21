CREATE TABLE "email_parse_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"to_email" text,
	"from_email" text,
	"subject" text,
	"raw_snippet" text,
	"status" text NOT NULL,
	"parse_source" text,
	"parsed_fields" jsonb,
	"missing_fields" text[],
	"booking_id" uuid,
	"alert_sent" boolean DEFAULT false,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "email_parse_log" ADD CONSTRAINT "email_parse_log_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_parse_log" ADD CONSTRAINT "email_parse_log_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;