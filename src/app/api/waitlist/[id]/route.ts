import { db } from '@/db'
import { waitlist } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { requireTenantActor, tenantActorErrorResponse } from '@/lib/auth/require-tenant-actor'

// -----------------------------------------------------------------------------
// DELETE /api/waitlist/[id]
//
// El barbero (dashboard) puede limpiar una entrada de la lista de espera —
// p.ej. ya habló con el cliente por teléfono y reservó manualmente, o la
// entrada es ruido. Tenant-scoped: solo entradas del propio cliente.
//
// Comportamiento: marca `status='cancelled'` en vez de borrar la fila para
// preservar el historial (útil para reporting "X% de la waitlist convierte").
// -----------------------------------------------------------------------------

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireTenantActor(req)
  if (!access.ok) return tenantActorErrorResponse(access)
  const { id } = await params

  const [row] = await db
    .select()
    .from(waitlist)
    .where(and(eq(waitlist.id, id), eq(waitlist.clientId, access.client.id)))
  if (!row) return Response.json({ error: 'Entrada no encontrada' }, { status: 404 })

  if (row.status === 'cancelled' || row.status === 'booked' || row.status === 'converted') {
    return Response.json({ ok: true, alreadyClosed: true })
  }

  await db
    .update(waitlist)
    .set({ status: 'cancelled' })
    .where(and(eq(waitlist.id, id), eq(waitlist.clientId, access.client.id)))

  return Response.json({ ok: true })
}
