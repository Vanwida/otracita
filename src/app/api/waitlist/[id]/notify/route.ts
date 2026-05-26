import { db } from '@/db'
import { barbers, waitlist } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { requireTenantActor, tenantActorErrorResponse } from '@/lib/auth/require-tenant-actor'
import { onBookingCancelled } from '@/lib/waitlist/match'

// -----------------------------------------------------------------------------
// POST /api/waitlist/[id]/notify
//
// El barbero pulsa "notificar" manualmente sobre una entrada de la lista de
// espera (caso típico: la ventana de WhatsApp está cerrada, no tiene PWA, y
// el flujo automático dejó la entrada en pending_template). Reusamos el
// mismo helper `onBookingCancelled` con un "slot ficticio" — los datos del
// slot vienen de la propia entrada (date+time) más el barber resuelto.
//
// Nota: este endpoint NO crea una cita. Solo dispara el aviso. El cliente
// debe reservar él mismo a través del canal habitual.
// -----------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireTenantActor(req)
  if (!access.ok) return tenantActorErrorResponse(access)
  const { id } = await params

  const [entry] = await db
    .select()
    .from(waitlist)
    .where(and(eq(waitlist.id, id), eq(waitlist.clientId, access.client.id)))
  if (!entry) return Response.json({ error: 'Entrada no encontrada' }, { status: 404 })
  if (entry.status === 'booked' || entry.status === 'converted' || entry.status === 'cancelled') {
    return Response.json({ error: 'La entrada ya está cerrada' }, { status: 400 })
  }
  if (!entry.time) {
    return Response.json(
      { error: 'Esta entrada no tiene hora específica — usa el aviso automático.' },
      { status: 400 },
    )
  }

  // Resolver nombre del barbero canónico (si está set).
  let barberName: string | null = entry.barber
  if (entry.barberId) {
    const [b] = await db.select({ name: barbers.name }).from(barbers).where(eq(barbers.id, entry.barberId))
    if (b) barberName = b.name
  }

  // Reset transient status para que el matcher pueda volver a marcarla.
  if (entry.status === 'notified') {
    await db.update(waitlist).set({ status: 'waiting', notifiedAt: null }).where(eq(waitlist.id, id))
  }

  const result = await onBookingCancelled({
    clientId: access.client.id,
    bookingId: 'manual-notify',
    date: entry.date,
    time: entry.time,
    duration: 30,
    barberId: entry.barberId,
    barber: barberName,
    service: entry.service,
    customerPhone: '__manual__', // sentinel para no descartarse a sí misma
  })

  // Hidratamos info para que la UI sepa qué canal usó.
  return Response.json(result)
}
