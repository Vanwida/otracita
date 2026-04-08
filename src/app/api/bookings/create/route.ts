import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { db } from '@/db';
import { bookings, clients } from '@/db/schema';
import { eq, and, ne } from 'drizzle-orm';

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function hasTimeOverlap(
  existTime: string,
  existDuration: number,
  newTime: string,
  newDuration: number,
): boolean {
  const existStart = toMinutes(existTime);
  const existEnd = existStart + existDuration;
  const newStart = toMinutes(newTime);
  const newEnd = newStart + newDuration;
  return existStart < newEnd && existEnd > newStart;
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email));

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  let body: {
    customerName?: string;
    customerPhone: string;
    service: string;
    barber?: string;
    date: string;
    time: string;
    duration: number;
    price?: number;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { customerName, customerPhone, service, barber, date, time, duration, price } = body;

  if (!customerPhone || !service || !date || !time || !duration) {
    return NextResponse.json(
      { error: 'customerPhone, service, date, time, duration are required' },
      { status: 400 },
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }

  if (!/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: 'Invalid time format' }, { status: 400 });
  }

  // Check for conflicts: same client, same date, not cancelled
  const existingOnDay = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, client.id),
        eq(bookings.date, date),
        ne(bookings.status, 'cancelled'),
      ),
    );

  // Filter to relevant barber conflicts, then check time overlap
  const conflicts = existingOnDay.filter(b => {
    // If a barber is specified, only conflict with the same barber (or unassigned)
    if (barber) {
      if (b.barber && b.barber.toLowerCase() !== barber.toLowerCase()) return false;
    }
    return hasTimeOverlap(b.time, b.duration, time, duration);
  });

  if (conflicts.length > 0) {
    return NextResponse.json(
      { error: 'Ya hay una reserva en ese horario.' },
      { status: 409 },
    );
  }

  const [created] = await db
    .insert(bookings)
    .values({
      clientId: client.id,
      customerPhone,
      customerName: customerName || null,
      service,
      barber: barber || null,
      date,
      time,
      duration,
      price: price ?? null,
      status: 'confirmed',
      source: 'bot',
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
