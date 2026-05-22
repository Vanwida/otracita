// -----------------------------------------------------------------------------
// Pure helper — calcula el total en céntimos de una cita a partir de los
// valores ya leídos de DB. Separado del wrapper async (`bookingTotalCents`
// en total.ts) para que sea testeable sin tocar la base de datos.
//
// Reglas (idénticas al motor de facturación en src/lib/invoicing.ts):
//   · principal null/0/negativo → contribuye 0 (no resta).
//   · extra null/0/negativo (cortesía) → contribuye 0.
//   · ×100 se aplica UNA sola vez sobre la suma en euros, para que el
//     redondeo coincida con el del invoicing.
//
// NOTA: el motor SOLO considera `bookings.price` + `bookingServices.priceEuros`.
// Las ventas de productos asociados a un booking viven en `product_sales` y
// NO entran aquí — esa contabilidad es paralela (los productos tienen su
// propio cuadre vía cash_movements y línea de factura separada).
// -----------------------------------------------------------------------------

export function computeBookingTotalCentsFromRows(
  bookingPriceEuros: number | null | undefined,
  extras: ReadonlyArray<{ priceEuros: number | null | undefined }>,
): number {
  let totalEuros =
    bookingPriceEuros != null && bookingPriceEuros > 0 ? bookingPriceEuros : 0;
  for (const ex of extras) {
    if (ex.priceEuros != null && ex.priceEuros > 0) totalEuros += ex.priceEuros;
  }
  return Math.round(totalEuros * 100);
}
