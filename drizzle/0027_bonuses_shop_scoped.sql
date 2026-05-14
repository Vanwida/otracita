-- Rediseño del modelo de bonos:
--
-- ANTES (0026, incorrecto):
--   · `barber_bonuses` tenía `barber_id` — un bono pertenecía a UN barbero.
--   · El dueño creaba "Reseñas Google → 50€" separadamente para cada
--     barbero. No tenía sentido conceptualmente: el bono es del LOCAL.
--
-- AHORA (0027, correcto):
--   · `bonuses` — un catálogo por barbería. Una sola fila "Reseñas Google
--     20 → 50€" que aplica a TODO el equipo.
--   · `bonus_entries` — registro de progreso. La fila guarda QUÉ barbero
--     hizo cuánto progreso hacia QUÉ bono en QUÉ día. Cada barbero
--     acumula su propio progreso por separado contra el mismo bono.
--   · El barbero que llega al target cobra; los que no, no.
--
-- Sin datos en prod (las tablas se crearon en este mismo sprint) → drop
-- y recreate. CASCADE asegura que entries se borren con el bonus.

DROP TABLE IF EXISTS "barber_bonus_entries" CASCADE;
DROP TABLE IF EXISTS "barber_bonuses" CASCADE;

CREATE TABLE IF NOT EXISTS "bonuses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL REFERENCES "clients"("id"),
  "name" text NOT NULL,
  "unit" text NOT NULL,                            -- 'units' | 'euros'
  "target" integer NOT NULL,                       -- si unit=euros, en cents
  "reward_cents" integer NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "bonuses_client_idx" ON "bonuses" ("client_id");

CREATE TABLE IF NOT EXISTS "bonus_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL REFERENCES "clients"("id"),
  "bonus_id" uuid NOT NULL REFERENCES "bonuses"("id") ON DELETE CASCADE,
  "barber_id" uuid NOT NULL REFERENCES "barbers"("id"),
  "value" integer NOT NULL,
  "date" text NOT NULL,                            -- YYYY-MM-DD
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "bonus_entries_client_idx" ON "bonus_entries" ("client_id");
CREATE INDEX IF NOT EXISTS "bonus_entries_bonus_idx" ON "bonus_entries" ("bonus_id");
CREATE INDEX IF NOT EXISTS "bonus_entries_barber_idx" ON "bonus_entries" ("barber_id");
CREATE INDEX IF NOT EXISTS "bonus_entries_date_idx" ON "bonus_entries" ("date");
