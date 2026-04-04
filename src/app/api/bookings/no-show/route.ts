import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { bookings, customers } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { bookingId } = await req.json()
  if (!bookingId) {
    return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 })
  }

  // Get booking and verify it belongs to this client
  const bookingRows = await db.select().from(bookings).where(eq(bookings.id, bookingId))
  const booking = bookingRows[0]
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  // Mark booking as no_show
  await db.update(bookings)
    .set({ status: 'no_show' })
    .where(eq(bookings.id, bookingId))

  // Update customer reputation
  const customerRows = await db.select().from(customers).where(
    and(
      eq(customers.clientId, booking.clientId),
      eq(customers.phone, booking.customerPhone)
    )
  )

  if (customerRows[0]) {
    const customer = customerRows[0]
    const newNoShows = (customer.noShows ?? 0) + 1
    const reputation = newNoShows >= 3 ? 'blocked' : newNoShows >= 2 ? 'warning' : 'good'

    await db.update(customers)
      .set({ noShows: newNoShows, reputation })
      .where(eq(customers.id, customer.id))
  }

  return NextResponse.json({ success: true })
}
