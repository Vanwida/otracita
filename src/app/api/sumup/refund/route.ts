import { db } from '@/db'
import { clients, cashMovements } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { ensureValidAccessToken } from '@/lib/sumup/client'
import { getOauthEnv } from '@/lib/sumup/oauth'
import { refundSumupTransaction } from '@/lib/sumup/refund'
import { recordRefundMovement } from '@/lib/cash/record-refund'

// -----------------------------------------------------------------------------
// POST /api/sumup/refund
//
// Reembolsa un cobro hecho con el datáfono SumUp del barbero. La UI lo invoca
// pasando el cash_movement original (kind='booking', method='card') que tiene
// el sumup_transaction_id. Reembolsamos esa transaction en SumUp y emitimos un
// apunte 'refund' (RESTA del datáfono en el cuadre).
//
// Body:
//   { cashMovementId: string, amountEuros?: number }   // parcial. Omitir = total.
//
// Garantías:
//   · Multi-tenant: clientId SOLO de sesión. El movement debe pertenecer al
//     tenant (validado por clientId en el WHERE).
//   · Idempotente: el apunte de reembolso se dedupea por
//     `sumup-refund-<txid>`; un segundo intento no duplica caja. SumUp marca
//     la tx como ya reembolsada → lo tratamos como éxito (alreadyRefunded).
// -----------------------------------------------------------------------------

interface Body {
  cashMovementId?: unknown
  amountEuros?: unknown
}

export async function POST(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const { client, user } = access

  if (
    !client.sumupAccessToken ||
    !client.sumupRefreshToken ||
    !client.sumupMerchantCode
  ) {
    return Response.json({ error: 'SumUp no conectado' }, { status: 400 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const cashMovementId =
    typeof body.cashMovementId === 'string' ? body.cashMovementId : ''
  if (!cashMovementId) {
    return Response.json({ error: 'Falta cashMovementId' }, { status: 400 })
  }

  // El movement original debe ser del tenant y tener tx SumUp.
  const [movement] = await db
    .select()
    .from(cashMovements)
    .where(
      and(
        eq(cashMovements.id, cashMovementId),
        eq(cashMovements.clientId, client.id),
      ),
    )
  if (!movement) {
    return Response.json({ error: 'Cobro no encontrado' }, { status: 404 })
  }
  if (!movement.sumupTransactionId) {
    return Response.json(
      { error: 'Este cobro no es una transacción SumUp reembolsable.' },
      { status: 409 },
    )
  }
  if (movement.kind === 'refund') {
    return Response.json(
      { error: 'Este apunte ya es un reembolso.' },
      { status: 409 },
    )
  }

  // Parcial validado contra el importe original.
  let amountEuros: number | null = null
  if (body.amountEuros !== undefined && body.amountEuros !== null) {
    const n =
      typeof body.amountEuros === 'number'
        ? body.amountEuros
        : Number.parseFloat(String(body.amountEuros))
    const maxEuros = movement.amountCents / 100
    if (!Number.isFinite(n) || n <= 0 || n > maxEuros) {
      return Response.json(
        {
          error: `Importe inválido. Máximo reembolsable: ${maxEuros.toFixed(2)} €.`,
        },
        { status: 400 },
      )
    }
    amountEuros = Math.round(n * 100) / 100
  }
  const refundedCents = amountEuros
    ? Math.round(amountEuros * 100)
    : movement.amountCents

  let env: ReturnType<typeof getOauthEnv>
  try {
    env = getOauthEnv()
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'OAuth no configurado' },
      { status: 500 },
    )
  }

  const token = await ensureValidAccessToken({
    clientId: client.id,
    accessToken: client.sumupAccessToken,
    refreshToken: client.sumupRefreshToken,
    expiresAt: client.sumupTokenExpiresAt,
    oauthClientId: env.clientId,
    oauthClientSecret: env.clientSecret,
    persist: async (next) => {
      await db
        .update(clients)
        .set({
          sumupAccessToken: next.accessToken,
          sumupRefreshToken: next.refreshToken,
          sumupTokenExpiresAt: next.expiresAt,
        })
        .where(eq(clients.id, client.id))
    },
  })

  try {
    const result = await refundSumupTransaction({
      token,
      transactionId: movement.sumupTransactionId,
      amountEuros,
    })
    if (!result.refunded && !result.alreadyRefunded) {
      return Response.json(
        { error: 'SumUp no confirmó el reembolso. Reintenta.' },
        { status: 502 },
      )
    }
  } catch (err) {
    console.error('[sumup/refund] failed:', err)
    return Response.json(
      { error: 'No se pudo reembolsar en SumUp.' },
      { status: 502 },
    )
  }

  // Caja: apunte 'refund' card (RESTA del datáfono). dedupe estable.
  const cajaOutcome = await recordRefundMovement({
    clientId: client.id,
    amountCents: refundedCents,
    method: 'card',
    dedupeKey: `sumup-refund-${movement.sumupTransactionId}`,
    bookingId:
      movement.referenceType === 'booking' ? movement.referenceId : null,
    notes: `Reembolso SumUp · cobro ${movement.id.slice(0, 8)}`,
    createdByEmail: user.email,
  })

  return Response.json({
    ok: true,
    refundedCents,
    cashRegister: cajaOutcome.outcome,
  })
}
