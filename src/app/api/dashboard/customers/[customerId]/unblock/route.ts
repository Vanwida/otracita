import { db } from '@/db'
import { customers } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

/**
 * POST /api/dashboard/customers/[customerId]/unblock
 *
 * Flips a customer's reputation back to `good`. Multi-tenant safe: we scope
 * the update by `clientId` derived from the session so one tenant can never
 * touch another tenant's customer rows.
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
    .set({ reputation: 'good' })
    .where(and(eq(customers.id, customerId), eq(customers.clientId, access.client.id)))
    .returning({ id: customers.id })

  if (result.length === 0) {
    return Response.json({ error: 'Customer not found' }, { status: 404 })
  }

  return Response.json({ ok: true })
}
