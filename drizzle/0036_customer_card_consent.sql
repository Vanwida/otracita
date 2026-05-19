-- No-show save-card consent — tarjeta guardada + consentimiento del cliente.
--
-- Activa el cobro de la tarifa por no-show (mecanismo + clients.no_show_fee_cents
-- ya en prod desde 0035). El Customer y el PaymentMethod viven en la cuenta
-- PLATAFORMA de Stripe (no en la Connect del barbero); el cobro off-session se
-- hace como destination charge igual que el resto de pagos.
--
-- Se rellena SOLO cuando clients.no_show_fee_cents > 0 y la reserva es
-- web/PWA. El bot WhatsApp está EXENTO (no hay superficie de tarjeta) →
-- estas columnas quedan NULL para esas filas y el no-show no cobra.
--
-- Aditivo: IF NOT EXISTS → re-aplicar es no-op. NO toca columnas existentes.
-- Tenants con no_show_fee_cents = 0 (default) no ven ningún cambio de
-- comportamiento: el flujo de reserva no pide tarjeta.

ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "stripe_customer_id" text;
ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "default_payment_method_id" text;
ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "card_consent_at" timestamp with time zone;
ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "card_consent_source" text;
