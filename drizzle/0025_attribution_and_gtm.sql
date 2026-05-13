-- Attribution (first/last touch) + GTM container ID per barbería.
--
-- First-touch en customers: una vez por cliente, no se sobrescribe. Permite
-- al barbero saber qué canal le trae clientes NUEVOS (decisión de inversión
-- en ads).
--
-- Last-touch en bookings: por cada reserva. Permite ver cómo cambia el origen
-- del mismo cliente entre reservas (Instagram primera vez → directo después).
--
-- GTM container ID en clients: feature Pro. Si está seteado, /b/[slug]/*
-- inyecta el snippet de GTM y dispara `booking_confirmed` en dataLayer al
-- confirmar reserva.

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "gtm_container_id" text;

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "first_source" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "first_source_medium" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "first_source_campaign" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "first_source_captured_at" timestamp with time zone;

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "referrer_source" text;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "referrer_medium" text;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "referrer_campaign" text;
