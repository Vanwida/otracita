-- No-show fee — tarifa por no presentarse, configurable por barbería.
--
-- 0 = desactivado (default → tenants existentes no cobran nada y los
-- callers no cambian de comportamiento). Cuando > 0 y una cita pasa a
-- no_show, /api/bookings/no-show INTENTA el cobro off-session. HOY siempre
-- se salta con motivo 'no_card_on_file' en prod (no se captura tarjeta en
-- la reserva todavía — ver propuesta de diseño en el PR). El mecanismo de
-- cobro + efecto en caja queda listo y es ADITIVO.
--
-- Idempotente: IF NOT EXISTS → re-aplicar es no-op. NO toca columnas
-- existentes.

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "no_show_fee_cents" integer DEFAULT 0 NOT NULL;
