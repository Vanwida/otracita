import { db } from '@/db'
import { waitlist } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { getAppSession } from '@/lib/app-auth/session'

// -----------------------------------------------------------------------------
// DELETE /api/public/waitlist/[id]
//
// Cliente PWA cancela su propia entrada de lista de espera ("ya no me
// interesa"). Ownership: la entrada debe pertenecer al teléfono de la sesión
// PWA — exactamente igual que /api/app/bookings/[id]/cancel.
//
// Marca status='cancelled' (no borra). Si la entrada ya estaba booked/
// converted devolvemos ok sin tocar nada (idempotencia).
// -----------------------------------------------------------------------------

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAppSession()
  if (!session) return Response.json({ error: 'No autenticado' }, { status: 401 })
  const { id } = await params

  const [entry] = await db.select().from(waitlist).where(eq(waitlist.id, id))
  if (!entry) return Response.json({ error: 'Entrada no encontrada' }, { status: 404 })
  if (entry.customerPhone !== session.phone) {
    return Response.json({ error: 'No autorizado' }, { status: 403 })
  }
  if (entry.status === 'cancelled' || entry.status === 'booked' || entry.status === 'converted') {
    return Response.json({ ok: true, alreadyClosed: true })
  }

  await db
    .update(waitlist)
    .set({ status: 'cancelled' })
    .where(and(eq(waitlist.id, id), eq(waitlist.customerPhone, session.phone)))

  return Response.json({ ok: true })
}
