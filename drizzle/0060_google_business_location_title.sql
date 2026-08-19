-- Nombre visible de la location de Google Business Profile conectada
-- (p.ej. "Barbería X — Gràcia"), para que el panel muestre algo legible en
-- vez del path técnico "accounts/{id}/locations/{id}". Nullable a
-- propósito: tenants conectados antes de este cambio no tienen título, la
-- UI cae a mostrar el path — no hay backfill.
--
-- A diferencia de 0059, el diff crudo de `drizzle-kit generate` esta vez
-- salió limpio (una sola columna) — igualmente se añade el guard
-- IF NOT EXISTS por consistencia con el resto de migraciones del proyecto.

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "google_business_location_title" text;
