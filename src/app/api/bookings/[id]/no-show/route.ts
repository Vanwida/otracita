import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { bookings } from '@/db/schema';
import {
  requireBookingOwnership,
  bookingOwnershipErrorResponse,
} from '@/lib/auth/require-booking-ownership';
import { logBookingEvent, type BookingEventActor } from '@/lib/bookings/events';

// -----------------------------------------------------------------------------
// POST /api/bookings/[id]/no-show (admin O barber-role) — marca la cita
// como `no_show`. Admin puede sobre cualquiera del tenant; barber solo
// sobre las suyas.
//
// Idempotente: si ya está no_show / completed / cancelled devolvemos
// 400 con mensaje claro (el llamante no debería verla en lista de
// "confirmed").
// -----------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [preview] = await db
    .select({ clientId: bookings.clientId })
    .from(bookings)
    .where(eq(bookings.id, id));
  if (!preview) {
    return Response.json({ error: 'Reserva no encontrada.' }, { status: 404 });
  }

  const access = await requireBookingOwnership(req, {
    clientId: preview.clientId,
    bookingId: id,
  });
  if (!access.ok) return bookingOwnershipErrorResponse(access);
  const { booking } = access;

  if (booking.status !== 'confirmed') {
    return Response.json(
      { error: 'Solo se puede marcar no-show una cita confirmada.' },
      { status: 400 },
    );
  }

  await db
    .update(bookings)
    .set({ status: 'no_show' })
    .where(eq(bookings.id, id));

  // Log de evento (task #107). Best-effort.
  {
    const eventActor: BookingEventActor = access.isAdmin ? 'admin' : 'barber';
    await logBookingEvent({
      clientId: booking.clientId,
      bookingId: booking.id,
      type: 'no_show',
      actor: eventActor,
      actorLabel: access.user.email,
      summary: 'Marcada como no presentado',
      metadata: { date: booking.date, time: booking.time },
    });
  }

  return Response.json({ ok: true });
}
