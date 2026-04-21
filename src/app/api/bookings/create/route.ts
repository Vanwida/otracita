import { NextRequest, NextResponse } from 'next/server';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';
import { createBooking } from '@/lib/bookings/create';

export async function POST(req: NextRequest) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);
  const { client } = access;

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

  // Dashboard callers must supply a duration — voice/bot callers derive it
  // from the client's service config inside `createBooking`.
  if (!customerPhone || !service || !date || !time || !duration) {
    return NextResponse.json(
      { error: 'customerPhone, service, date, time, duration are required' },
      { status: 400 },
    );
  }

  const result = await createBooking({
    client,
    customerName,
    customerPhone,
    service,
    barber,
    date,
    time,
    duration,
    price,
    source: 'bot',
  });

  if (!result.success) {
    const status = result.error === 'overlap' ? 409 : 400;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json(result.booking, { status: 201 });
}
