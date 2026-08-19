-- Auto-respuesta a reseñas de Google Business Profile.
--
-- NOTA: el diff crudo de `drizzle-kit generate` incluía ruido no relacionado
-- (recreación de tablas/columnas ya existentes en DB, un DROP COLUMN de una
-- migración anterior) porque el journal/snapshot de este proyecto está
-- desincronizado con la DB real — ver CLAUDE.md §5. Este archivo está
-- recortado a mano a SOLO lo relacionado con este cambio, con guards
-- IF NOT EXISTS para poder aplicarse sin riesgo aunque algo ya exista.

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "google_business_access_token" text;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "google_business_refresh_token" text;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "google_business_token_expires_at" timestamp with time zone;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "google_business_location_path" text;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "google_business_connected_at" timestamp with time zone;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "google_reviews_auto_reply" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "google_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"google_review_id" text NOT NULL,
	"reviewer_name" text,
	"star_rating" integer NOT NULL,
	"comment" text,
	"review_created_at" timestamp with time zone NOT NULL,
	"review_updated_at" timestamp with time zone NOT NULL,
	"reply_text" text,
	"reply_status" text DEFAULT 'pending' NOT NULL,
	"reply_source" text,
	"reply_published_at" timestamp with time zone,
	"last_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_reviews_client_review_unique" UNIQUE("client_id","google_review_id")
);

DO $$ BEGIN
	ALTER TABLE "google_reviews" ADD CONSTRAINT "google_reviews_client_id_clients_id_fk"
		FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
