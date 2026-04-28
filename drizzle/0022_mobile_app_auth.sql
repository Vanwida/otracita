-- Auth para la app móvil "otracita Cobros".
--
-- Flow:
--   1. Barbero pulsa "Conectar app móvil" desde /dashboard/caja
--   2. Backend genera PIN de 6 dígitos, lo hashea, guarda en mobile_pins
--      con expiración 10 min
--   3. Devuelve el PIN en claro UNA VEZ al frontend (modal)
--   4. Barbero teclea el PIN en la app móvil
--   5. App llama /api/app/mobile/pin/redeem
--   6. Backend verifica hash + expira + no usado → genera session_token
--      hex 64 chars, hashea, guarda en mobile_sessions
--   7. Devuelve token en claro UNA VEZ a la app, que lo guarda en Keychain
--   8. Cada request móvil → header Authorization: Bearer <token> →
--      backend hashea y busca en mobile_sessions
--
-- Seguridad:
--   · PINs y tokens hasheados con SHA-256 (no en claro)
--   · Comparación con timingSafeEqual
--   · PIN expira 10 min, single-use
--   · Token long-lived pero revocable (revoked_at)

CREATE TABLE IF NOT EXISTS "mobile_pins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"pin_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_email" text
);

DO $$ BEGIN
	ALTER TABLE "mobile_pins" ADD CONSTRAINT "mobile_pins_client_id_clients_id_fk"
		FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Lookup rápido en /redeem: PINs no usados de un client.
CREATE INDEX IF NOT EXISTS "mobile_pins_active_idx"
	ON "mobile_pins" ("client_id", "expires_at")
	WHERE "redeemed_at" IS NULL;

CREATE TABLE IF NOT EXISTS "mobile_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"device_label" text,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mobile_sessions_token_hash_unique" UNIQUE ("token_hash")
);

DO $$ BEGIN
	ALTER TABLE "mobile_sessions" ADD CONSTRAINT "mobile_sessions_client_id_clients_id_fk"
		FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Listar sesiones activas de un cliente (para UI de gestión).
CREATE INDEX IF NOT EXISTS "mobile_sessions_client_active_idx"
	ON "mobile_sessions" ("client_id", "last_used_at" DESC)
	WHERE "revoked_at" IS NULL;
