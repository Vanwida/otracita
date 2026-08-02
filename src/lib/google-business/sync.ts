// -----------------------------------------------------------------------------
// Sincroniza las reseñas de Google de un tenant hacia `google_reviews`.
//
// Idempotencia: INSERT ... ON CONFLICT (client_id, google_review_id) DO
// UPDATE, apoyado en el índice UNIQUE `google_reviews_client_review_unique`
// (columnas, no partial — inferencia por lista de columnas funciona sin
// depender del nombre de constraint, ver nota en CLAUDE.md §5 sobre el bug
// de ON CONFLICT + índice parcial en cron/loyalty-award).
//
// Regla "nunca pisar una respuesta ya publicada": si `replyStatus` ya es
// 'published' en DB, el UPDATE dejar intactas reply_text/reply_status/
// reply_source/reply_published_at pase lo que pase en esta sync. Si NO está
// publicado todavía y Google muestra un `reviewReply` (el barbero respondió
// a mano desde la app/web de Google), lo adoptamos como 'published'/'manual'
// — es la ÚNICA vía por la que una fila pasa a manual, y a partir de ahí
// queda protegida por la regla anterior.
//
// Regla "nunca auto-responder al histórico": una reseña NUEVA (primera vez
// que se ve) que ya existía en Google desde ANTES de `googleBusinessConnectedAt`
// entra como `replyStatus: 'skipped'`, no `'pending'` — ver
// `isReviewEligibleForAutoReply` en client.ts para el porqué (evita un
// flood de ~150 respuestas automáticas la primera vez que un negocio con
// años de reseñas conecta la integración). Se guarda igual (el panel puede
// mostrarla y el barbero puede responderla a mano si quiere), simplemente
// el cron nunca la toca.
// -----------------------------------------------------------------------------

import { db } from '@/db'
import { clients, googleReviews } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'
import {
  listReviews,
  isReviewEligibleForAutoReply,
  type FetchLike,
  type GoogleBusinessCredentials,
} from './client'

export interface SyncGoogleReviewsResult {
  fetched: number
  manualRepliesDetected: number
}

type ClientRow = typeof clients.$inferSelect

/**
 * Construye las credenciales para client.ts a partir de una fila `clients`
 * ya validada como conectada (ver `isGoogleBusinessConnected`). El
 * `persist` actualiza SOLO el access_token — el refresh_token de Google no
 * rota en este grant.
 */
function credentialsFor(client: ClientRow): GoogleBusinessCredentials {
  return {
    accessToken: client.googleBusinessAccessToken!,
    refreshToken: client.googleBusinessRefreshToken!,
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
}

export function isGoogleBusinessConnected(
  client: ClientRow,
): client is ClientRow & {
  googleBusinessLocationPath: string
  googleBusinessAccessToken: string
  googleBusinessRefreshToken: string
} {
  return Boolean(
    client.googleBusinessLocationPath &&
      client.googleBusinessAccessToken &&
      client.googleBusinessRefreshToken,
  )
}

/**
 * Trae las reseñas actuales de Google para este tenant y las upsertea en
 * `google_reviews`. Lanza `GoogleBusinessRevokedError` (desde client.ts) si
 * el refresh_token fue revocado — el caller (cron) decide qué hacer con eso.
 */
export async function syncGoogleReviewsForClient(
  client: ClientRow,
  fetchImpl?: FetchLike,
): Promise<SyncGoogleReviewsResult> {
  if (!isGoogleBusinessConnected(client)) {
    throw new Error(`Cliente ${client.id} no tiene Google Business Profile conectado`)
  }

  const creds = credentialsFor(client)
  const reviews = await listReviews(creds, client.googleBusinessLocationPath, fetchImpl)

  let manualRepliesDetected = 0

  for (const review of reviews) {
    const hasReplyOnGoogle = review.reviewReply !== null
    if (hasReplyOnGoogle) manualRepliesDetected++

    // Solo importa para el INSERT inicial (primera vez que vemos esta
    // reseña) — en el UPDATE de conflicto, replyStatus queda protegido por
    // el CASE de abajo y este valor solo se usa si aún no había fila.
    const initialReplyStatus = hasReplyOnGoogle
      ? 'published'
      : isReviewEligibleForAutoReply(review.reviewCreatedAt, client.googleBusinessConnectedAt)
        ? 'pending'
        : 'skipped'

    await db
      .insert(googleReviews)
      .values({
        clientId: client.id,
        googleReviewId: review.googleReviewId,
        reviewerName: review.reviewerName,
        starRating: review.starRating,
        comment: review.comment,
        reviewCreatedAt: review.reviewCreatedAt,
        reviewUpdatedAt: review.reviewUpdatedAt,
        replyStatus: initialReplyStatus,
        replySource: hasReplyOnGoogle ? 'manual' : null,
        replyText: hasReplyOnGoogle ? review.reviewReply!.comment : null,
        replyPublishedAt: hasReplyOnGoogle ? review.reviewReply!.updatedAt : null,
      })
      .onConflictDoUpdate({
        target: [googleReviews.clientId, googleReviews.googleReviewId],
        set: {
          reviewerName: sql`excluded.reviewer_name`,
          comment: sql`excluded.comment`,
          reviewUpdatedAt: sql`excluded.review_updated_at`,
          updatedAt: sql`now()`,
          // CASE de 3 ramas, misma lógica en las 4 columnas de reply:
          //   1. Ya estaba 'published' en DB → se queda como está, siempre
          //      (protege tanto respuestas IA nuestras como manuales ya
          //      detectadas en una sync anterior).
          //   2. No estaba publicada, pero Google muestra reply AHORA
          //      (`excluded.reply_status = 'published'`) → se adopta como
          //      manual — es la detección de "el barbero respondió a mano".
          //   3. Ninguna de las anteriores → se deja el valor que ya
          //      hubiera en DB (pending/draft/failed no se tocan aquí; ese
          //      estado lo gestiona el cron de generación, no el sync).
          replyStatus: sql`CASE
            WHEN ${googleReviews.replyStatus} = 'published' THEN ${googleReviews.replyStatus}
            WHEN excluded.reply_status = 'published' THEN excluded.reply_status
            ELSE ${googleReviews.replyStatus}
          END`,
          replySource: sql`CASE
            WHEN ${googleReviews.replyStatus} = 'published' THEN ${googleReviews.replySource}
            WHEN excluded.reply_status = 'published' THEN excluded.reply_source
            ELSE ${googleReviews.replySource}
          END`,
          replyText: sql`CASE
            WHEN ${googleReviews.replyStatus} = 'published' THEN ${googleReviews.replyText}
            WHEN excluded.reply_status = 'published' THEN excluded.reply_text
            ELSE ${googleReviews.replyText}
          END`,
          replyPublishedAt: sql`CASE
            WHEN ${googleReviews.replyStatus} = 'published' THEN ${googleReviews.replyPublishedAt}
            WHEN excluded.reply_status = 'published' THEN excluded.reply_published_at
            ELSE ${googleReviews.replyPublishedAt}
          END`,
        },
      })
  }

  return { fetched: reviews.length, manualRepliesDetected }
}
