// -----------------------------------------------------------------------------
// Pure helper — calcula el total en céntimos de una cita a partir de los
// valores ya leídos de DB. Separado del wrapper async (`bookingTotalCents`
// en total.ts) para que sea testeable sin tocar la base de datos.
//
// Desde L-05 tanto el principal (`bookings.price_cents`) como los extras
// (`booking_services.price_cents`) están ya en CÉNTIMOS enteros, así que
// esto es una suma pura: no hay conversión ni redondeo que pueda perder
// los 50 céntimos de un servicio de 12,50 €.
//
// Reglas (idénticas al motor de facturación en src/lib/invoicing.ts):
//   · principal null/0/negativo → contribuye 0 (no resta).
//   · extra null/0/negativo (cortesía) → contribuye 0.
//
// NOTA: el motor SOLO considera `bookings.priceCents` + `bookingServices.priceCents`.
// Las ventas de productos asociados a un booking viven en `product_sales` y
// NO entran aquí — esa contabilidad es paralela (los productos tienen su
// propio cuadre vía cash_movements y línea de factura separada).
// -----------------------------------------------------------------------------

export function computeBookingTotalCentsFromRows(
  bookingPriceCents: number | null | undefined,
  extras: ReadonlyArray<{ priceCents: number | null | undefined }>,
): number {
  let total =
    bookingPriceCents != null && bookingPriceCents > 0 ? Math.round(bookingPriceCents) : 0;
  for (const ex of extras) {
    if (ex.priceCents != null && ex.priceCents > 0) total += Math.round(ex.priceCents);
  }
  return total;
}
