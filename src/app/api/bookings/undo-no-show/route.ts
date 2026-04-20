import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { bookings, customers } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'

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

  // Decrement customer no-shows
  const customerRows = await db.select().from(customers).where(
    and(
      eq(customers.clientId, booking.clientId),
      eq(customers.phone, booking.customerPhone)
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
