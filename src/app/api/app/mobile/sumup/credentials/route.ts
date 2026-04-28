import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireMobileAuth, mobileAuthErrorResponse } from '@/lib/auth/mobile-session'
import { ensureValidAccessToken } from '@/lib/sumup/client'
import { getOauthEnv } from '@/lib/sumup/oauth'

// -----------------------------------------------------------------------------
// GET /api/app/mobile/sumup/credentials
//
// Devuelve a la app móvil las credenciales mínimas que necesita el plugin
// nativo iOS (SumUp Tap to Pay SDK) para procesar un cobro:
//
//   {
//     accessToken: string,    // OAuth access token del barbero (refrescado si expira)
//     affiliateKey: string,   // header obligatorio del SDK
//     merchantCode: string,   // identificador del merchant SumUp
//   }
//
// Auth: Bearer mobile token. Sin SumUp conectado → 400.
//
// Seguridad:
//   · La app guarda el access_token SOLO en memoria, NO en Preferences.
//     Si la app se cierra, vuelve a llamar este endpoint en el siguiente cobro.
//   · El access_token de SumUp expira en 1h — al pedirlo siempre lo
//     refrescamos si está cerca de expirar.
//   · El affiliate_key está en server env (SUMUP_AFFILIATE_KEY); se devuelve
//     a la app porque el SDK lo necesita en headers locales.
// -----------------------------------------------------------------------------

export async function GET(req: Request) {
  const auth = await requireMobileAuth(req)
  if (!auth.ok) return mobileAuthErrorResponse(auth)
  const { client } = auth

  if (!client.sumupAccessToken || !client.sumupRefreshToken || !client.sumupMerchantCode) {
    return Response.json({ error: 'SumUp no conectado' }, { status: 400 })
  }

  const affiliateKey = process.env.SUMUP_AFFILIATE_KEY
  if (!affiliateKey) {
    return Response.json({ error: 'SUMUP_AFFILIATE_KEY no configurada' }, { status: 500 })
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

  const accessToken = await ensureValidAccessToken({
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

  return Response.json({
    accessToken,
    affiliateKey,
    merchantCode: client.sumupMerchantCode,
  })
}
