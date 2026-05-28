-- Log inmutable de transiciones de cita (task #107).
--
-- Append-only. Cada mutación de una cita (creada, movida, cancelada, no-show,
-- completada, cobrada, recordatorio enviado…) inserta una fila aquí. Es la
-- herramienta permanente de Reni para responder "¿qué pasó con esa cita?",
-- sobre todo ahora que las canceladas se ocultan del grid de la agenda (#108):
-- el dato no se pierde, vive aquí.
--
-- `client_id` SIEMPRE del session (multi-tenancy). `booking_id` referencia la
-- cita sin ON DELETE CASCADE — las citas no se borran (se cancelan); el evento
-- debe sobrevivir. Inserción vía `logBookingEvent` (src/lib/bookings/events.ts),
-- fuente única, secuencial (neon-http sin transactions), best-effort.
--
-- Idempotente: IF NOT EXISTS en tabla, índices y guard del FK para absorber el
-- snapshot fuera de sync del proyecto (CLAUDE.md §5) y permitir re-ejecución.

CREATE TABLE IF NOT EXISTS "booking_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "booking_id" uuid NOT NULL,
  "type" text NOT NULL,
  "actor" text NOT NULL,
  "actor_label" text,
  "summary" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "booking_events"
    ADD CONSTRAINT "booking_events_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "booking_events"
    ADD CONSTRAINT "booking_events_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Timeline de UNA cita (orden cronológico).
CREATE INDEX IF NOT EXISTS "booking_events_client_booking_created_idx"
  ON "booking_events" ("client_id", "booking_id", "created_at");

-- Vista global de actividad del tenant (orden desc por fecha).
CREATE INDEX IF NOT EXISTS "booking_events_client_created_idx"
  ON "booking_events" ("client_id", "created_at");
