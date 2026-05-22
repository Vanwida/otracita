-- 0031_split_payments — épica Reni 2026-05-22 (#26 cobro unificado + #27 pago
-- fraccionado). Añade soporte multi-row a `payments` para que un mismo
-- booking pueda registrar N tramos con métodos distintos (cash + tarjeta
-- físico + bizum + Stripe Checkout) sumando al total del booking.
--
-- Nota: drizzle-kit incluyó también ALTERs de `barbers.tier_bonuses` y
-- `bookings.source_manual` porque su snapshot estaba fuera de sync respecto
-- a las migraciones 0037/0038 ya aplicadas en producción. Se han eliminado.

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "method" text;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "sumup_transaction_id" text;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "recorded_by_email" text;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "notes" text;

DO $$ BEGIN
  ALTER TABLE "payments"
    ADD CONSTRAINT "payments_sumup_transaction_id_unique" UNIQUE("sumup_transaction_id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;

-- Backfill: filas legacy creadas por el flow Stripe Checkout aislado (todas
-- las que tienen stripe_checkout_session_id no nulo) se asumen `card_online`.
-- Si alguna fila legacy NO tenía session id, queda con method=NULL y los
-- consumers la tratan como desconocido (no rompe).
UPDATE "payments"
  SET "method" = 'card_online'
  WHERE "method" IS NULL
    AND "stripe_checkout_session_id" IS NOT NULL;
