-- Permisos granulares por barbero (#72) — capa Manager sobre rol Barber.
--
-- Hoy `/yo/*` es uniforme (operator): cada barbero ve solo sus citas/ventas/
-- propinas y cobra lo suyo. El dueño (admin) sigue siendo el único que toca
-- Ajustes técnicos/Stripe/plan, pero hay barberos "encargados de local"
-- que necesitan ver finanzas globales, comisiones del equipo, cerrar caja,
-- marcar propinas pagadas o editar citas de otros. Sin granularidad.
--
-- Esta migración añade dos campos a la tabla `user` (Better Auth):
--   · isManager           — bool, default false. Toggle desde el editor del
--                           barbero en /dashboard/equipo. Si false, el user
--                           solo es operator (lo de siempre).
--   · managerPermissions  — jsonb array de strings, default '[]'. Cada
--                           entrada es una clave de MANAGER_PERMISSION_KEYS
--                           (view_finances, view_commissions, edit_team_clients,
--                           edit_others_bookings, edit_services, close_register,
--                           mark_tips_paid). Solo se evalúan si isManager=true.
--
-- Ambas columnas son input: false en Better Auth (no settable desde signup
-- público) — se editan desde `/api/barbers/[id]/permissions` (admin-only).
--
-- Idempotente: protege contra re-ejecuciones (DO $$ ... EXCEPTION WHEN
-- duplicate_column). Ningún backfill — los users existentes empiezan en
-- isManager=false / managerPermissions=[] (operator puro), que es el
-- comportamiento actual.

DO $$ BEGIN
  ALTER TABLE "user" ADD COLUMN "isManager" boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "user" ADD COLUMN "managerPermissions" jsonb NOT NULL DEFAULT '[]'::jsonb;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
