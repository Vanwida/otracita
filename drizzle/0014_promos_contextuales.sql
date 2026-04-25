-- Promos contextuales: opt-in por barbería + tabla de pushes mandados.
-- promo_pushes sirve para rate limiting (1 promo / cliente / 7 días) y
-- auditoría histórica.

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "promos_enabled" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "promo_pushes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_name" text,
	"discount_pct" integer NOT NULL,
	"window_start" text NOT NULL,
	"window_end" text NOT NULL,
	"channel" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "promo_pushes" ADD CONSTRAINT "promo_pushes_client_id_clients_id_fk"
		FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Index parcial para acelerar el rate-limit lookup (últimos 30d) por cliente y phone.
CREATE INDEX IF NOT EXISTS "promo_pushes_client_phone_recent_idx"
	ON "promo_pushes" ("client_id", "customer_phone", "created_at" DESC);
