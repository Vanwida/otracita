-- Notas libres del barbero sobre cada cliente. Solo visibles en el
-- dashboard, nunca se exponen vía PWA ni WhatsApp al cliente.

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "barber_notes" text;
