-- Bonos del equipo. Manual-only v1: el dueño define un bono por barbero
-- (nombre + unit + target + recompensa) y a final del día desde caja teclea
-- el progreso. A fin de mes se ve quién llegó al target.

CREATE TABLE IF NOT EXISTS "barber_bonuses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL REFERENCES "clients"("id"),
  "barber_id" uuid NOT NULL REFERENCES "barbers"("id"),
  "name" text NOT NULL,
  "unit" text NOT NULL,                            -- 'units' | 'euros'
  "target" integer NOT NULL,                       -- si unit=euros, en cents
  "reward_cents" integer NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "barber_bonuses_client_idx" ON "barber_bonuses" ("client_id");
CREATE INDEX IF NOT EXISTS "barber_bonuses_barber_idx" ON "barber_bonuses" ("barber_id");

CREATE TABLE IF NOT EXISTS "barber_bonus_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL REFERENCES "clients"("id"),
  "barber_id" uuid NOT NULL REFERENCES "barbers"("id"),
  "bonus_id" uuid NOT NULL REFERENCES "barber_bonuses"("id") ON DELETE CASCADE,
  "value" integer NOT NULL,                        -- mismo signo que unit
  "date" text NOT NULL,                            -- YYYY-MM-DD
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "barber_bonus_entries_client_idx" ON "barber_bonus_entries" ("client_id");
CREATE INDEX IF NOT EXISTS "barber_bonus_entries_bonus_idx" ON "barber_bonus_entries" ("bonus_id");
CREATE INDEX IF NOT EXISTS "barber_bonus_entries_date_idx" ON "barber_bonus_entries" ("date");
