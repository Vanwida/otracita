-- Modo barbero v2 — invertir auth (#71 revisitado).
--
-- Cambia el modelo de "link mágico anónimo" por "cuenta Better Auth con
-- role=barber + invitación por email del dueño".
--
-- A. Añade campos al `user` table de Better Auth:
--    · role        — 'admin' | 'barber'. Default 'admin' (dueños que se registran).
--    · client_id   — tenant del que es miembro (admins y barbers). Un user
--                    pertenece a UN solo tenant (multi-tenancy estricta).
--    · barber_id   — si role='barber', enlaza al registro `barbers`.
--    · disabled_at — soft-disable para revocar acceso sin borrar histórico.
--
-- B. Crea tabla `barber_invites` (un row por invitación pendiente o histórica).
--
-- C. Elimina columnas obsoletas del modelo viejo:
--    · barbers.personal_access_token
--    · barbers.personal_access_generated_at

-- A. ALTER TABLE "user" ---------------------------------------------------
DO $$ BEGIN
  ALTER TABLE "user" ADD COLUMN "role" text NOT NULL DEFAULT 'admin';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "user" ADD COLUMN "clientId" uuid;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "user" ADD COLUMN "barberId" uuid;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "user" ADD COLUMN "disabledAt" timestamp with time zone;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "user"
    ADD CONSTRAINT "user_clientId_clients_id_fk"
    FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "user"
    ADD CONSTRAINT "user_barberId_barbers_id_fk"
    FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "user"
    ADD CONSTRAINT "user_role_check"
    CHECK ("role" IN ('admin', 'barber'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "user_clientId_idx" ON "user" ("clientId");
CREATE INDEX IF NOT EXISTS "user_barberId_idx" ON "user" ("barberId");
CREATE INDEX IF NOT EXISTS "user_role_idx" ON "user" ("role");

-- B. CREATE TABLE "barber_invites" ----------------------------------------
CREATE TABLE IF NOT EXISTS "barber_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "barber_id" uuid REFERENCES "barbers"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "token" text NOT NULL UNIQUE,
  "invited_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "invited_at" timestamp with time zone NOT NULL DEFAULT now(),
  "accepted_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "barber_invites_client_id_idx" ON "barber_invites" ("client_id");
CREATE INDEX IF NOT EXISTS "barber_invites_barber_id_idx" ON "barber_invites" ("barber_id");
CREATE INDEX IF NOT EXISTS "barber_invites_email_idx" ON "barber_invites" ("email");

-- C. DROP columnas modelo viejo -------------------------------------------
ALTER TABLE "barbers" DROP COLUMN IF EXISTS "personal_access_token";
ALTER TABLE "barbers" DROP COLUMN IF EXISTS "personal_access_generated_at";
