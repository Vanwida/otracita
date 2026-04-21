import { db } from '@/db';
import { bookings, payments } from '@/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';

// -----------------------------------------------------------------------------
// GET /api/payments/by-booking?bookingId=...
//
// Returns the latest relevant payment row for a booking — so the booking
// panel can render "already paid" / "pending QR link" state on open without
// the barber having to click "generate". Multi-tenant safe: we look up the
// booking first and confirm it belongs to the authed client.
// -----------------------------------------------------------------------------
export async function GET(request: Request) {
  const access = await requireClientAccess(request);
  if (!access.ok) return accessErrorResponse(access);

  const { client, isAdmin } = access;
  const url = new URL(request.url);
  const bookingId = url.searchParams.get('bookingId');

  if (!bookingId) {
    return Response.json({ error: 'Falta bookingId' }, { status: 400 });
  }

  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!booking) {
    return Response.json({ error: 'Reserva no encontrada' }, { status: 404 });
  }
  if (!isAdmin && booking.clientId !== client.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Surface precedence: succeeded > pending > latest.
  const rows = await db
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), eq(payments.clientId, booking.clientId)))
    .orderBy(desc(payments.createdAt));

  const succeeded = rows.find((r) => r.status === 'succeeded');
  const pending = rows.find((r) => r.status === 'pending');
  const latest = succeeded ?? pending ?? rows[0] ?? null;

  if (!latest) {
    return Response.json({ payment: null });
  }

  return Response.json({
    payment: {
      id: latest.id,
      status: latest.status,
      amountCents: latest.amountCents,
      currency: latest.currency,
      paymentUrl: latest.paymentLinkUrl,
      paidAt: latest.paidAt,
      description: latest.description,
      createdAt: latest.createdAt,
    },
  });
}
