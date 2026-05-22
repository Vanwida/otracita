-- Épica Reni #26+#27 (2026-05-22): el flow unified-charge introdujo nuevos
-- métodos de pago en `bookings.payment_method` que no caben en el dominio
-- antiguo creado en 0019_cash_register.sql:
--
--   antiguo:  NULL | cash | card | online
--   nuevo:    NULL | cash | card_physical | bizum | card_online | mixed
--             + legacy cash | card | online  (back-compat con ~1.8k rows)
--
-- · card_physical → datáfono / TPV (incluye SumUp).
-- · bizum         → cobro en el Bizum del barbero (cuadra como tarjeta,
--                   ver CASH_MOVEMENT_METHOD_FROM_PAYMENT en
--                   src/lib/payments/methods.ts).
-- · card_online   → link Stripe Checkout.
-- · mixed         → pseudo-token cuando el cobro se fraccionó en > 1 método.
--                   El desglose real vive en la tabla `payments`.
--
-- El single source of truth en runtime es `src/lib/payments/methods.ts`;
-- este constraint es la guardia de integridad a nivel DB para que un INSERT
-- o UPDATE con valor fuera del enum falle ruidoso en vez de colarse.
--
-- Idempotente: DROP IF EXISTS + ADD bajo `EXCEPTION WHEN duplicate_object`.

DO $$ BEGIN
	ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_payment_method_valid";
END $$;

DO $$ BEGIN
	ALTER TABLE "bookings" ADD CONSTRAINT "bookings_payment_method_valid"
		CHECK (
			"payment_method" IS NULL
			OR "payment_method" IN (
				-- Dominio actual (épica Reni 2026-05-22)
				'cash',
				'card_physical',
				'bizum',
				'card_online',
				'mixed',
				-- Legacy (filas anteriores a la épica, conservadas tal cual)
				'card',
				'online'
			)
		);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
