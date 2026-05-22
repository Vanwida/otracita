-- Liquidación de propinas al barbero (épica Reni #28 parte 3b 2026-05-22).
--
-- Cambios aditivos en `tips` — el jefe marca cuándo le pagó al barbero la
-- propina (transferencia, cash en mano, o ya incluida en su nómina del mes):
--   - tips.paid_out_at        (timestamptz, nullable)  → NULL = pendiente.
--   - tips.paid_out_method    (text, nullable)         → 'cash' | 'transfer' | 'card_payroll'.
--   - tips.paid_out_by_email  (text, nullable)         → auditoría: jefe que marcó el pago.
--
-- Hasta que `paid_out_at IS NULL`, la propina sigue contando como "pendiente"
-- en el motor de payroll (filtro AND paid_out_at IS NULL en monthly.ts) y
-- en el KPI "Pendiente entregar" de /ventas/propinas.
--
-- Filas pre-existentes quedan con NULL en estas columnas → todas las
-- propinas históricas quedan automáticamente como "pendientes" (correcto: el
-- jefe no las ha marcado aún, debe revisarlas y marcar las que ya pagó).
--
-- Idempotente — guards IF NOT EXISTS, se puede re-aplicar sin error.

ALTER TABLE "tips" ADD COLUMN IF NOT EXISTS "paid_out_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN IF NOT EXISTS "paid_out_method" text;--> statement-breakpoint
ALTER TABLE "tips" ADD COLUMN IF NOT EXISTS "paid_out_by_email" text;
