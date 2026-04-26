export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients, ratings } from '@/db/schema'
import { desc, eq, sql } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { Star, MessageSquare, MessageCircle, Smartphone } from 'lucide-react'
import AjustesBreadcrumb from '@/app/dashboard/_components/AjustesBreadcrumb'
import RatingsToggle from './RatingsToggle'

// -----------------------------------------------------------------------------
// /dashboard/reseñas — Vista de reseñas que recibe el barbero.
//
// Layout:
//   1. Breadcrumb de vuelta a Ajustes.
//   2. Toggle on/off para activar la solicitud automática.
//   3. Stats: nota media, total, distribución por estrellas.
//   4. Lista cronológica (desc) con cada valoración: estrellas, comentario,
//      barbero, fecha, canal (push/whatsapp).
//
// Sin filtros avanzados todavía — MVP. Si crece, se añade selector de
// barbero y rango de fechas.
// -----------------------------------------------------------------------------

export default async function ReseñasPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  // Stats agregadas + lista en paralelo.
  const [statsRow, list] = await Promise.all([
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
  ])

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
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <AjustesBreadcrumb current="Reseñas" />
      <div className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">Reseñas</h1>
        <p className="text-ink-2">
          Lo que tus clientes opinan tras cada servicio. Las pedimos automáticamente al terminar la cita.
        </p>
      </div>

      <div className="mb-6">
        <RatingsToggle initialEnabled={client.ratingsEnabled} />
      </div>

      {total === 0 ? (
        <div className="bg-surface border border-line rounded-2xl p-8 md:p-12 text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-brand-softer border border-brand/20 flex items-center justify-center">
            <Star className="h-6 w-6 text-brand" />
          </div>
          <h2 className="font-display text-xl font-semibold text-ink">Aún no tienes reseñas</h2>
          <p className="mt-2 text-ink-2 text-sm max-w-md mx-auto">
            {client.ratingsEnabled
              ? 'En cuanto un cliente termine un servicio, recibirá la solicitud y aparecerá aquí.'
              : 'Activa las reseñas arriba y empezaremos a pedirlas tras cada cita.'}
          </p>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-3 mb-6">
            <div className="bg-surface border border-line rounded-2xl p-5 text-center">
              <p className="text-[11px] uppercase tracking-widest text-ink-3 font-semibold mb-2">
                Nota media
              </p>
              <p className="font-display text-4xl font-bold text-ink">{avg.toFixed(1)}</p>
              <Stars value={avg} className="justify-center mt-2" />
            </div>
            <div className="bg-surface border border-line rounded-2xl p-5 text-center">
              <p className="text-[11px] uppercase tracking-widest text-ink-3 font-semibold mb-2">
                Total
              </p>
              <p className="font-display text-4xl font-bold text-ink">{total}</p>
              <p className="text-xs text-ink-3 mt-2">{total === 1 ? 'valoración' : 'valoraciones'}</p>
            </div>
            <div className="bg-surface border border-line rounded-2xl p-5 sm:col-span-1 col-span-1">
              <p className="text-[11px] uppercase tracking-widest text-ink-3 font-semibold mb-3">
                Distribución
              </p>
              <div className="space-y-1.5">
                {distribution.map(({ stars, count }) => (
                  <DistributionRow
                    key={stars}
                    stars={stars}
                    count={count}
                    total={total}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* List */}
          <div className="space-y-3">
            {list.map((r) => (
              <article
                key={r.id}
                className="bg-surface border border-line rounded-xl p-4"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <Stars value={r.rating} />
                    <p className="text-sm font-semibold text-ink truncate">
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
                    className="mt-2 text-sm text-ink-2 leading-relaxed"
                    style={{ whiteSpace: 'pre-wrap' }}
                  >
                    {r.comment}
                  </p>
                )}
                {r.barberName && (
                  <p className="mt-2 text-xs text-ink-3">Servicio con {r.barberName}</p>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────────

function Stars({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value)
        return (
          <Star
            key={n}
            className="h-3.5 w-3.5"
            style={{
              color: filled ? '#F5A623' : 'var(--color-line)',
              fill: filled ? '#F5A623' : 'transparent',
            }}
            strokeWidth={1.5}
          />
        )
      })}
    </div>
  )
}

function DistributionRow({ stars, count, total }: { stars: number; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-3 text-ink-3 text-right tabular-nums">{stars}</span>
      <Star className="h-3 w-3 text-warning fill-warning shrink-0" />
      <div className="flex-1 h-1.5 bg-overlay rounded-full overflow-hidden">
        <div
          className="h-full bg-warning rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-ink-3 tabular-nums">{count}</span>
    </div>
  )
}

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === 'pwa') return <Smartphone className="h-3 w-3" aria-label="PWA" />
  if (channel === 'whatsapp') return <MessageCircle className="h-3 w-3" aria-label="WhatsApp" />
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
