-- cash_sessions.closing_snapshot — foto inmutable del desglose mostrado al
-- barbero al cerrar la caja (totales por método/kind/barbero). Permite
-- reconstruir el cuadre tal cual lo vio aunque luego se editen movimientos.
-- Null en sesiones cerradas pre-migración (legacy) — la UI cae al cálculo
-- en vivo cuando falta. Shape canónica documentada en
-- src/lib/cash/breakdown.ts (CashClosingSnapshot).

ALTER TABLE "cash_sessions" ADD COLUMN IF NOT EXISTS "closing_snapshot" jsonb;
