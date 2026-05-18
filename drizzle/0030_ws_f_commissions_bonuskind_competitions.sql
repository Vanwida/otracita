-- WS-F — gaps de equipo/comisiones/bonos (R8 + R9 + R10).
--
-- Hand-written siguiendo convención #5 del repo: `drizzle-kit generate`
-- produce un diff de ruido (snapshot desincronizado: intenta recrear
-- bonuses/bonus_entries y re-añadir columnas de barbers que ya existen).
-- Aquí van SOLO los 4 cambios reales, todos ADITIVOS y guardados con
-- IF NOT EXISTS / DO $$ duplicate_object (patrón de 0014_promos).
--
-- Cero column changes destructivos: ningún DROP, ningún ALTER de tipo.
-- Las features existentes (BonusesManager, payroll) siguen igual.

-- R9 — tipo de bono. 'meta' (todo-o-nada, comportamiento previo) es el
-- default: las filas existentes y todo el código de pago siguen igual.
ALTER TABLE "bonuses" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'meta' NOT NULL;

-- R8 — override de comisión por (barbero, servicio). Sin filas ⇒ payroll
-- usa el % global de antes (no-regresión). serviceName = nombre del
-- servicio (catálogo jsonb sin ID estable + bookings.service texto libre).
CREATE TABLE IF NOT EXISTS "barber_service_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"barber_id" uuid NOT NULL,
	"service_name" text NOT NULL,
	"pct" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "barber_service_commissions" ADD CONSTRAINT "barber_service_commissions_client_id_clients_id_fk"
		FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "barber_service_commissions" ADD CONSTRAINT "barber_service_commissions_barber_id_barbers_id_fk"
		FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "barber_service_commissions" ADD CONSTRAINT "barber_service_commissions_unique"
		UNIQUE ("client_id", "barber_id", "service_name");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- R10 — competición semanal de equipo (payout STANDALONE, no toca nóminas).
CREATE TABLE IF NOT EXISTS "team_competitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"metric" text NOT NULL,
	"reward_cents_per_week" integer NOT NULL,
	"streak_weeks_for_bonus" integer DEFAULT 4 NOT NULL,
	"streak_bonus_cents" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "team_competitions" ADD CONSTRAINT "team_competitions_client_id_clients_id_fk"
		FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Resultado CONGELADO por semana ISO (lazy-compute-but-freeze-once).
-- UNA fila por (competición, semana) = zero-sum.
CREATE TABLE IF NOT EXISTS "team_competition_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"competition_id" uuid NOT NULL,
	"iso_week_start" text NOT NULL,
	"winner_barber_id" uuid,
	"winner_metric_value" integer,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "team_competition_weeks" ADD CONSTRAINT "team_competition_weeks_client_id_clients_id_fk"
		FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "team_competition_weeks" ADD CONSTRAINT "team_competition_weeks_competition_id_team_competitions_id_fk"
		FOREIGN KEY ("competition_id") REFERENCES "public"."team_competitions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "team_competition_weeks" ADD CONSTRAINT "team_competition_weeks_winner_barber_id_barbers_id_fk"
		FOREIGN KEY ("winner_barber_id") REFERENCES "public"."barbers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "team_competition_weeks" ADD CONSTRAINT "team_competition_weeks_unique"
		UNIQUE ("competition_id", "iso_week_start");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
