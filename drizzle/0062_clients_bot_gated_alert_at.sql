-- L-17: aviso a Alex cuando entran WhatsApps a una barbería con el bot
-- gateado por plan. Esta columna es el cerrojo del "una vez al día": el
-- aviso se reclama con un UPDATE condicional sobre ella, de forma que
-- varias invocaciones concurrentes del webhook no puedan mandar dos.
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "bot_gated_alert_at" timestamp with time zone;
