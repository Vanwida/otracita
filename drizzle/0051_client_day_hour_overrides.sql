-- Excepciones de horario por fecha concreta a nivel de LOCAL (#60).
--
-- El semanal recurrente vive en `clients.chatbotHours` (lunes-domingo,
-- "HH:MM-HH:MM" o "Cerrado"). Hasta ahora si un barbero quería
-- "EXTENDER 1h el martes 28" no había forma — solo se podía mover el
-- recurrente o bloquear el día entero (`blockedDates`). Esta tabla
-- añade la pieza que faltaba: override puntual por fecha.
--
-- · `hours = "HH:MM-HH:MM"` ⇒ el local opera ESE rango ese día
--   (en vez del recurrente).
-- · `hours = "Cerrado"`     ⇒ cerrado ese día (equivalente a
--   `blockedDates` pero permitiendo adjuntar `note`).
--
-- UNIQUE (client_id, date) garantiza una sola fila por fecha → el
-- editor hace upsert.
--
-- Idempotente: `IF NOT EXISTS` + `DO $$ EXCEPTION duplicate_object`
-- para que re-ejecutar sea seguro. Sin backfill — los locales que
-- no usan overrides siguen exactamente igual (motor de availability
-- consulta la tabla y, si vacío, cae al recurrente como siempre).

CREATE TABLE IF NOT EXISTS "client_day_hour_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "date" text NOT NULL,
  "hours" text NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "client_day_hour_overrides"
    ADD CONSTRAINT "client_day_hour_overrides_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "client_day_hour_overrides"
    ADD CONSTRAINT "client_day_hour_overrides_client_date_unique"
    UNIQUE ("client_id", "date");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "client_day_hour_overrides_client_date_idx"
  ON "client_day_hour_overrides" ("client_id", "date");
