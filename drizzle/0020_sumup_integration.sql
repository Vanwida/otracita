-- SumUp integration — schema base.
--
-- · clients.sumup_*               OAuth tokens + cursor de polling
-- · cash_movements.sumup_transaction_id  idempotencia frente a polling +
--                                  manual entries (UNIQUE)
-- · cash_movements kind 'refund'  para reflejar refunds de SumUp en el
--                                  cuadre (signo negativo igual que
--                                  expense/withdrawal)
-- · sumup_pending_transactions    buffer cuando llega una transaction
--                                  pero no hay sesión de caja abierta;
--                                  se drena al abrir caja siguiente

-- 1. Tokens OAuth + cursor en clients.
ALTER TABLE "clients"
	ADD COLUMN IF NOT EXISTS "sumup_access_token" text,
	ADD COLUMN IF NOT EXISTS "sumup_refresh_token" text,
	ADD COLUMN IF NOT EXISTS "sumup_merchant_code" text,
	ADD COLUMN IF NOT EXISTS "sumup_token_expires_at" timestamp with time zone,
	ADD COLUMN IF NOT EXISTS "sumup_last_polled_at" timestamp with time zone;

-- 2. Idempotencia en cash_movements.
ALTER TABLE "cash_movements"
	ADD COLUMN IF NOT EXISTS "sumup_transaction_id" text;

DO $$ BEGIN
	ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_sumup_transaction_id_unique"
		UNIQUE ("sumup_transaction_id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Añadir kind 'refund' al CHECK constraint.
-- PostgreSQL no soporta ALTER CONSTRAINT directamente — DROP + ADD.
ALTER TABLE "cash_movements" DROP CONSTRAINT IF EXISTS "cash_movements_kind_valid";
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_kind_valid" CHECK (
	"kind" IN ('booking', 'product_sale', 'tip_cash', 'expense', 'withdrawal', 'deposit', 'adjustment', 'refund')
);

-- 4. Pending transactions buffer.
CREATE TABLE IF NOT EXISTS "sumup_pending_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"sumup_transaction_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"status" text NOT NULL,
	"payment_type" text,
	"transaction_timestamp" timestamp with time zone NOT NULL,
	"raw_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_at" timestamp with time zone,
	CONSTRAINT "sumup_pending_transactions_sumup_transaction_id_unique" UNIQUE ("sumup_transaction_id"),
	CONSTRAINT "sumup_pending_amount_positive" CHECK ("amount_cents" > 0)
);

DO $$ BEGIN
	ALTER TABLE "sumup_pending_transactions" ADD CONSTRAINT "sumup_pending_transactions_client_id_clients_id_fk"
		FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Índice para drenar pending del día rápido.
CREATE INDEX IF NOT EXISTS "sumup_pending_client_imported_idx"
	ON "sumup_pending_transactions" ("client_id", "imported_at", "transaction_timestamp")
	WHERE "imported_at" IS NULL;
