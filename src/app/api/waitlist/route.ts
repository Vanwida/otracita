import { db } from '@/db'
import { barbers, waitlist } from '@/db/schema'
import { and, asc, eq, inArray, gte } from 'drizzle-orm'
import { requireTenantActor, tenantActorErrorResponse } from '@/lib/auth/require-tenant-actor'

// -----------------------------------------------------------------------------
// GET /api/waitlist
//
// Lista de espera activa del tenant. Pensada para el dashboard:
//   · Solo entradas con status ∈ {waiting, notified}
//   · Solo entradas cuyo `date` sea >= hoy (las pasadas se marcan expired
//     vía expirePastWaitlistEntries; aquí filtramos por si el cron va con
//     retraso)
//   · Ordenadas por fecha asc, luego hora asc, luego createdAt asc.
//
// Devuelve también el nombre del barbero canónico (LEFT JOIN) para que la UI
// pinte "con Reni" sin tener que cruzar otra request.
// -----------------------------------------------------------------------------

export async function GET(req: Request) {
  const access = await requireTenantActor(req)
  if (!access.ok) return tenantActorErrorResponse(access)

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })

  const rows = await db
    .select({
      id: waitlist.id,
      customerPhone: waitlist.customerPhone,
      customerName: waitlist.customerName,
      date: waitlist.date,
      time: waitlist.time,
      desiredTimeStart: waitlist.desiredTimeStart,
      desiredTimeEnd: waitlist.desiredTimeEnd,
      service: waitlist.service,
      barberId: waitlist.barberId,
      barberLegacyName: waitlist.barber,
      status: waitlist.status,
      notifiedAt: waitlist.notifiedAt,
      expiresAt: waitlist.expiresAt,
      createdAt: waitlist.createdAt,
      barberName: barbers.name,
    })
    .from(waitlist)
    .leftJoin(barbers, eq(barbers.id, waitlist.barberId))
    .where(
      and(
        eq(waitlist.clientId, access.client.id),
        gte(waitlist.date, today),
        inArray(waitlist.status, ['waiting', 'notified']),
      ),
    )
    .orderBy(asc(waitlist.date), asc(waitlist.time), asc(waitlist.createdAt))

  return Response.json({ entries: rows })
}
