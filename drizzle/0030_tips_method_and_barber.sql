-- V1 propinas con barbero (feedback Reni).
--
-- Cambios aditivos (no destructivos, no requiere downtime):
--   - tips.payment_method (text, nullable) → 'cash' | 'card' | NULL (legacy = card).
--   - tips.barber_id      (uuid, nullable, FK barbers.id ON DELETE SET NULL).
--   - cash_movements.barber_id (uuid, nullable, FK barbers.id ON DELETE SET NULL).
--
-- Filas pre-existentes quedan con NULL en estas columnas. La UI/queries deben
-- tratar tips.payment_method IS NULL como 'card' (Stripe Checkout legacy) y
-- tips.barber_id IS NULL como "resolver vía bookings.barber_id" (compat).
--
-- Patrón de guards: IF NOT EXISTS para columnas, DO $$ ... EXCEPTION WHEN
-- duplicate_object para FKs. Idempotente — se puede re-aplicar sin error.

ALTER TABLE "tips" ADD COLUMN IF NOT EXISTS "payment_method" text;

ALTER TABLE "tips" ADD COLUMN IF NOT EXISTS "barber_id" uuid;

DO $$ BEGIN
	ALTER TABLE "tips" ADD CONSTRAINT "tips_barber_id_barbers_id_fk"
		FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "cash_movements" ADD COLUMN IF NOT EXISTS "barber_id" uuid;

DO $$ BEGIN
	ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_barber_id_barbers_id_fk"
		FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
