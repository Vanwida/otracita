export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients, ratings, googleReviews } from '@/db/schema'
import { desc, eq, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { Star, MessageSquare, MessageCircle, Smartphone, Sparkles } from 'lucide-react'
import AreaShell from '@/app/dashboard/_components/AreaShell'
import AreaContent from '@/app/dashboard/_components/AreaContent'
import StatStrip from '@/app/dashboard/_components/StatStrip'
import RatingsToggle from '../../resenas/RatingsToggle'
import GoogleReviewsSection from './GoogleReviewsSection'
import { hasFeature, upgradeMessage } from '@/lib/billing/tier'
import { isGoogleBusinessConnected } from '@/lib/google-business/sync'
import { MAX_REPLY_LENGTH } from '@/lib/google-business/reply'

// -----------------------------------------------------------------------------
// /dashboard/marketing/resenas — pestaña RESEÑAS del área Marketing.
//
// Contrato de IA: Reseñas vive en Marketing. Contenido movido 1:1 desde el
// antiguo /dashboard/resenas — MISMAS queries (stats agregadas + lista
// ratings), mismo RatingsToggle (auto-guarda contra los mismos endpoints).
// /dashboard/resenas → redirect aquí.
//
// La configuración de PROPINAS ya NO vive aquí: es la pestaña Ventas →
// Propinas (TipsSettings, dueño canónico único — evita editar el mismo
// campo en dos sitios). LÓGICA DE SERVIDOR INTACTA.
// -----------------------------------------------------------------------------

async function saveGoogleReviewUrl(formData: FormData) {
  'use server'

  const { auth: serverAuth } = await import('@/lib/auth/server')
  const { headers: getHeaders } = await import('next/headers')
  const session = await serverAuth.api.getSession({ headers: await getHeaders() })
  if (!session?.user?.email) return

  const email = session.user.email
  const raw = (formData.get('googleReviewUrl') as string | null) ?? ''

  // Sanear URL Google Review: aceptar solo http/https; vacío → null
  let cleanReviewUrl: string | null = null
  if (raw.trim()) {
    try {
      const u = new URL(raw.trim())
      if (u.protocol === 'https:' || u.protocol === 'http:') {
        cleanReviewUrl = u.toString()
      }
    } catch {
      /* deja null */
    }
  }

  const { db } = await import('@/db')
  const { clients } = await import('@/db/schema')
  const { eq } = await import('drizzle-orm')

  const records = await db.select().from(clients).where(eq(clients.email, email))
  if (records.length === 0) return

  await db
    .update(clients)
    .set({ googleReviewUrl: cleanReviewUrl, updatedAt: new Date() })
    .where(eq(clients.id, records[0].id))

  const { revalidatePath } = await import('next/cache')
  revalidatePath('/dashboard/marketing/resenas')
}

export default async function MarketingResenasPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const [statsRow, list, googleReviewsList] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)`,
        avg: sql<number>`avg(${ratings.rating})`,
        s5: sql<number>`count(*) filter (where ${ratings.rating} = 5)`,
        s4: sql<number>`count(*) filter (where ${ratings.rating} = 4)`,
        s3: sql<number>`count(*) filter (where ${ratings.rating} = 3)`,
        s2: sql<number>`count(*) filter (where ${ratings.rating} = 2)`,
        s1: sql<number>`count(*) filter (where ${ratings.rating} = 1)`,
      })
      .from(ratings)
      .where(eq(ratings.clientId, client.id))
      .then((rows) => rows[0]),
    db
      .select()
      .from(ratings)
      .where(eq(ratings.clientId, client.id))
      .orderBy(desc(ratings.createdAt))
      .limit(100),
    db
      .select()
      .from(googleReviews)
      .where(eq(googleReviews.clientId, client.id))
      .orderBy(desc(googleReviews.reviewCreatedAt))
      .limit(100),
  ])

  const hasGoogleReviewsAccess = hasFeature(client, 'googleReviews')
  const googleUpgrade = upgradeMessage('googleReviews')
  const googleConnected = isGoogleBusinessConnected(client)
  // Tokens de Google guardados (callback OAuth exitoso) pero sin location
  // elegida — cuenta con varias fichas de empresa (ver callback/route.ts,
  // rama `selection.kind === 'multiple'`). isGoogleBusinessConnected exige
  // locationPath no-nulo, así que este caso queda fuera de `googleConnected`
  // a propósito; se resuelve con el picker (GoogleLocationList).
  const needsGoogleLocationPick =
    Boolean(client.googleBusinessAccessToken && client.googleBusinessRefreshToken) &&
    !client.googleBusinessLocationPath
  const googleReviewItems = googleReviewsList.map((r) => ({
    id: r.id,
    reviewerName: r.reviewerName,
    starRating: r.starRating,
    comment: r.comment,
    createdAtLabel: formatDate(r.reviewCreatedAt),
    replyText: r.replyText,
    replyStatus: r.replyStatus,
    replyPublishedAtLabel: r.replyPublishedAt ? formatDate(r.replyPublishedAt) : null,
  }))

  const total = Number(statsRow?.total ?? 0)
  const avg = total > 0 ? Number(statsRow?.avg ?? 0) : 0
  const distribution = [
    { stars: 5, count: Number(statsRow?.s5 ?? 0) },
    { stars: 4, count: Number(statsRow?.s4 ?? 0) },
    { stars: 3, count: Number(statsRow?.s3 ?? 0) },
    { stars: 2, count: Number(statsRow?.s2 ?? 0) },
    { stars: 1, count: Number(statsRow?.s1 ?? 0) },
  ]

  return (
    <AreaShell area="marketing">
      <AreaContent scroll="region" maxWidth="5xl">
        <p className="mb-4 text-ink-2" style={{ fontSize: 'var(--text-meta)' }}>
          {client.ratingsEnabled
            ? 'Lo que tus clientes opinan tras cada servicio. Las pedimos automáticamente al terminar la cita.'
            : 'Activa el sistema y el bot pedirá valoración tras cada cita.'}
        </p>

        <div className="mb-6">
          <RatingsToggle
            initialEnabled={client.ratingsEnabled}
            initialDelayMinutes={client.followupMinutesAfter}
          />
        </div>

        <form action={saveGoogleReviewUrl} className="mb-6">
          <section className="rounded-2xl border border-line bg-surface p-5 md:p-6">
            <div className="mb-4 flex items-center gap-2">
              <Star className="h-4 w-4 text-brand" />
              <h2 className="text-base font-semibold text-ink">Enlace a Google</h2>
            </div>
            <p className="mb-3 text-sm text-ink-2">
              Solo se muestra al cliente cuando valora <strong>5 estrellas</strong>.
              Pega el enlace de tu ficha en Google Business Profile.
              <span className="mt-1 block text-ink-3">
                Un 4★ puede esconder feedback tibio que no queremos amplificar.
              </span>
            </p>
            <input
              type="url"
              name="googleReviewUrl"
              defaultValue={client.googleReviewUrl || ''}
              placeholder="https://g.page/r/..."
              className="w-full rounded-lg border border-line bg-surface p-3 font-mono text-sm text-ink outline-none focus:border-brand"
            />
            <p className="mt-2 text-xs text-ink-3">
              Consíguelo en{' '}
              <a
                href="https://www.google.com/business"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-ink-2"
              >
                Google Business Profile
              </a>{' '}
              → &ldquo;Reseñas&rdquo; → &ldquo;Obtener más reseñas&rdquo; → copia el enlace corto.
            </p>
            <div className="mt-4 flex items-center justify-end">
              <button type="submit" className="btn-primary active:scale-95">
                Guardar enlace
              </button>
            </div>
          </section>
        </form>

        {total === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center md:p-12">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-brand/20 bg-brand-softer">
              <Star className="h-6 w-6 text-brand" />
            </div>
            <h2
              className="font-semibold text-ink"
              style={{ fontSize: 'var(--text-section-title)' }}
            >
              Aún no tienes reseñas
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">
              {client.ratingsEnabled
                ? 'En cuanto un cliente termine un servicio, recibirá la solicitud y aparecerá aquí.'
                : 'Activa las reseñas arriba y empezaremos a pedirlas tras cada cita.'}
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6 space-y-4">
              <StatStrip
                ariaLabel="Resumen de reseñas"
                stats={[
                  {
                    label: 'Nota media',
                    value: avg.toFixed(1),
                    icon: Star,
                    hint: `sobre ${total} ${total === 1 ? 'valoración' : 'valoraciones'}`,
                  },
                  {
                    label: 'Total',
                    value: String(total),
                    hint: total === 1 ? 'valoración' : 'valoraciones',
                  },
                  {
                    label: '5 estrellas',
                    value:
                      total > 0
                        ? `${Math.round(((statsRow?.s5 ?? 0) / total) * 100)}%`
                        : '0%',
                    hint: `${Number(statsRow?.s5 ?? 0)} reseñas`,
                  },
                ]}
              />
              <section className="overflow-hidden rounded-control border border-line bg-surface">
                <header
                  className="border-b border-line px-[var(--space-card)] py-2"
                  style={{ background: 'var(--table-head-bg)' }}
                >
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-ink-2">
                    Distribución
                  </p>
                </header>
                <div className="space-y-1.5 p-[var(--space-card)]">
                  {distribution.map(({ stars, count }) => (
                    <DistributionRow
                      key={stars}
                      stars={stars}
                      count={count}
                      total={total}
                    />
                  ))}
                </div>
              </section>
            </div>

            <div className="space-y-3">
              {list.map((r) => (
                <article
                  key={r.id}
                  className="rounded-xl border border-line bg-surface p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Stars value={r.rating} />
                      <p className="truncate text-sm font-semibold text-ink">
                        {r.customerName || maskPhone(r.customerPhone)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-ink-3">
                      <ChannelIcon channel={r.channel} />
                      <span>{formatDate(r.createdAt)}</span>
                    </div>
                  </div>
                  {r.comment && (
                    <p
                      className="mt-2 text-sm leading-relaxed text-ink-2"
                      style={{ whiteSpace: 'pre-wrap' }}
                    >
                      {r.comment}
                    </p>
                  )}
                  {r.barberName && (
                    <p className="mt-2 text-xs text-ink-3">
                      Servicio con {r.barberName}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </>
        )}

        <div className="mb-4 mt-8 flex items-center gap-2 border-t border-line pt-8">
          <Sparkles className="h-4 w-4 text-brand" />
          <h2 className="text-base font-semibold text-ink">Reseñas de Google</h2>
        </div>
        <p className="mb-4 text-ink-2" style={{ fontSize: 'var(--text-meta)' }}>
          Respuestas automáticas con IA a las reseñas de tu ficha de Google
          Business Profile — separadas de las valoraciones internas de
          arriba.
        </p>
        <GoogleReviewsSection
          hasFeatureAccess={hasGoogleReviewsAccess}
          upgradeTitle={googleUpgrade.title}
          upgradeBody={googleUpgrade.body}
          connected={googleConnected}
          needsLocationPick={needsGoogleLocationPick}
          locationPath={client.googleBusinessLocationPath}
          connectedAtLabel={
            client.googleBusinessConnectedAt ? formatDate(client.googleBusinessConnectedAt) : null
          }
          autoReplyEnabled={client.googleReviewsAutoReply}
          reviews={googleReviewItems}
          maxReplyLength={MAX_REPLY_LENGTH}
        />
      </AreaContent>
    </AreaShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────────

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value)
        return (
          <Star
            key={n}
            className="h-3.5 w-3.5"
            style={{
              color: filled ? 'var(--color-warning)' : 'var(--color-line)',
              fill: filled ? 'var(--color-warning)' : 'transparent',
            }}
            strokeWidth={1.5}
          />
        )
      })}
    </div>
  )
}

function DistributionRow({
  stars,
  count,
  total,
}: {
  stars: number
  count: number
  total: number
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-3 text-right tabular-nums text-ink-3">{stars}</span>
      <Star className="h-3 w-3 shrink-0 fill-warning text-warning" />
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-overlay">
        <div
          className="h-full rounded-full bg-warning"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right tabular-nums text-ink-3">{count}</span>
    </div>
  )
}

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === 'pwa')
    return <Smartphone className="h-3 w-3" aria-label="PWA" />
  if (channel === 'whatsapp')
    return <MessageCircle className="h-3 w-3" aria-label="WhatsApp" />
  return <MessageSquare className="h-3 w-3" aria-label={channel} />
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return phone
  return `··· ${digits.slice(-4)}`
}

function formatDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dt)
}
