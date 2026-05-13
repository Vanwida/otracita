-- Control financiero: gastos variables, costes fijos y retiros del dueño.
-- Alimenta el módulo /dashboard/finanzas (Pro+).

-- 1. expenses — gastos variables diarios
CREATE TABLE IF NOT EXISTS "expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "date" date NOT NULL,
  "amount_cents" integer NOT NULL,
  "category" text NOT NULL DEFAULT 'otro',
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "expenses_amount_positive" CHECK ("amount_cents" > 0),
  CONSTRAINT "expenses_category_valid" CHECK (
    "category" IN ('productos','suministros','publicidad','personal','nomina','otro')
  )
);

DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "expenses_client_date_idx"
  ON "expenses" ("client_id", "date" DESC);

-- 2. fixed_costs — costes recurrentes mensuales
CREATE TABLE IF NOT EXISTS "fixed_costs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "name" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "category" text NOT NULL DEFAULT 'otro',
  "active_from" date NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fixed_costs_amount_positive" CHECK ("amount_cents" > 0),
  CONSTRAINT "fixed_costs_category_valid" CHECK (
    "category" IN ('productos','suministros','publicidad','personal','nomina','otro')
  )
);

DO $$ BEGIN
  ALTER TABLE "fixed_costs" ADD CONSTRAINT "fixed_costs_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "fixed_costs_client_idx"
  ON "fixed_costs" ("client_id", "sort_order");

-- 3. owner_withdrawals — retiros del dueño
CREATE TABLE IF NOT EXISTS "owner_withdrawals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "date" date NOT NULL,
  "amount_cents" integer NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "owner_withdrawals_amount_positive" CHECK ("amount_cents" > 0)
);

DO $$ BEGIN
  ALTER TABLE "owner_withdrawals" ADD CONSTRAINT "owner_withdrawals_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "owner_withdrawals_client_date_idx"
  ON "owner_withdrawals" ("client_id", "date" DESC);
