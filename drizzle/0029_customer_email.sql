-- R4 — email por cliente. Columna opcional en customers: la captura el
-- form público de reserva o la edita el barbero en /dashboard/clientes.
-- Aditivo y nullable: no rompe filas existentes (quedan con email NULL).

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "email" text;
