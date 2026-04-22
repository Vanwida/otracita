import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { barbers as barbersTable } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
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
    /** Barber name as heard by the voice pipeline. Resolved to a real id
     *  below; falls back to auto-assignment if no match. */
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

  let barberId: string | undefined;
  if (barber && barber.trim()) {
    const [row] = await db
      .select({ id: barbersTable.id })
      .from(barbersTable)
      .where(
        and(
          eq(barbersTable.clientId, client.id),
          eq(barbersTable.name, barber.trim()),
          eq(barbersTable.active, true),
        ),
      );
    if (row) barberId = row.id;
  }

  const result = await createBooking({
    client,
    customerName,
    customerPhone,
    service,
    barberId,
    date,
    time,
    source: 'bot',
  });

  if (!result.success) {
    const status =
      result.error === 'overlap' ? 409
      : result.error === 'lead_time' || result.error === 'horizon' || result.error === 'no_barber_available' ? 422
      : 400;
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
