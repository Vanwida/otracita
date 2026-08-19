'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  Check,
  ExternalLink,
  Loader2,
  Lock,
  MapPin,
  RotateCcw,
  Sparkles,
  Unlink,
} from 'lucide-react'
import { toast } from 'sonner'
import { useConfirm } from '@/app/dashboard/_components/ConfirmDialog'
import SlideOver from '@/app/dashboard/_components/SlideOver'
import StatStrip from '@/app/dashboard/_components/StatStrip'
import StarRating from '@/app/dashboard/_components/StarRating'
import GoogleReviewDraftSlideOver from './GoogleReviewDraftSlideOver'
import GoogleLocationList from './GoogleLocationList'

// -----------------------------------------------------------------------------
// GoogleReviewsSection — auto-respuesta con IA a reseñas de Google Business
// Profile. Vive DEBAJO de las valoraciones internas en /dashboard/marketing/
// resenas (misma pestaña, sin ítem nuevo de menú).
//
// Cuatro estados, igual que SumupConnect / RatingsToggle:
//   1. Tier sin acceso (`googleReviews` requiere Pro) → card de upgrade.
//   2. Tier con acceso pero sin conectar (sin tokens) → explicación +
//      "Conectar Google".
//   2b. Tokens válidos pero sin location elegida — cuenta de Google con
//      varias fichas (cadena multi-local). Pasa por aquí tanto recién
//      llegado del callback (reason=multiple-locations) como si el barbero
//      abandonó el picker y vuelve más tarde — el estado se deriva de la
//      fila `clients` (tokens presentes + locationPath null), no de la URL.
//   3. Conectado → toggle de respuesta automática + stats + lista de
//      reseñas, con las de 1-3★ en 'draft' pidiendo revisión del barbero
//      (abre GoogleReviewDraftSlideOver). Incluye "Cambiar ubicación" para
//      quien eligió la ficha equivocada la primera vez.
// -----------------------------------------------------------------------------

export type GoogleReviewStatus = 'pending' | 'draft' | 'published' | 'failed' | 'skipped'

export interface GoogleReviewItem {
  id: string
  reviewerName: string | null
  starRating: number
  comment: string | null
  createdAtLabel: string
  replyText: string | null
  replyStatus: string
  replyPublishedAtLabel: string | null
}

interface Props {
  hasFeatureAccess: boolean
  upgradeTitle: string
  upgradeBody: string
  connected: boolean
  /** Tokens de Google válidos pero sin location elegida todavía (cuenta con
   *  varias fichas). Derivado server-side de `clients`, no de la URL. */
  needsLocationPick: boolean
  locationPath: string | null
  connectedAtLabel: string | null
  autoReplyEnabled: boolean
  reviews: GoogleReviewItem[]
  maxReplyLength: number
}

const STATUS_LABEL: Record<GoogleReviewStatus, { label: string; className: string }> = {
  pending: { label: 'Pendiente', className: 'text-ink-3' },
  draft: { label: 'Borrador · revisar', className: 'text-warning' },
  published: { label: 'Publicada', className: 'text-success' },
  failed: { label: 'Fallida', className: 'text-danger' },
  skipped: { label: 'Descartada', className: 'text-ink-3' },
}

function statusMeta(status: string): { label: string; className: string } {
  return STATUS_LABEL[status as GoogleReviewStatus] ?? { label: status, className: 'text-ink-3' }
}

export default function GoogleReviewsSection({
  hasFeatureAccess,
  upgradeTitle,
  upgradeBody,
  connected,
  needsLocationPick,
  locationPath,
  connectedAtLabel,
  autoReplyEnabled,
  reviews,
  maxReplyLength,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const confirm = useConfirm()

  const [autoReply, setAutoReply] = useState(autoReplyEnabled)
  const [togglePending, setTogglePending] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [selected, setSelected] = useState<GoogleReviewItem | null>(null)
  const [changingLocation, setChangingLocation] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)

  const flashConnected = searchParams.get('google_business') === 'connected'
  const flashError = searchParams.get('google_business') === 'error'
  const flashReason = searchParams.get('reason')

  const stats = useMemo(() => {
    const total = reviews.length
    const sum = reviews.reduce((acc, r) => acc + r.starRating, 0)
    const avg = total > 0 ? sum / total : 0
    const drafts = reviews.filter((r) => r.replyStatus === 'draft').length
    return { total, avg, drafts }
  }, [reviews])

  function connect() {
    window.location.href = '/api/google-business/oauth/start'
  }

  async function disconnect() {
    const ok = await confirm({
      title: '¿Desconectar Google Business Profile?',
      message:
        'Dejaremos de sincronizar tus reseñas de Google y de responderlas automáticamente.',
      confirmLabel: 'Desconectar',
      variant: 'danger',
    })
    if (!ok) return
    setDisconnecting(true)
    try {
      const r = await fetch('/api/google-business/oauth/disconnect', { method: 'POST' })
      if (!r.ok) {
        toast.error('No se pudo desconectar')
        return
      }
      startTransition(() => router.refresh())
    } catch {
      toast.error('Error de red')
    } finally {
      setDisconnecting(false)
    }
  }

  function onToggleAutoReply() {
    const next = !autoReply
    setAutoReply(next)
    setTogglePending(true)
    startTransition(async () => {
      try {
        const r = await fetch('/api/google-business/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ googleReviewsAutoReply: next }),
        })
        if (!r.ok) {
          setAutoReply(!next)
          const d = (await r.json().catch(() => ({}))) as { error?: string }
          toast.error(d.error ?? 'No se pudo guardar')
          return
        }
        toast.success('Guardado')
      } catch {
        setAutoReply(!next)
        toast.error('Error de red')
      } finally {
        setTogglePending(false)
      }
    })
  }

  async function retryFailed(reviewId: string) {
    setRetryingId(reviewId)
    try {
      const r = await fetch(`/api/google-business/reviews/${reviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry' }),
      })
      const d = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) {
        toast.error(d.error ?? 'No se pudo reintentar')
        return
      }
      toast.success('La volveremos a intentar en la próxima sincronización')
      startTransition(() => router.refresh())
    } catch {
      toast.error('Error de red')
    } finally {
      setRetryingId(null)
    }
  }

  function closeSlideOver() {
    setSelected(null)
  }

  function onSlideOverDone() {
    setSelected(null)
    startTransition(() => router.refresh())
  }

  // Compartidos entre el picker inline (estado 2b, sin location aún) y el
  // SlideOver "Cambiar ubicación" (estado 3, ya conectado) — memoizados
  // porque GoogleLocationList los usa como dependencia de su efecto de
  // fetch inicial (ver nota en ese archivo).
  const onLocationSelected = useCallback(
    (title: string) => {
      toast.success(`Conectado a ${title}`)
      setChangingLocation(false)
      startTransition(() => router.refresh())
    },
    [router, startTransition],
  )
  const onLocationReconnectRequired = useCallback(() => {
    toast.error('Tu conexión con Google caducó. Vuelve a conectarla.')
    setChangingLocation(false)
    startTransition(() => router.refresh())
  }, [router, startTransition])

  // ── Estado 1: tier sin acceso ───────────────────────────────────────────
  if (!hasFeatureAccess) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5 md:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-overlay text-ink-3">
            <Lock className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-ink">{upgradeTitle}</h2>
            <p className="mt-1 max-w-xl text-sm text-ink-2">{upgradeBody}</p>
            <Link
              href="/dashboard/mi-plan"
              className="btn-primary btn-sm mt-4 inline-flex items-center gap-1.5"
            >
              Ver Suscripción
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    )
  }

  // ── Estado 2b: tokens válidos, sin location elegida (multi-local) ───────
  if (needsLocationPick) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5 md:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-softer text-brand-strong">
            <MapPin className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-ink">Elige tu ficha de Google</h2>
            <p className="mt-1 max-w-xl text-sm text-ink-2">
              Tu cuenta de Google tiene varias fichas de empresa. Elige cuál
              es esta barbería para que otracita responda solo a sus reseñas.
            </p>
            <div className="mt-4">
              <GoogleLocationList
                onSelected={onLocationSelected}
                onReconnectRequired={onLocationReconnectRequired}
              />
            </div>
          </div>
        </div>
      </section>
    )
  }

  // ── Estado 2: acceso pero sin conectar ──────────────────────────────────
  if (!connected) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5 md:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-softer text-brand-strong">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">Auto-respuesta con IA</h2>
                <p className="mt-1 max-w-xl text-sm text-ink-2">
                  Conecta tu ficha de Google Business Profile para que otracita
                  responda tus reseñas por ti.
                </p>
              </div>
              <button type="button" onClick={connect} className="btn-primary btn-sm">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Conectar Google
              </button>
            </div>

            {flashError && (
              <p className="mt-3 inline-flex items-center gap-1 text-xs text-danger">
                <AlertCircle className="h-3 w-3" aria-hidden="true" />
                Error al conectar{flashReason ? `: ${flashReason}` : ''}
              </p>
            )}

            <ul className="mt-4 space-y-1 text-xs leading-relaxed text-ink-2">
              <li>· Las reseñas de 4-5★ se responden solas con IA, sin que tengas que hacer nada</li>
              <li>· Las de 1-3★ se quedan en borrador — tú apruebas antes de publicar</li>
              <li>· Te avisamos por email cuando hay un borrador esperando</li>
              <li>· Te puedes desconectar cuando quieras</li>
            </ul>
          </div>
        </div>
      </section>
    )
  }

  // ── Estado 3: conectado ──────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-surface p-5 md:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-softer text-brand-strong">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">Auto-respuesta con IA</h2>
                <p className="mt-1 text-xs text-ink-3">
                  {connectedAtLabel ? `Conectado desde ${connectedAtLabel}` : 'Conectado'}
                  {locationPath && (
                    <span className="ml-1 font-mono text-ink-3">· {locationPath}</span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setChangingLocation(true)}
                  disabled={disconnecting}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:border-brand hover:text-ink disabled:opacity-60"
                >
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  Cambiar ubicación
                </button>
                <button
                  type="button"
                  onClick={disconnect}
                  disabled={disconnecting}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:border-danger hover:text-danger disabled:opacity-60"
                >
                  {disconnecting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Desconectar
                </button>
              </div>
            </div>

            {flashConnected && (
              <p className="mt-3 inline-flex items-center gap-1 text-xs text-success">
                <Check className="h-3 w-3" aria-hidden="true" /> Google conectado correctamente
              </p>
            )}

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Responder automáticamente</p>
                <p className="mt-0.5 max-w-md text-xs text-ink-2">
                  Las reseñas de 4-5★ se publican solas. Las de 1-3★ se
                  quedan en borrador para que las revises y apruebes tú.
                </p>
              </div>
              <button
                type="button"
                onClick={onToggleAutoReply}
                disabled={togglePending}
                role="switch"
                aria-checked={autoReply}
                aria-label="Responder automáticamente con IA"
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
                  autoReply ? 'bg-brand' : 'bg-line'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    autoReply ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </section>

      {reviews.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center">
          <p className="text-sm text-ink-2">
            Aún no hay reseñas sincronizadas. Se sincronizan solas cada pocas
            horas.
          </p>
        </div>
      ) : (
        <>
          <StatStrip
            ariaLabel="Resumen de reseñas de Google"
            stats={[
              {
                label: 'Nota media',
                value: stats.avg.toFixed(1),
                icon: Sparkles,
                hint: `sobre ${stats.total} ${stats.total === 1 ? 'reseña' : 'reseñas'}`,
              },
              { label: 'Total', value: String(stats.total), hint: 'reseñas de Google' },
              {
                label: 'Borradores',
                value: String(stats.drafts),
                hint: stats.drafts > 0 ? 'esperando tu revisión' : 'al día',
              },
            ]}
          />

          <div className="space-y-3">
            {reviews.map((r) => {
              const meta = statusMeta(r.replyStatus)
              const needsReview = r.replyStatus === 'draft'
              return (
                <article
                  key={r.id}
                  className="rounded-xl border border-line bg-surface p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <StarRating value={r.starRating} />
                      <p className="truncate text-sm font-semibold text-ink">
                        {r.reviewerName || 'Cliente anónimo'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className={`font-semibold ${meta.className}`}>{meta.label}</span>
                      <span className="text-ink-3">{r.createdAtLabel}</span>
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
                  {r.replyStatus === 'published' && r.replyText && (
                    <div className="mt-3 rounded-lg bg-overlay/60 p-3">
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-ink-3">
                        Tu respuesta
                      </p>
                      <p className="text-sm text-ink-2" style={{ whiteSpace: 'pre-wrap' }}>
                        {r.replyText}
                      </p>
                    </div>
                  )}
                  {needsReview && (
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setSelected(r)}
                        className="btn-primary btn-sm"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        Revisar y aprobar
                      </button>
                    </div>
                  )}
                  {r.replyStatus === 'failed' && (
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => retryFailed(r.id)}
                        disabled={retryingId === r.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:border-brand hover:text-ink disabled:opacity-60"
                      >
                        {retryingId === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        Reintentar
                      </button>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </>
      )}

      <GoogleReviewDraftSlideOver
        open={selected !== null}
        onClose={closeSlideOver}
        onDone={onSlideOverDone}
        review={selected}
        maxReplyLength={maxReplyLength}
      />

      <SlideOver
        open={changingLocation}
        onClose={() => setChangingLocation(false)}
        title="Cambiar ubicación de Google"
        ariaLabel="Cambiar la ficha de Google Business Profile conectada"
      >
        <div className="space-y-3 px-5 py-5">
          <p className="text-sm text-ink-2">
            Elige qué ficha de Google Business Profile quieres usar para esta
            barbería. A partir de ahora sincronizamos y respondemos las
            reseñas de la que elijas.
          </p>
          <GoogleLocationList
            onSelected={onLocationSelected}
            onReconnectRequired={onLocationReconnectRequired}
          />
        </div>
      </SlideOver>
    </div>
  )
}
