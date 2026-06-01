import { db } from '@/db'
import { customers } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

/**
 * POST /api/dashboard/customers/[customerId]/block
 *
 * Marca a un cliente como `blocked` (bloqueo manual del barbero). A partir de
 * ahí no podrá AUTO-reservar por bot/PWA/voz — el chequeo vive en
 * `createBooking` (solo canales self-service). El barbero sigue pudiendo
 * agendarlo a mano desde el dashboard.
 *
 * Multi-tenant safe: el update se acota por `clientId` derivado de la sesión,
 * nunca de la request — un tenant no puede tocar clientes de otro.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)

  const { customerId } = await params
  if (!customerId) {
    return Response.json({ error: 'Missing customerId' }, { status: 400 })
  }

  const result = await db
    .update(customers)
    .set({ reputation: 'blocked' })
    .where(and(eq(customers.id, customerId), eq(customers.clientId, access.client.id)))
    .returning({ id: customers.id })

  if (result.length === 0) {
    return Response.json({ error: 'Customer not found' }, { status: 404 })
  }

  return Response.json({ ok: true })
}
