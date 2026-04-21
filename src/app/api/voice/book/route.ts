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
      { status: 400 },
    );
  }

  // Voice bookings MUST carry a real caller phone — we previously fell back to
  // the literal string "voice" which polluted the customers table and broke
  // WhatsApp reminders/invoicing. If the upstream voice pipeline can't supply
  // a phone, the reservation has to be rejected.
  if (!customerPhone || !customerPhone.trim()) {
    return NextResponse.json(
      { error: 'customerPhone is required for voice bookings' },
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
    source: 'bot',
  });

  if (!result.success) {
    const status = result.error === 'overlap' ? 409 : 400;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({
    success: true,
    booking: {
      date: result.booking.date,
      time: result.booking.time,
      service: result.booking.service,
      barber: result.booking.barber,
    },
  });
}
