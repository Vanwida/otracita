import { db } from '@/db'
import { customers } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

/**
 * POST /api/dashboard/customers/[customerId]/forgive
 *
 * Resets `noShows` to 0 and clears the "warning" reputation flag if it was
 * set solely by past no-shows. Doesn't touch `blocked` — a blocked customer
 * still needs an explicit /unblock, which is a stronger signal from the
 * barber. Used by the "Perdonar" button on the clientes list.
 *
 * Multi-tenant safe: `clientId` comes from the session and scopes the UPDATE
 * so one tenant can never edit another tenant's customers.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)

  const { customerId } = await params
  if (!customerId) {
    return Response.json({ error: 'Missing customerId' }, { status: 400 })
  }

  // Only clear `reputation = 'warning'` (auto-set by accumulated no-shows).
  // If the reputation is `blocked`, the barber must use /unblock explicitly.
  const result = await db
    .update(customers)
    .set({ noShows: 0, reputation: 'good' })
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.clientId, access.client.id),
        // Don't accidentally promote a blocked customer to good via forgive
        eq(customers.reputation, 'warning'),
      ),
    )
    .returning({ id: customers.id })

  if (result.length === 0) {
    // Either customer doesn't exist, belongs to another tenant, OR is
    // currently blocked. Retry the update with a looser filter to handle
    // the "was good but had noShows > 0" case (reset noShows, keep
    // reputation). Still scoped to the tenant.
    const fallback = await db
      .update(customers)
      .set({ noShows: 0 })
      .where(
        and(
          eq(customers.id, customerId),
          eq(customers.clientId, access.client.id),
        ),
      )
      .returning({ id: customers.id })
    if (fallback.length === 0) {
      return Response.json({ error: 'Customer not found' }, { status: 404 })
    }
  }

  return Response.json({ ok: true })
}
