import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { bookings, barberBlocks } from '@/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import {
  requireTenantActor,
  tenantActorErrorResponse,
} from '@/lib/auth/require-tenant-actor';
import { hasManagerPermission } from '@/lib/manager-permissions';

export async function GET(req: NextRequest) {
  // Admin + role='barber' caen aquí — el modo barbero `/yo/agenda` reusa
  // el mismo CalendarView del dashboard, así que necesita poder leer la
  // agenda del tenant. La filtración por barberId la aplicamos abajo en JS.
  const actor = await requireTenantActor(req);
  if (!actor.ok) return tenantActorErrorResponse(actor);
  const { client } = actor;

  const { searchParams } = req.nextUrl;
  const start = searchParams.get('start'); // YYYY-MM-DD
  const end = searchParams.get('end');     // YYYY-MM-DD
  const barber = searchParams.get('barber'); // legacy: filtro por nombre
  // `barberId` (NUEVO) — filtra por id canónico. /yo/agenda lo manda con
  // el barberId del barbero autenticado para que CalendarView solo
  // pinte/operar sobre LO SUYO. Si role='barber' y NO tiene
  // `edit_others_bookings`, forzamos a su propio barberId (defensa en
  // profundidad — la UI ya gatea, pero el endpoint no se fía).
  let barberIdFilter = searchParams.get('barberId');
  if (!actor.isAdmin && actor.barberId) {
    // hasManagerPermission acepta `{ isManager, managerPermissions }`.
    const canSeeAll = hasManagerPermission(
      { isManager: actor.isManager, managerPermissions: actor.managerPermissions },
      'edit_others_bookings',
    );
    if (!canSeeAll) {
      barberIdFilter = actor.barberId;
    }
  }

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

  // Filter by barber in JS to handle 'all' and nulls cleanly. Doble filtro
  // (id + nombre): el id canónico tiene prioridad (/yo/agenda lo manda); el
  // filtro por nombre legacy se mantiene para el rail del admin que filtra
  // a "Solo Reni" desde el side rail.
  let filteredBookings = bookingRows;
  if (barberIdFilter && barberIdFilter !== 'all') {
    filteredBookings = filteredBookings.filter(
      (b) => b.barberId === barberIdFilter,
    );
  } else if (barber && barber !== 'all') {
    filteredBookings = filteredBookings.filter(
      (b) => b.barber?.toLowerCase() === barber.toLowerCase(),
    );
  }
  // Si el caller es un barbero limitado, también filtramos los `blocks` a
  // sus propios descansos/ausencias (no tiene sentido pintarle los de
  // otros). Admin / manager con `edit_others_bookings` ven todo.
  const filteredBlocks =
    barberIdFilter && barberIdFilter !== 'all'
      ? blockRows.filter((b) => b.barberId === barberIdFilter)
      : blockRows;

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
    priceCents: b.priceCents,
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

  const blocks = filteredBlocks.map(b => ({
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
