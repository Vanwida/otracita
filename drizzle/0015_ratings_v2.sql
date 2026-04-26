-- Reseñas v2: desacople de propinas + nueva tabla canónica `ratings`.
--
-- Cambios:
--   1. Añade `clients.ratings_enabled` (default false) — opt-in independiente
--      de tips_enabled. El cron post-booking-followup filtrará ahora por este
--      flag, no por tips_enabled.
--   2. Crea tabla `ratings` — almacén canónico (antes vivían en tips con
--      status='rating_only', solapando dos conceptos distintos).
--   3. Backfill: cualquier cliente que tuviera tips_enabled=true se considera
--      automáticamente con ratingsEnabled=true para no romper su flow actual.
--   4. Indexes: UNIQUE parcial sobre booking_id (idempotencia) + index para
--      listados ordenados en dashboard.

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "ratings_enabled" boolean DEFAULT false NOT NULL;

-- Backfill: clientes con propinas activas heredan reseñas activas también.
UPDATE "clients" SET "ratings_enabled" = true WHERE "tips_enabled" = true AND "ratings_enabled" = false;

CREATE TABLE IF NOT EXISTS "ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"booking_id" uuid,
	"customer_phone" text NOT NULL,
	"customer_name" text,
	"barber_name" text,
	"rating" integer NOT NULL,
	"comment" text,
	"channel" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_rating_range" CHECK ("rating" BETWEEN 1 AND 5),
	CONSTRAINT "ratings_channel_valid" CHECK ("channel" IN ('whatsapp', 'pwa'))
);

DO $$ BEGIN
	ALTER TABLE "ratings" ADD CONSTRAINT "ratings_client_id_clients_id_fk"
		FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "ratings" ADD CONSTRAINT "ratings_booking_id_bookings_id_fk"
		FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ratings_booking_id_uniq"
	ON "ratings" ("booking_id") WHERE "booking_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "ratings_client_created_idx"
	ON "ratings" ("client_id", "created_at" DESC);
