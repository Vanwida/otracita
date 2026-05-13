import { db } from '@/db'
import { ownerWithdrawals } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'

// -----------------------------------------------------------------------------
// DELETE /api/finanzas/withdrawals/[id]
// -----------------------------------------------------------------------------

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'controlFinanciero')
  if (gate) return gate

  const { id } = await params

  const deleted = await db
    .delete(ownerWithdrawals)
    .where(and(eq(ownerWithdrawals.id, id), eq(ownerWithdrawals.clientId, access.client.id)))
    .returning({ id: ownerWithdrawals.id })

  if (deleted.length === 0) {
    return Response.json({ error: 'Retiro no encontrado.' }, { status: 404 })
  }

  return Response.json({ ok: true })
}
