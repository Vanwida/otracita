-- L-05 — el precio de la cita pasa a CÉNTIMOS enteros.
--
-- Problema: `bookings.price` y `booking_services.price_euros` eran INTEGER en
-- EUROS. Postgres trunca al insertar, así que un servicio de 12,50 € se
-- guardaba como 12 (o 13) y la factura, la caja y las comisiones mentían.
-- Reni cobra 12,50 y 17,50: forzar enteros no es una opción.
--
-- Solución: columnas nuevas `price_cents` (INTEGER, céntimos) en ambas tablas,
-- alineadas con el resto del schema (payments.amount_cents, tips.amount_cents,
-- invoices.total_cents, products.price_cents). Se acabó el foot-gun.
--
-- Backfill: valor_viejo * 100. Los datos históricos ya eran enteros en euros,
-- así que la conversión es exacta y sin pérdida.
--
-- Las columnas viejas se DEJAN EN PIE a propósito. En este proyecto no hay
-- paso de migración en el deploy (ver CLAUDE.md): durante la ventana de
-- despliegue puede haber código antiguo leyendo `price`. Borrarlas es una
-- migración de limpieza posterior, cuando el deploy nuevo esté asentado:
--
--   ALTER TABLE bookings          DROP COLUMN price;
--   ALTER TABLE booking_services  DROP COLUMN price_euros;

--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "price_cents" integer;
--> statement-breakpoint
ALTER TABLE "booking_services" ADD COLUMN IF NOT EXISTS "price_cents" integer;
--> statement-breakpoint
UPDATE "bookings"
   SET "price_cents" = "price" * 100
 WHERE "price" IS NOT NULL
   AND "price_cents" IS NULL;
--> statement-breakpoint
UPDATE "booking_services"
   SET "price_cents" = "price_euros" * 100
 WHERE "price_euros" IS NOT NULL
   AND "price_cents" IS NULL;
