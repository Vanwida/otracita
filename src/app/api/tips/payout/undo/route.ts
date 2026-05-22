import { db } from '@/db'
import { tips } from '@/db/schema'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { validateUndoBody } from '@/lib/tips/payout-validation'

// -----------------------------------------------------------------------------
// POST /api/tips/payout/undo — desmarca un lote de propinas que el jefe
// había marcado como pagadas al barbero (épica Reni #28 parte 3b).
//
// Caso de uso: el jefe se equivoca, marca una propina como pagada cuando
// aún no se la había entregado. Aquí la desmarca y vuelve a quedar
// pendiente en el motor payroll.
//
// Body: { tipIds: string[] }   (1..100)
//
// Validaciones:
//   · multi-tenant,
//   · paid_out_at NOT NULL (filtramos en el UPDATE; las que ya estaban
//     pendientes no rompen, simplemente no se afectan — idempotencia inversa).
//
// Devuelve `{ updated }` — sin `totalCents` (la UI no lo necesita para undo).
// -----------------------------------------------------------------------------

export async function POST(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = validateUndoBody(body)
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: parsed.status })
  }
  const { tipIds } = parsed

  // UPDATE batch — set las 3 columnas a NULL. Filtramos `paid_out_at IS
  // NOT NULL` para no desperdiciar updates en filas ya pendientes
  // (idempotencia inversa). Multi-tenant en el WHERE.
  const now = new Date()
  const updated = await db
    .update(tips)
    .set({
      paidOutAt: null,
      paidOutMethod: null,
      paidOutByEmail: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(tips.clientId, client.id),
        inArray(tips.id, tipIds),
        isNotNull(tips.paidOutAt),
      ),
    )
    .returning({ id: tips.id })

  return Response.json({ updated: updated.length }, { status: 200 })
}
