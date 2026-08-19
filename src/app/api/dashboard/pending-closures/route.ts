import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { bookings } from '@/db/schema';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import {
  requireTenantActor,
  tenantActorErrorResponse,
} from '@/lib/auth/require-tenant-actor';
import { hasManagerPermission } from '@/lib/manager-permissions';
import { pendingClosureWindow } from '@/lib/bookings/pending-closure';

// -----------------------------------------------------------------------------
// GET /api/dashboard/pending-closures
//
// Citas de días PASADOS que siguen en `confirmed`: ni cobradas, ni marcadas
// como no-show. Alimenta el contador «N por cerrar» de la cabecera de Agenda
// y la lista que abre ese contador (PendingClosureList).
//
// Ventana = `pendingClosureWindow()` (3 días), complementaria al barrido del
// cron: aquí sólo aparece lo que el barbero todavía PUEDE cerrar a mano.
// Sin ese suelo, una importación de histórico (.ics de Booksy con citas
// viejas en `confirmed`) inflaría el contador a cientos el primer día.
//
// Multi-tenancy: `requireTenantActor` resuelve el cliente desde la sesión —
// nunca del query. Un barbero sin `edit_others_bookings` queda forzado a sus
// propias citas (mismo refuerzo server-side que /api/dashboard/calendar).
// -----------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const actor = await requireTenantActor(req);
  if (!actor.ok) return tenantActorErrorResponse(actor);
  const { client } = actor;

  let barberIdFilter = req.nextUrl.searchParams.get('barberId');
  if (!actor.isAdmin && actor.barberId) {
    const canSeeAll = hasManagerPermission(
      { isManager: actor.isManager, managerPermissions: actor.managerPermissions },
      'edit_others_bookings',
    );
    if (!canSeeAll) barberIdFilter = actor.barberId;
  }

  const { todayStr, yesterdayStr, fromStr } = pendingClosureWindow();

  const rows = await db
    .select({
      id: bookings.id,
      date: bookings.date,
      time: bookings.time,
      customerName: bookings.customerName,
      customerPhone: bookings.customerPhone,
      service: bookings.service,
      barber: bookings.barber,
      barberId: bookings.barberId,
      priceCents: bookings.priceCents,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, client.id),
        eq(bookings.status, 'confirmed'),
        gte(bookings.date, fromStr),
        lt(bookings.date, todayStr),
      ),
    )
    .orderBy(asc(bookings.date), asc(bookings.time));

  // Filtro por barbero en JS (mismo criterio que /api/dashboard/calendar):
  // 'all' y los nulls se manejan limpiamente sin ramificar el WHERE.
  const filtered =
    barberIdFilter && barberIdFilter !== 'all'
      ? rows.filter((b) => b.barberId === barberIdFilter)
      : rows;

  return NextResponse.json({
    bookings: filtered,
    todayStr,
    yesterdayStr,
  });
}
