import { db } from '@/db'
import { manualIncomes } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'controlFinanciero')
  if (gate) return gate

  const { id } = await params
  await db
    .delete(manualIncomes)
    .where(and(eq(manualIncomes.id, id), eq(manualIncomes.clientId, access.client.id)))

  return Response.json({ ok: true })
}
