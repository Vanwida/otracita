-- L-01 — el bot no podía reservar en altas por wizard.
--
-- `use_db_availability` nacía en false y nadie lo ponía a true, así que un
-- tenant creado por /api/setup (que NUNCA tiene google_calendar_id) se
-- quedaba sin motor de disponibilidad: el bot ni siquiera llegaba a ofrecer
-- días. Se invierte el default y se arrastra a los tenants ya creados.

ALTER TABLE "clients"
  ALTER COLUMN "use_db_availability" SET DEFAULT true;

-- Tenants ya creados SIN Google Calendar: no tienen otra vía de
-- disponibilidad, así que pasan al motor de DB.
UPDATE "clients"
   SET "use_db_availability" = true
 WHERE "use_db_availability" = false
   AND "google_calendar_id" IS NULL;

-- Los tenants legacy CON google_calendar_id se dejan intactos a propósito:
-- hoy sus huecos y bloqueos viven en Google Calendar, y moverlos a la DB sin
-- reconciliar esos eventos abriría sobre-reservas. Migrarlos es una decisión
-- aparte; cuando toque:
--   UPDATE "clients" SET "use_db_availability" = true WHERE "google_calendar_id" IS NOT NULL;
