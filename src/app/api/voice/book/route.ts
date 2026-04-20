import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { bookings } from '@/db/schema';
import { assignBarber } from '@/lib/availability';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';

interface ServiceConfig {
  name: string;
  duration: number;
  price?: number;
}

export async function POST(req: NextRequest) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);
  const { client } = access;

  let body: {
    customerName: string;
    customerPhone?: string;
    service: string;
    barber?: string;
    date: string;
    time: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { customerName, customerPhone, service, barber, date, time } = body;

  if (!customerName || !service || !date || !time) {
    return NextResponse.json(
      { error: 'Missing required fields: customerName, service, date, time' },
      { status: 400 }
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }

  if (!/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: 'Invalid time format' }, { status: 400 });
  }

  const services = (client.chatbotServices as ServiceConfig[]) || [];
  const matched = services.find(
    s => s.name.toLowerCase() === service.toLowerCase()
  );
  const duration = matched?.duration ?? 30;
  const price = matched?.price ?? null;

  // Auto-assign barber if none specified
  const barberNames = ((client.booksyServices as Array<{ name: string }>) || []).map(b => b.name);
  const resolvedBarber =
    barber ||
    (barberNames.length > 0
      ? await assignBarber(client.id, barberNames, date, time, duration)
      : null);

  await db.insert(bookings).values({
    clientId: client.id,
    customerPhone: customerPhone || 'voice',
    customerName,
    service,
    barber: resolvedBarber,
    date,
    time,
    duration,
    price,
    status: 'confirmed',
    source: 'bot',
    googleEventId: null,
  });

  return NextResponse.json({
    success: true,
    booking: { date, time, service, barber: barber || null },
  });
}
