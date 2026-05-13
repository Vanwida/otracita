-- Migration 0015 — tier (Solo/Pro/Estudio) + 14d trial fields
--
-- Añade:
--   clients.tier              ('solo' | 'pro' | 'estudio')
--   clients.billing_interval  ('monthly' | 'annual' | null)
--   clients.trial_started_at  (timestamp, null si no aplica)
--   clients.trial_ends_at     (timestamp, null si no aplica)
--   subscriptions.tier        (mismo enum, mirror histórico)
--   subscriptions.billing_interval
--   subscriptions.trial_ends_at
--
-- Backfill clientes existentes:
--   plan='chatbot' → tier='pro'   (los que ya pagan por bot WhatsApp)
--   plan='full'    → tier='estudio'
--   plan='ads'     → tier='solo'  (vertical no usada, default seguro)
--   resto          → tier='solo'
--
-- Guards IF NOT EXISTS para que sea idempotente y conviva con el snapshot
-- desincronizado de drizzle-kit (ver CLAUDE.md del proyecto).

-- clients ----------------------------------------------------------------
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "tier" text DEFAULT 'solo' NOT NULL;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "billing_interval" text;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "trial_started_at" timestamp with time zone;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamp with time zone;

-- Backfill tier desde plan legacy. Solo toca rows donde tier sigue siendo
-- el default 'solo' Y el plan legacy implica algo distinto, para no
-- pisarse a sí mismo en re-runs.
UPDATE "clients"
   SET "tier" = 'pro'
 WHERE "plan" = 'chatbot' AND "tier" = 'solo';

UPDATE "clients"
   SET "tier" = 'estudio'
 WHERE "plan" = 'full' AND "tier" = 'solo';

-- Backfill billing_interval para clientes que tienen subscription Stripe
-- activa. Asumimos monthly (era lo único soportado en el flow legacy).
UPDATE "clients"
   SET "billing_interval" = 'monthly'
 WHERE "stripe_subscription_id" IS NOT NULL
   AND "billing_interval" IS NULL;

-- subscriptions ----------------------------------------------------------
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "tier" text;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "billing_interval" text;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamp with time zone;

-- Backfill tier en subscriptions desde plan legacy.
UPDATE "subscriptions"
   SET "tier" = 'pro'
 WHERE "plan" = 'chatbot' AND "tier" IS NULL;

UPDATE "subscriptions"
   SET "tier" = 'estudio'
 WHERE "plan" = 'full' AND "tier" IS NULL;

UPDATE "subscriptions"
   SET "tier" = 'solo'
 WHERE "tier" IS NULL;

UPDATE "subscriptions"
   SET "billing_interval" = 'monthly'
 WHERE "billing_interval" IS NULL;
