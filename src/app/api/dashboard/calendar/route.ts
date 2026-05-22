import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { bookings, barberBlocks } from '@/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
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

  // Las canceladas SÍ se devuelven al dashboard (se pintan tachadas/grises
  // con tokens `--color-event-cancelled-*` en DayGrid). Razón de negocio:
  // accountability ("yo no cancelé eso" → la ves), patrón de cliente
  // (cancelaciones repetidas a primera vista), reproducir el hueco. Estándar
  // industria (Booksy, GCal, Square, Fresha). El predicado de SOLAPE sigue
  // excluyendo canceladas (`createBooking` y `availability`), donde no
  // deberían contar como conflicto. Esta query es solo para PINTAR.
  const bookingConditions = [
    eq(bookings.clientId, client.id),
    gte(bookings.date, start),
    lte(bookings.date, end),
  ];

  // `barber_blocks` (descansos/ausencias) en paralelo. Antes la agenda los
  // ignoraba — el barbero creaba un descanso, se guardaba en DB, pero la
  // agenda no los conocía → "no se visualiza". Ahora se devuelven junto
  // con los events para que DayGrid los pinte como overlays diagonales.
  const [bookingRows, blockRows] = await Promise.all([
    db.select().from(bookings).where(and(...bookingConditions)),
    db
      .select()
      .from(barberBlocks)
      .where(
        and(
          eq(barberBlocks.clientId, client.id),
          gte(barberBlocks.date, start),
          lte(barberBlocks.date, end),
        ),
      ),
  ]);

  // Filter by barber in JS to handle 'all' and nulls cleanly
  const filteredBookings =
    barber && barber !== 'all'
      ? bookingRows.filter(b => b.barber?.toLowerCase() === barber.toLowerCase())
      : bookingRows;

  const events = filteredBookings.map(b => ({
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
    // F3 Reni — override manual del origen al cerrar la cita. `?? null`
    // mismo motivo (columna lazy, ver convención #6).
    sourceManual: b.sourceManual ?? null,
  }));

  const blocks = blockRows.map(b => ({
    id: b.id,
    barberId: b.barberId,
    date: b.date,
    startTime: b.startTime,
    endTime: b.endTime,
    kind: b.kind as 'block' | 'absence',
    reason: b.reason,
    note: b.note,
  }));

  return NextResponse.json({ events, blocks });
}
