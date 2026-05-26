-- Lista de espera por slot específico (#88).
--
-- Extiende la tabla `waitlist` ya existente (bot WhatsApp legacy, vive en
-- engine.ts y solo entra con time=null + barber libre) con las columnas que
-- necesita el flujo nuevo: rango de hora deseado, barberId canónico, expiración
-- automática y el booking generado al convertir.
--
-- ADITIVO: todas las columnas nuevas son nullable y no rompen los inserts/reads
-- del bot legacy (que sigue funcionando con time/barber). El nuevo flujo
-- (PWA, dashboard, hook de cancelación de booking) las usa para filtrar matches
-- contra cancelaciones y evitar avisar a entradas ya caducadas.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS para que re-ejecutar sea seguro y
-- absorber el snapshot fuera de sync del proyecto.

ALTER TABLE "waitlist"
  ADD COLUMN IF NOT EXISTS "desired_time_start" text;
ALTER TABLE "waitlist"
  ADD COLUMN IF NOT EXISTS "desired_time_end" text;
ALTER TABLE "waitlist"
  ADD COLUMN IF NOT EXISTS "barber_id" uuid;
ALTER TABLE "waitlist"
  ADD COLUMN IF NOT EXISTS "converted_booking_id" uuid;
ALTER TABLE "waitlist"
  ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;

-- Índice para el matcher: el hook de cancelación filtra por
-- (clientId, date, status='waiting') y luego compara horas en memoria.
CREATE INDEX IF NOT EXISTS "waitlist_client_date_status_idx"
  ON "waitlist" ("client_id", "date", "status");

-- Índice para "mostrar pendientes futuros" en dashboard:
-- (clientId, status, expires_at).
CREATE INDEX IF NOT EXISTS "waitlist_client_status_expires_idx"
  ON "waitlist" ("client_id", "status", "expires_at");
