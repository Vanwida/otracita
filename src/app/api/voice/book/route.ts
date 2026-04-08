import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';
import { db } from '@/db';
import { clients, bookings } from '@/db/schema';
import { eq } from 'drizzle-orm';

interface ServiceConfig {
  name: string;
  duration: number;
  price?: number;
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email));

  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const services = (client.chatbotServices as ServiceConfig[]) || [];
  const matched = services.find(
    s => s.name.toLowerCase() === service.toLowerCase()
  );
  const duration = matched?.duration ?? 30;
  const price = matched?.price ?? null;

  await db.insert(bookings).values({
    clientId: client.id,
    customerPhone: customerPhone || 'voice',
    customerName,
    service,
    barber: barber || null,
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
