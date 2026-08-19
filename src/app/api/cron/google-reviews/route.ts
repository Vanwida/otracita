import { db } from '@/db'
import { clients, googleReviews } from '@/db/schema'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { requireCron } from '@/lib/auth/require-cron'
import { hasFeature } from '@/lib/billing/tier'
import { syncGoogleReviewsForClient, isGoogleBusinessConnected } from '@/lib/google-business/sync'
import {
  generateReviewReply,
  validateReply,
  shouldAutoPublish,
} from '@/lib/google-business/reply'
import {
  upsertReply,
  GoogleBusinessRevokedError,
  type GoogleBusinessCredentials,
} from '@/lib/google-business/client'
import { sendReviewDraftEmail } from '@/lib/google-business/emails'
import { handleGoogleBusinessRevoked } from '@/lib/google-business/revoke'

// -----------------------------------------------------------------------------
// GET /api/cron/google-reviews
//
// Programado cada 3 horas (vercel.json). Para cada barbería CONECTADA a
// Google Business Profile y con tier que incluye `googleReviews`:
//   1. Sincroniza sus reseñas (siempre — barato, y deja el histórico listo
//      para cuando exista UI de lectura, aunque el barbero no haya activado
//      la auto-respuesta todavía).
//   2. Si `googleReviewsAutoReply` está activo, procesa las reseñas
//      elegibles (`replyStatus = 'pending'` — el sync ya excluyó de ahí el
//      histórico anterior a la conexión, ver isReviewEligibleForAutoReply
//      en client.ts, que las deja en 'skipped'): genera respuesta con IA,
//      valida, y
//         · 4-5★ → publica automáticamente en Google (hasta el cap, ver abajo)
//         · 1-3★ → deja en 'draft' y emailea la propuesta al barbero
//
// Aislamiento por tenant: cada barbería vive en su propio try/catch — un
// tenant roto (token revocado, Google caído, lo que sea) no debe frenar el
// sweep del resto. `GoogleBusinessRevokedError` es la única excepción con
// tratamiento especial: desconecta al tenant (null tokens) y avisa por
// email; el resto de errores solo se loguean y se reintentan en la próxima
// pasada.
//
// Backoff: cada fallo en generar/validar/publicar una reseña concreta
// incrementa `attempts`. A partir de MAX_ATTEMPTS se marca 'failed' y deja
// de reintentarse — protege contra una reseña "envenenada" (p.ej. el LLM
// siempre devuelve markdown para ese texto concreto) bloqueando recursos
// del cron indefinidamente.
//
// Cap por tenant: incluso legítimamente (menciones, aperturas con muchas
// reseñas de golpe, etc.) un negocio puede tener un burst de reseñas
// nuevas elegibles en una sola pasada. Publicar todas de golpe en Google es
// la misma señal de spam que el corte por fecha evita para el histórico
// (ver isReviewEligibleForAutoReply en client.ts) — así que además
// limitamos cuántas respuestas se PUBLICAN por tenant en un run. Lo que
// sobra se queda `pending` tal cual (no se toca, no cuenta como intento) y
// sale en el siguiente run 3h después — eso además las espacia de forma
// natural, que es justo el patrón que NO parece un bot.
// -----------------------------------------------------------------------------

const MAX_ATTEMPTS = 5
const RECENT_REPLIES_FOR_PROMPT = 5
const MAX_PUBLISHED_PER_TENANT_PER_RUN = 10

export async function GET(request: Request) {
  const unauth = requireCron(request)
  if (unauth) return unauth

  const connectedClients = await db
    .select()
    .from(clients)
    .where(
      and(isNotNull(clients.googleBusinessLocationPath), isNotNull(clients.googleBusinessAccessToken)),
    )

  let tenantsProcessed = 0
  let tenantsSkippedTier = 0
  let tenantsSkippedAutoReplyOff = 0
  let tenantsRevoked = 0
  let tenantsErrored = 0
  let tenantsCapped = 0
  let reviewsSynced = 0
  let repliesPublished = 0
  let draftsEmailed = 0
  let repliesFailed = 0

  for (const client of connectedClients) {
    if (!isGoogleBusinessConnected(client)) continue // defensivo, ya filtrado por la query

    if (!hasFeature(client, 'googleReviews')) {
      tenantsSkippedTier++
      continue
    }

    try {
      const syncResult = await syncGoogleReviewsForClient(client)
      reviewsSynced += syncResult.fetched

      if (!client.googleReviewsAutoReply) {
        tenantsSkippedAutoReplyOff++
        tenantsProcessed++
        continue
      }

      const pending = await db
        .select()
        .from(googleReviews)
        .where(and(eq(googleReviews.clientId, client.id), eq(googleReviews.replyStatus, 'pending')))

      const recentReplies = (
        await db
          .select({ replyText: googleReviews.replyText })
          .from(googleReviews)
          .where(
            and(
              eq(googleReviews.clientId, client.id),
              eq(googleReviews.replyStatus, 'published'),
              eq(googleReviews.replySource, 'ia'),
            ),
          )
          .orderBy(desc(googleReviews.replyPublishedAt))
          .limit(RECENT_REPLIES_FOR_PROMPT)
      )
        .map((r) => r.replyText)
        .filter((t): t is string => Boolean(t))

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

      let tenantPublishedThisRun = 0

      for (let i = 0; i < pending.length; i++) {
        const review = pending[i]

        if (tenantPublishedThisRun >= MAX_PUBLISHED_PER_TENANT_PER_RUN) {
          const remaining = pending.length - i
          console.warn(
            `[cron/google-reviews] tenant ${client.id} alcanzó el cap de ${MAX_PUBLISHED_PER_TENANT_PER_RUN} respuestas publicadas en este run — ${remaining} reseña(s) quedan pending para el próximo run (3h)`,
          )
          tenantsCapped++
          break
        }

        try {
          const text = await generateReviewReply({
            businessName: client.businessName,
            // Las reseñas de Google no traen vínculo a booking/servicio —
            // no hay hoy una forma fiable de rellenar esto (ver reply.ts).
            barberName: null,
            service: null,
            reviewerName: review.reviewerName,
            reviewText: review.comment,
            starRating: review.starRating,
            recentReplies,
          })

          const validation = validateReply(text)
          if (!validation.ok) {
            throw new Error(`Respuesta IA inválida (${validation.reason})`)
          }

          if (shouldAutoPublish(review.starRating)) {
            await upsertReply(creds, client.googleBusinessLocationPath, review.googleReviewId, text)
            await db
              .update(googleReviews)
              .set({
                replyText: text,
                replyStatus: 'published',
                replySource: 'ia',
                replyPublishedAt: new Date(),
                lastError: null,
                updatedAt: new Date(),
              })
              .where(eq(googleReviews.id, review.id))
            repliesPublished++
            tenantPublishedThisRun++
            // `recentReplies` no se recarga dentro de este loop — si un
            // tenant tiene varias reseñas nuevas en la misma pasada, la
            // 2ª no "ve" la respuesta publicada para la 1ª hasta el
            // siguiente run del cron. Aceptable: el anti-repetición sigue
            // funcionando contra el histórico real, solo pierde la más
            // reciente durante unos minutos.
          } else {
            await db
              .update(googleReviews)
              .set({
                replyText: text,
                replyStatus: 'draft',
                replySource: 'ia',
                lastError: null,
                updatedAt: new Date(),
              })
              .where(eq(googleReviews.id, review.id))
            await sendReviewDraftEmail({
              to: client.email,
              businessName: client.businessName,
              starRating: review.starRating,
              reviewerName: review.reviewerName,
              reviewText: review.comment,
              draftReply: text,
            })
            draftsEmailed++
          }
        } catch (err) {
          if (err instanceof GoogleBusinessRevokedError) throw err // propaga al catch de tenant

          const attempts = review.attempts + 1
          const failed = attempts >= MAX_ATTEMPTS
          const message = err instanceof Error ? err.message : String(err)
          await db
            .update(googleReviews)
            .set({
              attempts,
              lastError: message.slice(0, 500),
              replyStatus: failed ? 'failed' : 'pending',
              updatedAt: new Date(),
            })
            .where(eq(googleReviews.id, review.id))
          repliesFailed++
          console.error(
            `[cron/google-reviews] fallo procesando reseña ${review.id} (tenant ${client.id}, intento ${attempts}):`,
            err,
          )
        }
      }

      tenantsProcessed++
    } catch (err) {
      if (err instanceof GoogleBusinessRevokedError) {
        await handleGoogleBusinessRevoked(client)
        tenantsRevoked++
        continue
      }
      tenantsErrored++
      console.error(`[cron/google-reviews] tenant ${client.id} falló:`, err)
    }
  }

  return Response.json({
    success: true,
    tenantsConnected: connectedClients.length,
    tenantsProcessed,
    tenantsSkippedTier,
    tenantsSkippedAutoReplyOff,
    tenantsRevoked,
    tenantsErrored,
    tenantsCapped,
    reviewsSynced,
    repliesPublished,
    draftsEmailed,
    repliesFailed,
  })
}
