-- Acceso móvil personal del barbero (#71). Token único por barbero que el
-- jefe genera una vez y le manda por WhatsApp. El barbero abre el link en
-- su móvil → cookie firmada (HMAC) TTL 1 año → ve solo SU agenda/ventas/
-- propinas. Sin login, sin PIN — el link ES la auth, modelo "magic link
-- permanente" + cookie firmada (mismo patrón que admin-lock pero firmada
-- por barberId). Si el barbero pierde el móvil → el jefe pulsa "Revocar"
-- / "Regenerar" → token rotado, cookies viejas dejan de validar.
--
-- ADITIVO: dos columnas nullable. Cero regresión para barberos existentes
-- (ningún barbero tiene acceso móvil hasta que el jefe lo genere).

ALTER TABLE "barbers"
  ADD COLUMN IF NOT EXISTS "personal_access_token" text;

ALTER TABLE "barbers"
  ADD COLUMN IF NOT EXISTS "personal_access_generated_at" timestamp with time zone;

-- UNIQUE índice — un token solo puede pertenecer a un barbero. Lo añadimos
-- como índice (no constraint inline en CREATE TABLE) para poder envolverlo
-- en IF NOT EXISTS y evitar la doble-apply en local↔prod.
CREATE UNIQUE INDEX IF NOT EXISTS "barbers_personal_access_token_unique"
  ON "barbers" ("personal_access_token")
  WHERE "personal_access_token" IS NOT NULL;
