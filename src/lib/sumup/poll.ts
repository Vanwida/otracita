// -----------------------------------------------------------------------------
// SumUp polling — para cada cliente conectado, trae transactions nuevas
// desde el último poll y las inserta en cash_movements (si hay sesión
// abierta) o en sumup_pending_transactions (si no).
//
// Idempotencia: cash_movements.sumup_transaction_id UNIQUE garantiza que
// no se dupliquen. sumup_pending_transactions también tiene UNIQUE.
//
// Token refresh: si /transactions/history devuelve 401, refrescamos con
// refresh_token + reintentamos UNA vez. Si falla otra vez, marcamos el
// cliente como "needs reconnect" (en V1: simplemente log y skip).
// -----------------------------------------------------------------------------

import { db } from '@/db'
import {
  clients,
  cashSessions,
  cashMovements,
  sumupPendingTransactions,
} from '@/db/schema'
import { and, eq, isNull, sql, isNotNull } from 'drizzle-orm'
import {
  listTransactionsSince,
  refreshAccessToken,
  SumupApiError,
  type SumupTransaction,
} from './client'
import { findBestMatch, sumupAmountToCents } from './match'
import { getOauthEnv } from './oauth'

export interface PollSummary {
  clientId: string
  merchantCode: string
  fetched: number
  matchedToManual: number
  insertedAsMovement: number
  insertedAsPending: number
  refunds: number
  errors: number
}

/**
 * Polling para UN cliente concreto. Lo invoca el cron por cada client
 * con sumup_access_token != null.
 */
export async function pollClient(clientId: string): Promise<PollSummary> {
  const summary: PollSummary = {
    clientId,
    merchantCode: '',
    fetched: 0,
    matchedToManual: 0,
    insertedAsMovement: 0,
    insertedAsPending: 0,
    refunds: 0,
    errors: 0,
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId))
  if (!client || !client.sumupAccessToken || !client.sumupMerchantCode) return summary
  summary.merchantCode = client.sumupMerchantCode

  // Token refresh si está expirado o por expirar (margen 60s)
  let accessToken = client.sumupAccessToken
  if (
    client.sumupTokenExpiresAt &&
    client.sumupTokenExpiresAt.getTime() - Date.now() < 60_000
  ) {
    const refreshed = await tryRefreshTokens(clientId, client.sumupRefreshToken!)
    if (!refreshed) {
      summary.errors++
      return summary
    }
    accessToken = refreshed
  }

  // Fetch desde el último poll, o desde "ahora menos 1h" en el primer poll
  const since = client.sumupLastPolledAt ?? new Date(Date.now() - 60 * 60 * 1000)
  const sinceIso = since.toISOString()

  let txList: SumupTransaction[]
  try {
    const res = await listTransactionsSince(accessToken, client.sumupMerchantCode, sinceIso)
    txList = res.items ?? []
  } catch (err) {
    if (err instanceof SumupApiError && err.status === 401) {
      // Reintento con refresh
      const refreshed = await tryRefreshTokens(clientId, client.sumupRefreshToken!)
      if (!refreshed) {
        summary.errors++
        return summary
      }
      try {
        const res = await listTransactionsSince(refreshed, client.sumupMerchantCode, sinceIso)
        txList = res.items ?? []
        accessToken = refreshed
      } catch (err2) {
        console.error('[sumup/poll] retry failed for client', clientId, err2)
        summary.errors++
        return summary
      }
    } else {
      console.error('[sumup/poll] list failed for client', clientId, err)
      summary.errors++
      return summary
    }
  }

  summary.fetched = txList.length
  if (txList.length === 0) {
    await db
      .update(clients)
      .set({ sumupLastPolledAt: new Date() })
      .where(eq(clients.id, clientId))
    return summary
  }

  // ¿Hay sesión de caja abierta? Si sí, intentamos match con movements
  // existentes; si no, todo va a pending.
  const [openSession] = await db
    .select()
    .from(cashSessions)
    .where(and(eq(cashSessions.clientId, clientId), isNull(cashSessions.closedAt)))

  for (const tx of txList) {
    if (tx.currency !== 'EUR') continue // solo EUR de momento

    // Skip si ya tenemos esta transaction registrada en algún sitio
    const [exists] = await db
      .select({ id: cashMovements.id })
      .from(cashMovements)
      .where(eq(cashMovements.sumupTransactionId, tx.id))
    if (exists) continue

    const [existsPending] = await db
      .select({ id: sumupPendingTransactions.id })
      .from(sumupPendingTransactions)
      .where(eq(sumupPendingTransactions.sumupTransactionId, tx.id))
    if (existsPending) continue

    const txCents = sumupAmountToCents(tx.amount)
    const txTimestamp = new Date(tx.timestamp)

    // Refund? insertar movement negativo via kind='refund' (solo si hay sesión)
    if (tx.status === 'REFUNDED') {
      if (openSession) {
        await db.insert(cashMovements).values({
          clientId,
          sessionId: openSession.id,
          kind: 'refund',
          method: 'card',
          amountCents: txCents,
          sumupTransactionId: tx.id,
          notes: `Refund SumUp ${tx.transaction_code ?? tx.id}`,
        })
        summary.refunds++
      } else {
        await insertPending(clientId, tx, txCents, txTimestamp)
        summary.insertedAsPending++
      }
      continue
    }

    if (tx.status !== 'SUCCESSFUL') continue

    // No hay sesión → al buffer pending
    if (!openSession) {
      await insertPending(clientId, tx, txCents, txTimestamp)
      summary.insertedAsPending++
      continue
    }

    // Hay sesión: buscar match con movement manual existente
    const candidates = await db
      .select({
        id: cashMovements.id,
        amountCents: cashMovements.amountCents,
        createdAt: cashMovements.createdAt,
        method: cashMovements.method,
        sumupTransactionId: cashMovements.sumupTransactionId,
      })
      .from(cashMovements)
      .where(
        and(
          eq(cashMovements.sessionId, openSession.id),
          eq(cashMovements.method, 'card'),
          isNull(cashMovements.sumupTransactionId),
        ),
      )

    const match = findBestMatch(
      { amountCents: txCents, timestamp: txTimestamp },
      candidates,
    )

    if (match) {
      // Update con sumup_transaction_id + corregir amount al real (incluye propina)
      await db
        .update(cashMovements)
        .set({ sumupTransactionId: tx.id, amountCents: txCents })
        .where(eq(cashMovements.id, match.id))
      summary.matchedToManual++
    } else {
      // Standalone: el barbero no había marcado este cobro manualmente
      await db.insert(cashMovements).values({
        clientId,
        sessionId: openSession.id,
        kind: 'booking',
        method: 'card',
        amountCents: txCents,
        sumupTransactionId: tx.id,
        notes: `Importado de SumUp (${tx.transaction_code ?? tx.id}) sin booking manual asociado`,
      })
      summary.insertedAsMovement++
    }
  }

  // Actualizar cursor
  await db
    .update(clients)
    .set({ sumupLastPolledAt: new Date() })
    .where(eq(clients.id, clientId))

  return summary
}

async function insertPending(
  clientId: string,
  tx: SumupTransaction,
  amountCents: number,
  timestamp: Date,
): Promise<void> {
  await db.insert(sumupPendingTransactions).values({
    clientId,
    sumupTransactionId: tx.id,
    amountCents,
    currency: tx.currency,
    status: tx.status,
    paymentType: tx.payment_type,
    transactionTimestamp: timestamp,
    rawPayload: tx as unknown as Record<string, unknown>,
  })
}

async function tryRefreshTokens(
  clientId: string,
  refreshToken: string,
): Promise<string | null> {
  try {
    const env = getOauthEnv()
    const fresh = await refreshAccessToken(refreshToken, env.clientId, env.clientSecret)
    await db
      .update(clients)
      .set({
        sumupAccessToken: fresh.access_token,
        sumupRefreshToken: fresh.refresh_token,
        sumupTokenExpiresAt: new Date(Date.now() + fresh.expires_in * 1000),
      })
      .where(eq(clients.id, clientId))
    return fresh.access_token
  } catch (err) {
    console.error('[sumup/poll] refresh failed for client', clientId, err)
    return null
  }
}

/**
 * Listado de clientes con SumUp conectado — entry point del cron.
 */
export async function listConnectedClients(): Promise<string[]> {
  const rows = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        isNotNull(clients.sumupAccessToken),
        isNotNull(clients.sumupMerchantCode),
        eq(clients.cashRegisterEnabled, true),
      ),
    )
  return rows.map((r) => r.id)
}

/** Helper para el SQL que se ejecuta dentro de drizzle. */
export const pollSql = sql
