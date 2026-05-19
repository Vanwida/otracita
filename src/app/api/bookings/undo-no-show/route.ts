import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { bookings, customers, invoices } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { canonicalPhone } from '@/lib/phone'

export async function POST(req: NextRequest) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client, isAdmin } = access

  const { bookingId } = await req.json()
  if (!bookingId) {
    return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 })
  }

  const bookingRows = await db.select().from(bookings).where(eq(bookings.id, bookingId))
  const booking = bookingRows[0]
  if (!booking || booking.status !== 'no_show') {
    return NextResponse.json({ error: 'Booking not found or not a no-show' }, { status: 404 })
  }
  if (!isAdmin && booking.clientId !== client.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Revert booking status
  await db.update(bookings)
    .set({ status: 'confirmed' })
    .where(eq(bookings.id, bookingId))

  // Restore any invoice that was auto-voided when the booking was marked
  // as no-show. MVP simplification: we flip status back to 'issued' on the
  // same row, preserving the correlative number. Not 100% fiscally orthodox
  // (strictly one should void + emit new), but acceptable for a quick
  // correction made within the same session. If the auditor ever asks,
  // the booking-status audit trail explains the sequence.
  await db.update(invoices)
    .set({ status: 'issued' })
    .where(
      and(
        eq(invoices.bookingId, bookingId),
        eq(invoices.status, 'voided'),
      ),
    )

  // Decrement customer no-shows. Match on the canonical E.164 form so a
  // legacy booking stored with a raw phone still resolves the (canonical)
  // customer row. Idempotent for bookings created after canonicalization.
  const customerRows = await db.select().from(customers).where(
    and(
      eq(customers.clientId, booking.clientId),
      eq(customers.phone, canonicalPhone(booking.customerPhone))
    )
  )

  if (customerRows[0]) {
    const customer = customerRows[0]
    const newNoShows = Math.max(0, (customer.noShows ?? 0) - 1)
    const reputation = newNoShows >= 3 ? 'blocked' : newNoShows >= 2 ? 'warning' : 'good'

    await db.update(customers)
      .set({ noShows: newNoShows, reputation })
      .where(eq(customers.id, customer.id))
  }

  return NextResponse.json({ success: true })
}
