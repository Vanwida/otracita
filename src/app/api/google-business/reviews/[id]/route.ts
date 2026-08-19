import { db } from '@/db'
import { clients, googleReviews } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'
import { validateReply, type ValidateReplyResult } from '@/lib/google-business/reply'
import {
  upsertReply,
  GoogleBusinessRevokedError,
  GoogleBusinessApiError,
  type GoogleBusinessCredentials,
} from '@/lib/google-business/client'
import { isGoogleBusinessConnected } from '@/lib/google-business/sync'

// -----------------------------------------------------------------------------
// PATCH /api/google-business/reviews/[id]
//
// Acción del barbero sobre un borrador de respuesta IA (replyStatus='draft',
// generado por el cron para reseñas de 1-3★ — ver src/lib/google-business/
// reply.ts:shouldAutoPublish). Body:
//
//   { action: 'publish', replyText: string } — publica en Google (PUT reply,
//     vía el mismo upsertReply que usa el cron) y marca replyStatus=
//     'published', replySource='ia' (aunque el barbero haya editado el
//     texto: sigue siendo IA+revisión humana, no 'manual' — ese origen está
//     reservado para respuestas que Google reporta como puestas fuera de
//     otracita, ver sync.ts).
//
//   { action: 'discard' } — marca replyStatus='skipped'. El cron SOLO
//     reprocesa filas 'pending' (ver cron/google-reviews/route.ts), así que
//     esto es definitivo: si el barbero cambia de idea tendría que
//     responder a mano desde Google Business Profile.
//
//   { action: 'retry' } — solo sobre reseñas en 'failed' (agotó los 5
//     intentos del cron, ver MAX_ATTEMPTS en cron/google-reviews/route.ts).
//     Vuelve a 'pending' con attempts=0 y lastError=null para que el cron
//     la recoja en su próxima pasada como si fuera nueva — no reintenta
//     nada aquí mismo (no hay generación IA sin cron), solo desbloquea la
//     cola. Si el fallo original era de verdad permanente (no transitorio)
//     volverá a agotar los 5 intentos y a quedar 'failed' otra vez.
//
// 'publish' y 'discard' solo actúan sobre reseñas que ESTÁN en 'draft' —
// protege contra publicar dos veces o pisar una respuesta ya publicada
// (mismo criterio de guardia que sync.ts aplica en su ON CONFLICT).
// -----------------------------------------------------------------------------

interface Body {
  action?: unknown
  replyText?: unknown
}

const VALIDATION_MESSAGES: Record<NonNullable<ValidateReplyResult['reason']>, string> = {
  empty: 'El texto no puede estar vacío.',
  too_long: 'La respuesta supera el límite de caracteres.',
  markdown: 'No se admite formato (negrita, listas, enlaces...); usa solo texto plano.',
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access
  const gate = requireFeature(client, 'googleReviews')
  if (gate) return gate

  const { id } = await params

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const [review] = await db
    .select()
    .from(googleReviews)
    .where(and(eq(googleReviews.id, id), eq(googleReviews.clientId, client.id)))
  if (!review) return Response.json({ error: 'Reseña no encontrada' }, { status: 404 })

  if (body.action === 'retry') {
    if (review.replyStatus !== 'failed') {
      return Response.json(
        { error: 'Esta reseña no está en estado fallido' },
        { status: 409 },
      )
    }
    await db
      .update(googleReviews)
      .set({ replyStatus: 'pending', attempts: 0, lastError: null, updatedAt: new Date() })
      .where(eq(googleReviews.id, review.id))
    return Response.json({ ok: true, replyStatus: 'pending' })
  }

  if (review.replyStatus !== 'draft') {
    return Response.json(
      { error: 'Esta reseña ya no está pendiente de revisión' },
      { status: 409 },
    )
  }

  if (body.action === 'discard') {
    await db
      .update(googleReviews)
      .set({ replyStatus: 'skipped', updatedAt: new Date() })
      .where(eq(googleReviews.id, review.id))
    return Response.json({ ok: true, replyStatus: 'skipped' })
  }

  if (body.action !== 'publish') {
    return Response.json(
      { error: 'action debe ser "publish", "discard" o "retry"' },
      { status: 400 },
    )
  }

  const text = typeof body.replyText === 'string' ? body.replyText.trim() : ''
  const validation = validateReply(text)
  if (!validation.ok) {
    return Response.json({ error: VALIDATION_MESSAGES[validation.reason!] }, { status: 400 })
  }

  if (!isGoogleBusinessConnected(client)) {
    return Response.json(
      { error: 'Tu cuenta de Google Business Profile no está conectada.' },
      { status: 409 },
    )
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

  try {
    await upsertReply(creds, client.googleBusinessLocationPath, review.googleReviewId, text)
  } catch (err) {
    if (err instanceof GoogleBusinessRevokedError) {
      return Response.json(
        { error: 'Tu conexión con Google se ha desconectado. Vuelve a conectarla arriba.' },
        { status: 409 },
      )
    }
    if (err instanceof GoogleBusinessApiError) {
      console.error('[api/google-business/reviews] upsertReply failed:', err)
      return Response.json(
        { error: 'Google no aceptó la respuesta. Inténtalo de nuevo.' },
        { status: 502 },
      )
    }
    throw err
  }

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

  return Response.json({ ok: true, replyStatus: 'published', replyText: text })
}
