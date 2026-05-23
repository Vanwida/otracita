-- Importación de citas desde archivo .ics (Booksy/Treatwell/Google Calendar).
--
-- `imported_ical_uid` = el UID del VEVENT origen. Es la clave de idempotencia:
-- al re-importar el MISMO .ics, las filas con UID ya presente se omiten en vez
-- de duplicarse. Booksy reusa UIDs entre exports, por eso lo guardamos.
--
-- UNIQUE PARTIAL INDEX: la inmensa mayoría de bookings nunca vienen de un
-- .ics (son del bot, web, dashboard…) → null. Indexar solo las filas con UID
-- no-null mantiene el índice pequeño y rápido. UNIQUE per (client_id, uid)
-- garantiza que el chequeo de idempotencia es seguro contra carreras.
--
-- Aditivo. Sin defaults. Sin backfill (las citas históricas se quedan en null).
-- Idempotente: IF NOT EXISTS en columna e index.

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "imported_ical_uid" text;

CREATE UNIQUE INDEX IF NOT EXISTS "bookings_imported_ical_uid_unique_idx"
  ON "bookings" ("client_id", "imported_ical_uid")
  WHERE "imported_ical_uid" IS NOT NULL;
