import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { db } from '@/db';
import { bookings, clients } from '@/db/schema';
import { eq, and, gte, lte, ne } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email));

  if (!client) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = req.nextUrl;
  const start = searchParams.get('start'); // YYYY-MM-DD
  const end = searchParams.get('end');     // YYYY-MM-DD
  const barber = searchParams.get('barber'); // optional filter

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end required' }, { status: 400 });
  }

  const conditions = [
    eq(bookings.clientId, client.id),
    gte(bookings.date, start),
    lte(bookings.date, end),
    ne(bookings.status, 'cancelled'),
  ];

  const rows = await db
    .select()
    .from(bookings)
    .where(and(...conditions));

  // Filter by barber in JS to handle 'all' and nulls cleanly
  const filtered =
    barber && barber !== 'all'
      ? rows.filter(b => b.barber?.toLowerCase() === barber.toLowerCase())
      : rows;

  const events = filtered.map(b => ({
    id: b.id,
    title: `${b.customerName || b.customerPhone} — ${b.service}`,
    date: b.date,
    time: b.time,
    duration: b.duration,
    barber: b.barber,
    source: b.source,
    status: b.status,
    customerPhone: b.customerPhone,
    customerName: b.customerName,
    price: b.price,
    service: b.service,
  }));

  return NextResponse.json(events);
}
