import { db } from '@/db'
import { clients, googleReviews } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'
import {
  listAccounts,
  listLocations,
  ensureAccessToken,
  isLocationOwnedByAccount,
  hasLocationChanged,
  GoogleBusinessRevokedError,
  GoogleBusinessApiError,
  type GoogleBusinessCredentials,
} from '@/lib/google-business/client'
import { handleGoogleBusinessRevoked } from '@/lib/google-business/revoke'

// -----------------------------------------------------------------------------
// POST /api/google-business/oauth/locations/select
//
// Body: { locationPath: string }
//
// Persiste QUÉ location de Google Business Profile usa este tenant, una vez
// el barbero elige entre las que devuelve GET .../locations (caso de cuenta
// con varias locations — ver resolveLocationSelection en client.ts).
//
// SEGURIDAD: `locationPath` NUNCA se persiste a ciegas desde el body. Se
// re-consulta a Google qué locations pertenecen REALMENTE a la cuenta de
// ESTE tenant (mismo access_token que usamos para todo lo demás) y se
// valida con `isLocationOwnedByAccount` que el path recibido está en esa
// lista. Sin esto, cualquier caller autenticado como tenant A podría mandar
// el locationPath de la barbería B en el body y hacer que las reseñas de A
// se publiquen en el perfil de Google de B — un escape de multi-tenancy
// real, no un detalle de validación cosmético.
//
// LIMPIEZA AL CAMBIAR DE LOCATION: si el path elegido es distinto del que
// ya tenía el tenant (`hasLocationChanged`), se borran TODAS sus filas de
// `google_reviews` Y se resetea `googleBusinessConnectedAt` antes de guardar
// el nuevo path — ver los comentarios junto al `db.delete` y al `db.update`
// más abajo para el razonamiento completo de cada uno. Re-seleccionar la
// MISMA location (mismo path) es un no-op TOTAL: no se toca `google_reviews`
// ni `clients` — ni siquiera se reescribe `connectedAt` con el mismo valor.
//
// Response 200: { ok: true, locationPath: string, title: string }
// -----------------------------------------------------------------------------

interface Body {
  locationPath?: unknown
}

export async function POST(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'googleReviews')
  if (gate) return gate
  const { client } = access

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 })
  }

  const locationPath = typeof body.locationPath === 'string' ? body.locationPath.trim() : ''
  if (!locationPath) {
    return Response.json({ error: 'invalid_body', detail: 'locationPath requerido' }, { status: 400 })
  }

  if (!client.googleBusinessAccessToken || !client.googleBusinessRefreshToken) {
    return Response.json({ error: 'not_connected' }, { status: 400 })
  }

  const creds: GoogleBusinessCredentials = {
    accessToken: client.googleBusinessAccessToken,
    refreshToken: client.googleBusinessRefreshToken,
    expiresAt: client.googleBusinessTokenExpiresAt,
    persist: async (next) => {
      await db
        .update(clients)
        .set({
          googleBusinessAccessToken: next.accessToken,
          googleBusinessTokenExpiresAt: next.expiresAt,
        })
        .where(eq(clients.id, client.id))
    },
  }

  let accountLocations: Awaited<ReturnType<typeof listLocations>>
  try {
    const accessToken = await ensureAccessToken(creds)
    const accounts = await listAccounts(accessToken)
    if (accounts.length === 0) {
      return Response.json({ error: 'no_accounts' }, { status: 502 })
    }
    accountLocations = await listLocations(accessToken, accounts[0].name)
  } catch (err) {
    if (err instanceof GoogleBusinessRevokedError) {
      await handleGoogleBusinessRevoked(client)
      return Response.json({ error: 'reconnect_required' }, { status: 409 })
    }
    const status = err instanceof GoogleBusinessApiError ? err.status : 'n/a'
    console.error(`[google-business/locations/select] failed (status=${status}):`, err)
    return Response.json({ error: 'google_api_error' }, { status: 502 })
  }

  if (!isLocationOwnedByAccount(locationPath, accountLocations)) {
    return Response.json(
      { error: 'invalid_location', detail: 'Esa location no pertenece a la cuenta de Google conectada' },
      { status: 400 },
    )
  }

  const chosen = accountLocations.find((l) => l.name === locationPath)!

  // Re-seleccionar la MISMA location (mismo path que ya tenía el tenant) es
  // un no-op TOTAL: cero escritura, ni de `google_reviews` ni de `clients`.
  // No es solo "no borres reseñas" — tampoco se puede tocar `connectedAt`.
  //
  // Bug real que esto evita: `googleBusinessConnectedAt` es el corte que usa
  // `isReviewEligibleForAutoReply` (client.ts) para decidir qué reseñas son
  // candidatas a auto-respuesta. Si se reescribiera aquí en cada
  // re-confirmación, el corte saltaría hacia delante cada vez — cualquier
  // reseña llegada entre la conexión original y este momento que AÚN no se
  // hubiera sincronizado entraría como 'skipped' en vez de 'pending' la
  // próxima vez que corra el sync. El barbero perdería auto-respuestas
  // legítimas para esa ventana sin ninguna pista de por qué. Por eso: sin
  // cambio de path, se devuelve éxito y no se escribe nada.
  if (!hasLocationChanged(client.googleBusinessLocationPath, locationPath)) {
    return Response.json({ ok: true, locationPath, title: chosen.title ?? locationPath })
  }

  // A partir de aquí es un cambio de location REAL (path distinto al que ya
  // tenía el tenant). Las filas de `google_reviews` que ya teníamos
  // pertenecen a la ficha ANTERIOR — hay que purgarlas antes de escribir el
  // path nuevo, no dejarlas convivir con él. Dos motivos, el segundo más
  // grave que el primero:
  //   1. Cosmético: el panel mezclaría reseñas de un negocio que ya no
  //      gestionamos con las de la ficha actual.
  //   2. Funcional: cualquier fila que siguiera en `replyStatus='pending'`
  //      se intentaría publicar en el PRÓXIMO cron contra el path NUEVO —
  //      Google la rechaza (esa reseña vive bajo la ficha vieja, no la
  //      nueva), `attempts` sube en cada intento, y a la 5ª se marca
  //      'failed' como ruido que el barbero no puede explicar.
  //
  // Borrar (no archivar/reasignar) es la decisión correcta aquí, no un
  // descuido de datos: el modelo de este producto es UNA cuenta otracita
  // por local — un dueño con varias barberías lleva cuentas otracita
  // separadas, no una sola cuenta gestionando varias fichas de Google. Así
  // que cambiar de location siempre significa "elegí la ficha equivocada",
  // nunca "ahora gestiono las dos a la vez". Las filas se reconstruyen
  // solas desde la ficha nueva en el siguiente sync — no hay nada que
  // conservar.
  await db.delete(googleReviews).where(eq(googleReviews.clientId, client.id))

  // `connectedAt` SOLO se resetea aquí, en la rama de cambio real — es
  // correcto que el histórico de la ficha nueva cuente como "anterior a la
  // conexión" (ver isReviewEligibleForAutoReply): para ESTA location es,
  // literalmente, la primera vez que conectamos.
  await db
    .update(clients)
    .set({
      googleBusinessLocationPath: locationPath,
      googleBusinessLocationTitle: chosen.title ?? null,
      googleBusinessConnectedAt: new Date(),
    })
    .where(eq(clients.id, client.id))

  return Response.json({ ok: true, locationPath, title: chosen.title ?? locationPath })
}
