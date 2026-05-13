import { db } from '@/db'
import { expenses } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'

// -----------------------------------------------------------------------------
// DELETE /api/finanzas/expenses/[id]
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
    .delete(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.clientId, access.client.id)))
    .returning({ id: expenses.id })

  if (deleted.length === 0) {
    return Response.json({ error: 'Gasto no encontrado.' }, { status: 404 })
  }

  return Response.json({ ok: true })
}
