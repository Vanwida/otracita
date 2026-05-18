import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { bookings } from '@/db/schema';
import { eq, and, gte, lte, ne } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';

export async function GET(req: NextRequest) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);
  const { client } = access;

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
    barberId: b.barberId,
    source: b.source,
    status: b.status,
    customerPhone: b.customerPhone,
    customerName: b.customerName,
    price: b.price,
    service: b.service,
    paymentMethod: b.paymentMethod,
    // Columna real cableada en el commit A2 (migración aditiva). `?? false`
    // mantiene el contrato del tipo estable aunque la columna aún no exista
    // en una DB sin migrar (se aplica lazy — ver convención #6 del repo).
    barberRequested: b.barberRequested ?? false,
  }));

  return NextResponse.json(events);
}
