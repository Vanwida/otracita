-- WS-B · Disponibilidad & turnos (feedback R2 + R12).
--
-- DOS tablas ADITIVAS. El campo `barbers.hours` (string legacy "10:00-20:00")
-- y `barbers.blocked_dates` (días completos legacy) NO se tocan — siguen
-- siendo la fuente del horario y los días libres. La disponibilidad
-- (availability.ts / bookings/create.ts) lee `hours` igual que hoy y RESTA
-- además las filas de estas tablas. Un barbero sin filas aquí produce
-- exactamente los mismos slots que antes (no-regresión).
--
--   barber_breaks  → descansos RECURRENTES semanales (R12, "Descanso" inset
--                    bajo cada día en el editor de turnos). 1 fila por
--                    (barbero, weekday, franja).
--   barber_blocks  → bloqueos EXCEPCIONALES de una fecha concreta: "Falta de
--                    disponibilidad" (franja parcial, R2) y "Ausencias" de
--                    día completo (con motivo, R2).
--
-- Idempotente y safe-to-rerun (las migraciones se aplican lazily en este
-- proyecto). Patrón = drizzle/0014_promos_contextuales.sql.

CREATE TABLE IF NOT EXISTS "barber_breaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"barber_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "barber_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"barber_id" uuid NOT NULL,
	"date" text NOT NULL,
	"start_time" text,
	"end_time" text,
	"kind" text NOT NULL,
	"reason" text,
	"note" text,
	"approved" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "barber_breaks" ADD CONSTRAINT "barber_breaks_client_id_clients_id_fk"
		FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "barber_breaks" ADD CONSTRAINT "barber_breaks_barber_id_barbers_id_fk"
		FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "barber_blocks" ADD CONSTRAINT "barber_blocks_client_id_clients_id_fk"
		FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "barber_blocks" ADD CONSTRAINT "barber_blocks_barber_id_barbers_id_fk"
		FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Lookups por (barbero, día/weekday): la disponibilidad consulta por barbero
-- y fecha en cada cálculo de slots, hot path del bot y la PWA.
CREATE INDEX IF NOT EXISTS "barber_breaks_barber_weekday_idx"
	ON "barber_breaks" ("barber_id", "weekday");

CREATE INDEX IF NOT EXISTS "barber_blocks_barber_date_idx"
	ON "barber_blocks" ("barber_id", "date");
