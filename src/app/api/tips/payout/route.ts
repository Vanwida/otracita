import { db } from '@/db'
import { tips } from '@/db/schema'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import {
  validatePayoutBody,
  validatePayoutRows,
} from '@/lib/tips/payout-validation'

// -----------------------------------------------------------------------------
// POST /api/tips/payout — marca un lote de propinas como pagadas al barbero
// (épica Reni #28 parte 3b 2026-05-22).
//
// "Pagada al barbero" = el jefe ya le entregó al barbero la propina por la
// vía indicada (cash en mano, transferencia, o ya la incluyó en su nómina del
// mes). Hasta que se marca, la propina cuenta como "pendiente" en el motor
// payroll (monthly.ts filtra `paid_out_at IS NULL`).
//
// Body:
//   {
//     tipIds: string[];                     // 1..N (límite 100 por seguridad)
//     method: 'cash' | 'transfer' | 'card_payroll'
//   }
//
// Validaciones (todas en `src/lib/tips/payout-validation.ts` para testearlo
// sin DB):
//   · multi-tenant (todas las tips del mismo client),
//   · status === 'paid' (no se puede liquidar una pending/expired/failed),
//   · paid_out_at IS NULL (idempotencia: no re-marcar lo ya marcado),
//   · si method === 'card_payroll', todas deben ser paymentMethod='card'
//     (no tiene sentido "pagar en nómina" una propina cash en mano).
//
// Devuelve `{ updated, totalCents }` para que la UI pinte el toast con el
// importe real liquidado.
// -----------------------------------------------------------------------------

export async function POST(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client, user } = access

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = validatePayoutBody(body)
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: parsed.status })
  }
  const { tipIds, method } = parsed

  // Cargar las tips del tenant para validar estado. Multi-tenant: WHERE
  // client_id = client.id. Si una tip pertenece a otra barbería, `rows`
  // tendrá menos filas que tipIds → validatePayoutRows devuelve 404.
  const rows = await db
    .select({
      id: tips.id,
      amountCents: tips.amountCents,
      status: tips.status,
      paymentMethod: tips.paymentMethod,
      paidOutAt: tips.paidOutAt,
    })
    .from(tips)
    .where(and(eq(tips.clientId, client.id), inArray(tips.id, tipIds)))

  const err = validatePayoutRows(rows, tipIds.length, method)
  if (err) return Response.json({ error: err.error }, { status: err.status })

  // UPDATE batch — un solo SQL. neon-http no soporta `db.transaction` real;
  // re-aplicamos `paid_out_at IS NULL` en el WHERE como segunda barrera
  // contra peticiones concurrentes (idempotencia at-most-once).
  const now = new Date()
  const updated = await db
    .update(tips)
    .set({
      paidOutAt: now,
      paidOutMethod: method,
      paidOutByEmail: user.email,
      updatedAt: now,
    })
    .where(
      and(
        eq(tips.clientId, client.id),
        inArray(tips.id, tipIds),
        isNull(tips.paidOutAt),
      ),
    )
    .returning({ id: tips.id, amountCents: tips.amountCents })

  const totalCents = updated.reduce((acc, r) => acc + r.amountCents, 0)

  return Response.json(
    { updated: updated.length, totalCents },
    { status: 200 },
  )
}
