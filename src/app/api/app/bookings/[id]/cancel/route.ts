import { db } from '@/db'
import { bookings } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { getAppSession } from '@/lib/app-auth/session'
import { tryVoidInvoicesInBackground } from '@/lib/invoicing'
import { onBookingCancelled } from '@/lib/waitlist/match'

// -----------------------------------------------------------------------------
// POST /api/app/bookings/[id]/cancel
//
// Customer cancels their own booking from the PWA. Ownership check: the
// booking's customerPhone must match the session's phone — prevents one
// logged-in user from cancelling another user's appointments.
//
// Side effects: invoice (if any) gets voided automatically via the shared
// helper; the reminder cron already skips cancelled rows.
// -----------------------------------------------------------------------------

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAppSession()
  if (!session) return Response.json({ error: 'No autenticado' }, { status: 401 })
  const { id } = await params

  const [existing] = await db.select().from(bookings).where(eq(bookings.id, id))
  if (!existing) return Response.json({ error: 'Reserva no encontrada' }, { status: 404 })
  if (existing.customerPhone !== session.phone) {
    return Response.json({ error: 'No autorizado' }, { status: 403 })
  }
  if (existing.status === 'cancelled' || existing.status === 'no_show') {
    return Response.json({ ok: true, alreadyCancelled: true })
  }

  await db
    .update(bookings)
    .set({ status: 'cancelled', cancelledAt: new Date() })
    .where(and(eq(bookings.id, id), eq(bookings.customerPhone, session.phone)))

  tryVoidInvoicesInBackground(id)

  // Waitlist (#88): si alguien estaba esperando este slot, le avisamos.
  // Fire-and-forget — nunca tira la cancelación.
  onBookingCancelled({
    clientId: existing.clientId,
    bookingId: existing.id,
    date: existing.date,
    time: existing.time,
    duration: existing.duration,
    barberId: existing.barberId,
    barber: existing.barber,
    service: existing.service,
    customerPhone: existing.customerPhone,
  }).catch((err) => console.error('[app/cancel] waitlist match failed:', err))

  return Response.json({ ok: true })
}
