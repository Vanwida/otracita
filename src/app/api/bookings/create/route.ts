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
    customerName?: string;
    customerPhone: string;
    service: string;
    /** Either a barber name (legacy UI) or the new canonical id. Both resolve
     *  to a real row in `barbers`; if neither is provided we auto-assign. */
    barber?: string;
    barberId?: string;
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

  const { customerName, customerPhone, service, barber, barberId: bodyBarberId, date, time, duration, price } = body;

  if (!customerPhone || !service || !date || !time || !duration) {
    return NextResponse.json(
      { error: 'customerPhone, service, date, time, duration are required' },
      { status: 400 },
    );
  }

  // Resolve a barber name to its id. Keeps the legacy UI working until we
  // migrate callers to send `barberId` directly.
  let resolvedBarberId: string | undefined = bodyBarberId;
  if (!resolvedBarberId && barber && barber.trim()) {
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
    if (row) resolvedBarberId = row.id;
    // If the name doesn't match any active barber → treat as "any" instead of
    // rejecting. Better UX than "unknown barber" when a shop renames someone.
  }

  const result = await createBooking({
    client,
    customerName,
    customerPhone,
    service,
    barberId: resolvedBarberId,
    date,
    time,
    duration,
    price,
    source: 'bot',
  });

  if (!result.success) {
    const status =
      result.error === 'overlap' ? 409
      : result.error === 'lead_time' || result.error === 'horizon' || result.error === 'no_barber_available' ? 422
      : 400;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json(result.booking, { status: 201 });
}
