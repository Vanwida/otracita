-- L-01 — el bot no podía reservar en altas por wizard.
--
-- `use_db_availability` nacía en false y nadie lo ponía a true, así que un
-- tenant creado por /api/setup (que NUNCA tiene google_calendar_id) se
-- quedaba sin motor de disponibilidad: el bot ni siquiera llegaba a ofrecer
-- días. Se invierte el default y se arrastra a los tenants ya creados.

ALTER TABLE "clients"
  ALTER COLUMN "use_db_availability" SET DEFAULT true;

-- TODOS los tenants pasan al motor de DB, también los que tienen
-- google_calendar_id. Decisión explícita de Alex (19-ago-2026): hoy no hay
-- ningún tenant real en producción con agenda viva en Google Calendar, así
-- que el riesgo teórico de sobre-reserva por eventos no reconciliados no
-- existe, y dejar tenants a medias significaría dos motores de
-- disponibilidad conviviendo sin necesidad. Cuando vuelva a haber un tenant
-- con GCal de verdad, la reconciliación es una migración aparte.
UPDATE "clients"
   SET "use_db_availability" = true
 WHERE "use_db_availability" = false;
