import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'
import { listReaders, ensureValidAccessToken, SumupApiError } from '@/lib/sumup/client'
import { getOauthEnv } from '@/lib/sumup/oauth'

// -----------------------------------------------------------------------------
// GET /api/sumup/readers
//
// Lista los Readers físicos vinculados a la cuenta SumUp del barbero.
// Usado por la UI tras conectar OAuth para que escoja CUÁL es su datáfono.
// La barbería puede tener varios; guardamos solo el `sumup_reader_id` que
// elige.
// -----------------------------------------------------------------------------

export async function GET(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'sumupTapToPay')
  if (gate) return gate
  const { client } = access

  if (!client.sumupAccessToken || !client.sumupMerchantCode || !client.sumupRefreshToken) {
    return Response.json({ error: 'SumUp no conectado' }, { status: 400 })
  }

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
    const data = await listReaders(token, client.sumupMerchantCode)
    return Response.json({
      readers: data.items.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        deviceModel: r.device?.model ?? null,
      })),
    })
  } catch (err) {
    // 403 con "Insufficient scopes" indica que el token actual del barbero
    // se emitió antes de que añadiéramos `readers.read` / `terminals.read`
    // a los scopes. Devolvemos un código semántico para que la UI muestre
    // "Reconecta SumUp" en vez de un error genérico.
    if (err instanceof SumupApiError && err.status === 403) {
      const bodyText = typeof err.body === 'string' ? err.body : JSON.stringify(err.body ?? {})
      if (bodyText.includes('Insufficient scopes') || bodyText.includes('readers.read')) {
        return Response.json(
          { error: 'reconnect_required', detail: 'Tu conexión SumUp es de antes de añadir el listado de Readers. Desconecta y vuelve a conectar.' },
          { status: 409 },
        )
      }
    }
    console.error('[sumup/readers] failed:', err)
    return Response.json({ error: 'No se pudo obtener la lista de Readers' }, { status: 502 })
  }
}
