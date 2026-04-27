-- Caja efectivo: opt-in toggle + payment_method en bookings + dos tablas
-- nuevas (cash_sessions y cash_movements) para abrir/cerrar caja diaria
-- con cuadre de efectivo y datáfono.
--
-- · clients.cash_register_enabled — feature opt-in. Sin esto activo
--   nada cambia (no aparecen botones, no se piden métodos de pago).
-- · bookings.payment_method — registrado al marcar 'completed' cuando la
--   caja está activa. Null para legacy / no-caja / status != completed.
-- · cash_sessions — una abierta a la vez por cliente (UNIQUE partial idx).
--   Cierra con counted vs expected → descuadre cash + descuadre tarjeta.
-- · cash_movements — todos los apuntes del día (booking, product_sale,
--   tip_cash, expense, withdrawal, deposit, adjustment) por método
--   (cash/card/online). amount_cents siempre positivo, signo lo marca kind.

-- 1. Toggle opt-in en clients.
ALTER TABLE "clients"
	ADD COLUMN IF NOT EXISTS "cash_register_enabled" boolean DEFAULT false NOT NULL;

-- 2. Método de pago en bookings (nullable).
ALTER TABLE "bookings"
	ADD COLUMN IF NOT EXISTS "payment_method" text;

DO $$ BEGIN
	ALTER TABLE "bookings" ADD CONSTRAINT "bookings_payment_method_valid"
		CHECK ("payment_method" IS NULL OR "payment_method" IN ('cash', 'card', 'online'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. cash_sessions.
CREATE TABLE IF NOT EXISTS "cash_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"opening_cents" integer NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_by_email" text NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by_email" text,
	"closing_cents_expected" integer,
	"closing_cents_counted" integer,
	"cash_descuadre_cents" integer,
	"card_terminal_expected_cents" integer,
	"card_terminal_counted_cents" integer,
	"card_descuadre_cents" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_sessions_opening_nonneg" CHECK ("opening_cents" >= 0)
);

DO $$ BEGIN
	ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_client_id_clients_id_fk"
		FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Solo una sesión abierta por cliente. Garantiza que el endpoint /open
-- nunca cree dos en paralelo (race condition).
CREATE UNIQUE INDEX IF NOT EXISTS "cash_sessions_one_open_per_client"
	ON "cash_sessions" ("client_id") WHERE "closed_at" IS NULL;

-- Lookup por cliente ordenado por apertura (historial de cierres).
CREATE INDEX IF NOT EXISTS "cash_sessions_client_opened_idx"
	ON "cash_sessions" ("client_id", "opened_at" DESC);

-- 4. cash_movements.
CREATE TABLE IF NOT EXISTS "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"method" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"reference_type" text,
	"reference_id" uuid,
	"notes" text,
	"created_by_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_movements_kind_valid" CHECK (
		"kind" IN ('booking', 'product_sale', 'tip_cash', 'expense', 'withdrawal', 'deposit', 'adjustment')
	),
	CONSTRAINT "cash_movements_method_valid" CHECK (
		"method" IN ('cash', 'card', 'online')
	),
	CONSTRAINT "cash_movements_amount_positive" CHECK ("amount_cents" > 0),
	CONSTRAINT "cash_movements_reference_type_valid" CHECK (
		"reference_type" IS NULL OR "reference_type" IN ('booking', 'product_sale')
	)
);

DO $$ BEGIN
	ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_client_id_clients_id_fk"
		FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_session_id_cash_sessions_id_fk"
		FOREIGN KEY ("session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Lookup principal: movimientos de una sesión, en orden cronológico.
CREATE INDEX IF NOT EXISTS "cash_movements_session_idx"
	ON "cash_movements" ("session_id", "created_at");

-- Auditoría inversa: ¿qué movimientos vinieron de este booking/sale?
CREATE INDEX IF NOT EXISTS "cash_movements_reference_idx"
	ON "cash_movements" ("reference_type", "reference_id")
	WHERE "reference_id" IS NOT NULL;
