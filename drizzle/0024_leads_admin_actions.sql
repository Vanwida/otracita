-- 0024_leads_admin_actions
--
-- 1. Extiende `leads` con columnas operativas: `notes` (cuaderno libre del
--    admin), `next_action_at` (próximo follow-up para alertas), y
--    `converted_to_client_id` (FK opcional para cerrar el funnel cuando el
--    lead se convierte en cliente). También añade `updated_at`.
--
-- 2. Crea `admin_actions` — audit log de toda mutación que se hace desde el
--    panel admin. Pregunta a responder: "¿quién pausó al cliente X y cuándo?".
--
-- Idempotente: usa `IF NOT EXISTS` en cada add column / create table.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action_at timestamp with time zone;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_to_client_id uuid;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now() NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'leads_converted_to_client_id_fk'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_converted_to_client_id_fk
      FOREIGN KEY (converted_to_client_id) REFERENCES clients(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS admin_actions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_email text NOT NULL,
  intent text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  summary text NOT NULL,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_actions_created_at_idx ON admin_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_actions_target_idx ON admin_actions (target_type, target_id);
CREATE INDEX IF NOT EXISTS leads_next_action_at_idx ON leads (next_action_at) WHERE next_action_at IS NOT NULL;
