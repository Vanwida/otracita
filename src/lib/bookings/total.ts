import { db } from '@/db';
import { bookings, bookingServices } from '@/db/schema';
import { eq } from 'drizzle-orm';

// -----------------------------------------------------------------------------
// bookingTotalCents — importe REAL de una cita en céntimos.
//
// Una cita multi-servicio (R7) parte el dinero en dos sitios:
//   · servicio PRINCIPAL → `bookings.price`            (EUROS, foot-gun schema)
//   · cada servicio EXTRA → `booking_services.priceEuros` (EUROS, mismo foot-gun)
//
// Cualquier sitio que cobre/contabilice una cita debe sumar AMBOS o pierde el
// dinero de los extras (caja descuadrada, barbero infrapagado, P&L mal). Esta
// es la única fuente imperativa por-booking; refleja exactamente la lógica de
// la factura (ver `src/lib/invoicing.ts` líneas ~150-190), que ya era correcta.
//
// Para cita SIMPLE (bot/voice/import o sin extras) el SELECT de extras
// devuelve [] y el resultado es idéntico al `bookings.price * 100` de antes
// (no-regresión). priceEuros null = cortesía → no suma.
//
// Tenant-safe: NO recibe clientId; opera sobre un bookingId concreto cuyo
// tenant ya validó el caller (requireClientAccess). booking_services hereda
// el tenant del booking por FK + ON DELETE CASCADE.
// -----------------------------------------------------------------------------

/**
 * Total de la cita en CÉNTIMOS = round((bookings.price + Σ extras) * 100).
 *
 * Devuelve 0 si la cita no existe o no tiene importe (no lanza). El ×100 se
 * aplica una sola vez sobre la suma en euros, igual que la factura, para que
 * el redondeo coincida con el resto del sistema.
 */
export async function bookingTotalCents(bookingId: string): Promise<number> {
  const [booking] = await db
    .select({ price: bookings.price })
    .from(bookings)
    .where(eq(bookings.id, bookingId));

  if (!booking) return 0;

  const extraRows = await db
    .select({ priceEuros: bookingServices.priceEuros })
    .from(bookingServices)
    .where(eq(bookingServices.bookingId, bookingId));

  let totalEuros = booking.price != null && booking.price > 0 ? booking.price : 0;
  for (const ex of extraRows) {
    if (ex.priceEuros != null && ex.priceEuros > 0) totalEuros += ex.priceEuros;
  }

  return Math.round(totalEuros * 100);
}
