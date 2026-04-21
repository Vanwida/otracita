CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"booking_id" uuid,
	"number" text NOT NULL,
	"issue_date" date NOT NULL,
	"customer_name" text,
	"customer_phone" text,
	"customer_nif" text,
	"customer_address" text,
	"service_name" text NOT NULL,
	"barber_name" text,
	"subtotal_cents" integer NOT NULL,
	"iva_rate" integer NOT NULL,
	"iva_amount_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_client_number_unique" UNIQUE("client_id","number")
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "fiscal_name" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "fiscal_nif" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "fiscal_address" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "fiscal_city" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "fiscal_postal_code" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "iva_rate" integer DEFAULT 21 NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "invoicing_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "invoice_number_prefix" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "invoice_number_next" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;