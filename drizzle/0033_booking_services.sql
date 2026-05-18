-- R7 · Cita multi-servicio.
--
-- Tabla ADITIVA. El servicio PRINCIPAL sigue en las columnas snapshot de
-- `bookings` (service/duration/price) — sin cambios ahí, así los 4 callers de
-- createBooking que no usan multi-servicio (bot/voice/import/cron) no cambian
-- de comportamiento. Esta tabla solo guarda los servicios EXTRA.
--
-- `duration_min` se suma al snapshot `bookings.duration` al crear/editar
-- (src/lib/bookings/duration.ts) para que el chequeo de solape reserve el
-- hueco real. `price_euros` es EUROS (igual foot-gun que bookings.price).
--
-- Hand-written (no drizzle-kit) — el snapshot del proyecto está desincronizado
-- y el generador arrastra columnas de 0026-0028 ya aplicadas. Guards
-- IF NOT EXISTS / DO $$ EXCEPTION por idempotencia (las migraciones se aplican
-- lazy en este proyecto, no hay paso migrate en deploy). Patrón: 0014.

CREATE TABLE IF NOT EXISTS "booking_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"name" text NOT NULL,
	"duration_min" integer NOT NULL,
	"price_euros" integer,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "booking_services" ADD CONSTRAINT "booking_services_booking_id_bookings_id_fk"
		FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Lookup por cita (panel detalle + facturación leen todos los extras de un booking).
CREATE INDEX IF NOT EXISTS "booking_services_booking_idx"
	ON "booking_services" ("booking_id", "display_order");
