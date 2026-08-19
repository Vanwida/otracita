import { db } from '@/db';
import { sql } from 'drizzle-orm';
import {
  requireBarberRole,
  barberRoleErrorResponse,
} from '@/lib/auth/require-barber-role';
import { hasManagerPermission } from '@/lib/manager-permissions';
import { barbers, bookings } from '@/db/schema';
import { BUSINESS_TIMEZONE } from '@/lib/time';

// -----------------------------------------------------------------------------
// GET /api/yo/equipo — datos del equipo para la pantalla `/yo/equipo`.
//
// Gating mixto (alguno de los dos basta):
//   · view_commissions   → lista de barberos + comisiones del mes.
//   · edit_team_clients  → además, el manager puede entrar a la lista de
//                          clientes del equipo (esa lógica vive en otras
//                          pantallas — aquí solo flagueamos disponibilidad).
//
// Operator puro: 403.
//
// Devuelve, para cada barbero ACTIVO del tenant:
//   · id, name, photoUrl, role
//   · monthlySalesCents (gross — bookings completados del mes)
//   · todayBookings (count de citas hoy)
//
// El cálculo de "comisiones efectivas" exige `computeMonthlyPayroll` —
// pesado para esta vista mobile. Mantenemos sólo gross sales del mes
// (la métrica útil para el manager día a día). El admin sigue teniendo la
// nómina completa en `/dashboard/equipo/nominas`.
// -----------------------------------------------------------------------------

function todayInBusinessTz(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE });
}

function startOfMonthISO(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 7)}-01`;
}

export async function GET(req: Request) {
  const access = await requireBarberRole(req);
  if (!access.ok) return barberRoleErrorResponse(access);
  const { user, client } = access;

  const canCommissions = hasManagerPermission(user, 'view_commissions');
  const canClients = hasManagerPermission(user, 'edit_team_clients');
  if (!canCommissions && !canClients) {
    return Response.json({ error: 'No tienes permiso.' }, { status: 403 });
  }

  const today = todayInBusinessTz();
  const monthStart = startOfMonthISO(today);

  // Lista de barberos activos del tenant.
  const team = await db
    .select({
      id: barbers.id,
      name: barbers.name,
      photoUrl: barbers.photoUrl,
      role: barbers.role,
    })
    .from(barbers)
    .where(sql`${barbers.clientId} = ${client.id} AND ${barbers.active} = true`);

  // Ventas brutas del mes por barbero. Solo si tiene `view_commissions`;
  // si solo tiene `edit_team_clients` devolvemos 0 — no queremos exponer
  // cifras de comisiones sin permiso específico.
  let salesByBarber = new Map<string, number>();
  let todayCountByBarber = new Map<string, number>();
  if (canCommissions) {
    const salesResult = await db.execute(sql`
      SELECT b.barber_id::text AS "barberId",
             COALESCE(SUM(b.price_cents), 0)::bigint AS cents
      FROM ${bookings} b
      WHERE b.client_id = ${client.id}
        AND b.status = 'completed'
        AND b.date >= ${monthStart}
        AND b.date <= ${today}
      GROUP BY b.barber_id
    `);
    const salesRows = (
      salesResult as unknown as {
        rows: { barberId: string | null; cents: string | number }[];
      }
    ).rows;
    salesByBarber = new Map(
      salesRows
        .filter((r) => r.barberId)
        .map((r) => [r.barberId as string, Number(r.cents)]),
    );

    const todayResult = await db.execute(sql`
      SELECT b.barber_id::text AS "barberId", COUNT(*)::int AS count
      FROM ${bookings} b
      WHERE b.client_id = ${client.id}
        AND b.date = ${today}
        AND b.status IN ('confirmed', 'completed')
      GROUP BY b.barber_id
    `);
    const todayRows = (
      todayResult as unknown as {
        rows: { barberId: string | null; count: number }[];
      }
    ).rows;
    todayCountByBarber = new Map(
      todayRows
        .filter((r) => r.barberId)
        .map((r) => [r.barberId as string, Number(r.count)]),
    );
  }

  return Response.json({
    permissions: {
      view_commissions: canCommissions,
      edit_team_clients: canClients,
    },
    month: {
      start: monthStart,
      end: today,
    },
    team: team.map((b) => ({
      id: b.id,
      name: b.name,
      photoUrl: b.photoUrl,
      role: b.role,
      monthlySalesCents: salesByBarber.get(b.id) ?? 0,
      todayBookings: todayCountByBarber.get(b.id) ?? 0,
    })),
  });
}
