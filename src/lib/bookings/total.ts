import { db } from '@/db';
import { bookings, bookingServices } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { computeBookingTotalCentsFromRows } from './total-compute';

// -----------------------------------------------------------------------------
// bookingTotalCents — importe REAL de una cita en céntimos.
//
// Una cita multi-servicio (R7) parte el dinero en dos sitios:
//   · servicio PRINCIPAL → `bookings.price_cents`         (CÉNTIMOS)
//   · cada servicio EXTRA → `booking_services.price_cents` (CÉNTIMOS)
//
// Cualquier sitio que cobre/contabilice una cita debe sumar AMBOS o pierde el
// dinero de los extras (caja descuadrada, barbero infrapagado, P&L mal). Esta
// es la única fuente imperativa por-booking; refleja exactamente la lógica de
// la factura (ver `src/lib/invoicing.ts` líneas ~150-190), que ya era correcta.
//
// Para cita SIMPLE (bot/voice/import o sin extras) el SELECT de extras
// devuelve [] y el resultado es exactamente `bookings.priceCents`.
// priceCents null = cortesía → no suma.
//
// Tenant-safe: NO recibe clientId; opera sobre un bookingId concreto cuyo
// tenant ya validó el caller (requireClientAccess). booking_services hereda
// el tenant del booking por FK + ON DELETE CASCADE.
// -----------------------------------------------------------------------------

/**
 * Total de la cita en CÉNTIMOS = bookings.priceCents + Σ extras.priceCents.
 *
 * Devuelve 0 si la cita no existe o no tiene importe (no lanza).
 */
export async function bookingTotalCents(bookingId: string): Promise<number> {
  const [booking] = await db
    .select({ priceCents: bookings.priceCents })
    .from(bookings)
    .where(eq(bookings.id, bookingId));

  if (!booking) return 0;

  const extraRows = await db
    .select({ priceCents: bookingServices.priceCents })
    .from(bookingServices)
    .where(eq(bookingServices.bookingId, bookingId));

  return computeBookingTotalCentsFromRows(booking.priceCents, extraRows);
}
