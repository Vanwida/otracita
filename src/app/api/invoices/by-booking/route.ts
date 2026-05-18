import { db } from '@/db'
import { bookings, invoices } from '@/db/schema'
import { and, eq, desc } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// GET /api/invoices/by-booking?bookingId=...
//
// Devuelve la factura vigente de una cita completada — para que el panel de
// detalle pueda abrir el modal de rectificativa (A3: editar precio/servicio
// DESPUÉS de cerrar la cita nunca muta la factura sellada; emite una
// rectificativa que la sustituye legalmente).
//
// Multi-tenant safe: se resuelve el booking primero y se confirma que
// pertenece al cliente autenticado. Mismo patrón que /api/payments/by-booking.
//
// Precedencia: ignoramos las que ya están 'rectified' (esas tienen su propia
// rectificativa) y devolvemos la 'issued' más reciente — esa es la que el
// barbero querría corregir.
// -----------------------------------------------------------------------------
export async function GET(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)

  const { client, isAdmin } = access
  const url = new URL(request.url)
  const bookingId = url.searchParams.get('bookingId')

  if (!bookingId) {
    return Response.json({ error: 'Falta bookingId' }, { status: 400 })
  }

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
  if (!booking) {
    return Response.json({ error: 'Reserva no encontrada' }, { status: 404 })
  }
  if (!isAdmin && booking.clientId !== client.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.bookingId, bookingId),
        eq(invoices.clientId, booking.clientId),
      ),
    )
    .orderBy(desc(invoices.createdAt))

  // La que el barbero querría rectificar = la emitida que aún no ha sido
  // rectificada. Si todas están rectificadas, devolvemos la más reciente
  // para que la UI pueda mostrar "ya rectificada".
  const issued = rows.find((r) => r.status === 'issued')
  const latest = issued ?? rows[0] ?? null

  if (!latest) {
    return Response.json({ invoice: null })
  }

  return Response.json({
    invoice: {
      id: latest.id,
      number: latest.number,
      subtotalCents: latest.subtotalCents,
      totalCents: latest.totalCents,
      ivaRate: latest.ivaRate,
      status: latest.status,
    },
  })
}
