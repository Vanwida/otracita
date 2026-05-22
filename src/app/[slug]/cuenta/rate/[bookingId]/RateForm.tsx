'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Star, Check, ChevronLeft, Loader2, Heart } from 'lucide-react'
import { SiGoogle } from 'react-icons/si'
import { dispatchTracking } from '@/lib/tracking/dispatch'

// -----------------------------------------------------------------------------
// RateForm — UX táctil para valorar una visita desde la PWA del cliente.
//
// Estados:
//   - existing != null  → muestra valoración previa (read-only) con thank-you
//   - rating === null   → 5 estrellas grandes para elegir + opcional comentario
//   - submitted         → confirmación con CTA "Volver a mi cuenta"
//
// Las estrellas son botones grandes (h-12) — pensadas para tap, no click.
// El comentario es opcional para minimizar fricción; pedirlo obligatorio
// haría que la mayoría no valoren.
// -----------------------------------------------------------------------------

interface ExistingRating {
  rating: number
  comment: string | null
  createdAt: Date
}

interface TipConfig {
  /** Importes en céntimos sugeridos por la barbería. Hasta 3. */
  suggestedCents: number[]
}

interface ExistingTip {
  amountCents: number
}

interface Props {
  slug: string
  bookingId: string
  businessName: string
  service: string
  barber: string | null
  date: string
  time: string
  existing: ExistingRating | null
  /** null = la barbería no acepta propinas online (no Connect / no tipsEnabled). */
  tipConfig: TipConfig | null
  /** Si ya pagó propina para este booking, mostramos confirmación en vez de CTA. */
  existingTip: ExistingTip | null
  /** URL pública de reseña en Google Maps. Si la barbería la configuró y el
   *  cliente valora 5★, mostramos CTA para publicar en Google. */
  googleReviewUrl: string | null
}

export default function RateForm({
  slug,
  bookingId,
  businessName,
  service,
  barber,
  date,
  time,
  existing,
  tipConfig,
  existingTip,
  googleReviewUrl,
}: Props) {
  const router = useRouter()
  const [rating, setRating] = useState<number | null>(existing?.rating ?? null)
  const [hoverRating, setHoverRating] = useState<number | null>(null)
  const [comment, setComment] = useState<string>(existing?.comment ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(Boolean(existing))
  const [error, setError] = useState<string | null>(null)
  const [tipBusy, setTipBusy] = useState(false)
  const [tipError, setTipError] = useState<string | null>(null)

  // El bloque de propina solo aparece tras enviar la valoración Y solo si:
  //   · La nota es ≥ 4 (Booksy convention: tip a clientes contentos)
  //   · La barbería acepta propinas online (tipConfig != null)
  //   · No hay propina ya pagada (existingTip == null)
  const finalRating = rating ?? existing?.rating ?? 0
  const showTipBlock =
    submitted && finalRating >= 4 && tipConfig !== null && existingTip === null
  // CTA Google Reseñas: solo en 5★ y si la barbería configuró el link. Secundario
  // visualmente al tip (que es el conversion event que paga al barbero).
  const showGoogleCta = submitted && finalRating === 5 && Boolean(googleReviewUrl)

  const payTip = async (amountCents: number) => {
    setTipBusy(true)
    setTipError(null)
    try {
      const r = await fetch('/api/app/tips/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, amountCents }),
      })
      const d = (await r.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!r.ok || !d.url) {
        setTipError(d?.error ?? 'No se pudo iniciar el pago')
        return
      }
      // Antes de redirigir a Stripe Checkout, dejamos una marca en
      // sessionStorage. Cuando el cliente vuelva a esta página (manual o
      // por deep-link) detectamos la marca + existingTip y disparamos el
      // evento tip_paid a todos los trackers. Sin este marker no podemos
      // distinguir "abre rate por curiosidad" de "vuelve de Stripe".
      try {
        window.sessionStorage.setItem(
          `otc_tip_pending_${bookingId}`,
          JSON.stringify({ amountCents, t: Date.now() }),
        )
      } catch {
        /* sessionStorage puede fallar en modo privado */
      }
      window.location.href = d.url
    } catch {
      setTipError('Error de red')
    } finally {
      setTipBusy(false)
    }
  }

  // Detectar regreso de Stripe Checkout: si existingTip ya está pagado Y
  // la marca de "intent to pay" sigue en sessionStorage → el barbero acaba
  // de cobrar, disparamos tip_paid una sola vez y limpiamos el marker.
  useEffect(() => {
    if (!existingTip || existingTip.amountCents <= 0) return
    if (typeof window === 'undefined') return
    const key = `otc_tip_pending_${bookingId}`
    let marker: { amountCents?: number } | null = null
    try {
      const raw = window.sessionStorage.getItem(key)
      if (!raw) return
      marker = JSON.parse(raw) as { amountCents?: number }
    } catch {
      return
    }
    if (!marker) return
    dispatchTracking({
      event: 'tip_paid',
      valueCents: existingTip.amountCents,
      currency: 'EUR',
      transactionId: `tip-${bookingId}`,
    })
    try {
      window.sessionStorage.removeItem(key)
    } catch {
      /* noop */
    }
  }, [existingTip, bookingId])

  const submit = async () => {
    if (rating === null) return
    setError(null)
    setSubmitting(true)
    try {
      const r = await fetch('/api/app/ratings/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, rating, comment: comment.trim() || undefined }),
      })
      const d = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) {
        setError(d?.error ?? 'No se pudo guardar')
        return
      }
      setSubmitted(true)
    } catch {
      setError('Error de red')
    } finally {
      setSubmitting(false)
    }
  }

  const formattedDate = formatDate(date, time)
  const display = hoverRating ?? rating

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--theme-canvas)' }}>
      <header className="px-4 pt-6 pb-4">
        <Link
          href={`/${slug}/cuenta`}
          className="inline-flex items-center gap-1 text-sm transition-colors"
          style={{ color: 'var(--theme-ink-2)' }}
        >
          <ChevronLeft className="h-4 w-4" />
          Mi cuenta
        </Link>
      </header>

      <main className="flex-1 px-4 pb-12 mx-auto w-full max-w-md">
        <h1 className="font-display text-2xl font-bold mb-2" style={{ color: 'var(--theme-ink)' }}>
          {submitted ? '¡Gracias por tu valoración!' : '¿Qué tal estuvo?'}
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--theme-ink-2)' }}>
          {service}
          {barber ? ` con ${barber}` : ''} en {businessName}
          <br />
          <span style={{ color: 'var(--theme-ink-3)' }}>{formattedDate}</span>
        </p>

        {submitted ? (
          <>
            <div
              className="rounded-2xl p-6 text-center"
              style={{
                background: 'var(--theme-surface)',
                border: '1px solid var(--theme-line)',
              }}
            >
              <div
                className="mx-auto mb-4 h-14 w-14 rounded-full flex items-center justify-center"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}
              >
                <Check className="h-6 w-6" />
              </div>
              <p className="text-base font-semibold mb-1" style={{ color: 'var(--theme-ink)' }}>
                {existing
                  ? `Valoraste ${existing.rating}/5`
                  : `${rating}/5 · valoración guardada`}
              </p>
              <p className="text-sm" style={{ color: 'var(--theme-ink-3)' }}>
                {existing
                  ? 'Ya habías valorado esta visita. Gracias.'
                  : 'Tu opinión ayuda mucho a la barbería a mejorar.'}
              </p>
            </div>

            {/* Confirmación de propina ya pagada — caso "el cliente vuelve a abrir el link después de pagar". */}
            {existingTip && (
              <div
                className="mt-4 rounded-2xl p-5 flex items-center gap-3"
                style={{
                  background: 'var(--theme-surface)',
                  border: '1px solid var(--theme-line)',
                }}
              >
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}
                >
                  <Heart className="h-5 w-5" fill="currentColor" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--theme-ink)' }}>
                    Propina pagada · {(existingTip.amountCents / 100).toFixed(0)} €
                  </p>
                  <p className="text-xs" style={{ color: 'var(--theme-ink-3)' }}>
                    Gracias por reconocer el trabajo del barbero.
                  </p>
                </div>
              </div>
            )}

            {/* CTA propina — solo si nota ≥ 4, barbería acepta tips, no pagó aún. */}
            {showTipBlock && tipConfig && (
              <div
                className="mt-4 rounded-2xl p-5"
                style={{
                  background: 'var(--theme-surface)',
                  border: '1px solid var(--theme-line)',
                }}
              >
                <div className="flex items-start gap-3 mb-4">
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}
                  >
                    <Heart className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--theme-ink)' }}>
                      ¿Dejas propina{barber ? ` a ${barber}` : ''}?
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--theme-ink-3)' }}>
                      100% va al barbero. Pago seguro con tarjeta o Apple Pay.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {tipConfig.suggestedCents.map((cents) => (
                    <button
                      key={cents}
                      type="button"
                      onClick={() => payTip(cents)}
                      disabled={tipBusy}
                      className="rounded-xl px-3 py-3 text-base font-bold transition-transform active:scale-95 disabled:opacity-60"
                      style={{
                        background: 'var(--theme-overlay)',
                        border: '1px solid var(--theme-line)',
                        color: 'var(--theme-ink)',
                      }}
                    >
                      {(cents / 100).toFixed(0)} €
                    </button>
                  ))}
                </div>

                {tipError && (
                  <p className="mt-3 text-xs text-center" style={{ color: '#DC2626' }}>
                    {tipError}
                  </p>
                )}

                {tipBusy && (
                  <p
                    className="mt-3 text-xs text-center flex items-center justify-center gap-1.5"
                    style={{ color: 'var(--theme-ink-3)' }}
                  >
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Preparando pago…
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => router.push(`/${slug}/cuenta`)}
                  className="mt-3 w-full text-sm py-2 transition-colors"
                  style={{ color: 'var(--theme-ink-3)' }}
                >
                  No, gracias
                </button>
              </div>
            )}

            {/* CTA Google Reseñas — solo si nota === 5 y la barbería tiene link.
                Secundario al tip: variant brand-soft, debajo. Abre en pestaña
                nueva con window.open para preservar el estado de la PWA (un
                <a target="_blank"> dispararía full reload del Service Worker
                shell en algunos browsers). */}
            {showGoogleCta && googleReviewUrl && (
              <div className={showTipBlock ? 'mt-3' : 'mt-4'}>
                <button
                  type="button"
                  onClick={() =>
                    window.open(googleReviewUrl, '_blank', 'noopener,noreferrer')
                  }
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-transform active:scale-[0.98]"
                  style={{
                    background: 'var(--accent-soft)',
                    color: 'var(--accent-strong)',
                    border: '1px solid var(--theme-line)',
                    minHeight: '48px',
                  }}
                >
                  <SiGoogle className="h-4 w-4" />
                  Publicar reseña en Google
                </button>
                <p
                  className="mt-2 text-[11px] text-center"
                  style={{ color: 'var(--theme-ink-3)' }}
                >
                  Tu opinión nos ayuda mucho. Se abrirá Google Maps en otra pestaña.
                </p>
                {/* Sin tip CTA arriba, el usuario no tendría link de vuelta —
                    añadimos uno discreto. Si hay tip CTA, ya incluye "No, gracias". */}
                {!showTipBlock && (
                  <button
                    type="button"
                    onClick={() => router.push(`/${slug}/cuenta`)}
                    className="mt-3 w-full text-sm py-2 transition-colors"
                    style={{ color: 'var(--theme-ink-3)' }}
                  >
                    Volver a mi cuenta
                  </button>
                )}
              </div>
            )}

            {/* Si no hay tip CTA NI Google CTA (nota baja, sin Connect, sin link),
                simplemente botón para volver a cuenta. */}
            {!showTipBlock && !showGoogleCta && (
              <Link
                href={`/${slug}/cuenta`}
                className="mt-4 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-bold transition-transform active:scale-[0.98]"
                style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                Volver a mi cuenta
              </Link>
            )}
          </>
        ) : (
          <>
            <div
              className="rounded-2xl p-5"
              style={{
                background: 'var(--theme-surface)',
                border: '1px solid var(--theme-line)',
              }}
            >
              <p
                className="text-xs font-semibold uppercase tracking-widest mb-3 text-center"
                style={{ color: 'var(--theme-ink-3)' }}
              >
                Toca para valorar
              </p>

              <div className="flex items-center justify-between gap-2">
                {[1, 2, 3, 4, 5].map((n) => {
                  const filled = display !== null && n <= display
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      onMouseEnter={() => setHoverRating(n)}
                      onMouseLeave={() => setHoverRating(null)}
                      onTouchStart={() => setHoverRating(n)}
                      className="flex-1 flex items-center justify-center h-14 rounded-xl transition-transform active:scale-95"
                      style={{ background: 'transparent' }}
                      aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`}
                    >
                      <Star
                        className="h-9 w-9 transition-colors"
                        style={{
                          color: filled ? '#F5A623' : 'var(--theme-line)',
                          fill: filled ? '#F5A623' : 'transparent',
                        }}
                        strokeWidth={1.5}
                      />
                    </button>
                  )
                })}
              </div>

              {rating !== null && (
                <p
                  className="text-center text-sm font-semibold mt-3"
                  style={{ color: 'var(--theme-ink)' }}
                >
                  {ratingLabel(rating)}
                </p>
              )}
            </div>

            {rating !== null && (
              <div className="mt-4">
                <label
                  className="text-xs font-semibold uppercase tracking-widest mb-2 block"
                  style={{ color: 'var(--theme-ink-3)' }}
                >
                  ¿Quieres añadir un comentario? (opcional)
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder={
                    rating >= 4
                      ? 'Cuéntale al barbero qué te gustó...'
                      : '¿Cómo podrían mejorar?'
                  }
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors resize-none"
                  style={{
                    background: 'var(--theme-surface)',
                    border: '1px solid var(--theme-line)',
                    color: 'var(--theme-ink)',
                  }}
                />
                <p className="text-[11px] mt-1 text-right" style={{ color: 'var(--theme-ink-3)' }}>
                  {comment.length}/500
                </p>
              </div>
            )}

            {error && (
              <div
                className="mt-3 rounded-xl px-4 py-3 text-sm"
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#DC2626',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                }}
              >
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={rating === null || submitting}
              className="mt-5 w-full rounded-xl px-6 py-4 text-base font-bold transition-transform active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando…
                </>
              ) : (
                'Enviar valoración'
              )}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/${slug}/cuenta`)}
              className="mt-2 w-full text-sm py-2 transition-colors"
              style={{ color: 'var(--theme-ink-3)' }}
            >
              Ahora no
            </button>
          </>
        )}
      </main>
    </div>
  )
}

function ratingLabel(rating: number): string {
  if (rating === 5) return 'Genial 🎉'
  if (rating === 4) return 'Muy bueno'
  if (rating === 3) return 'Bien'
  if (rating === 2) return 'Regular'
  return 'Mal'
}

function formatDate(date: string, time: string): string {
  // date: YYYY-MM-DD → "viernes, 26 de abril a las 18:00"
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1)
  const formatted = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(dt)
  return `${formatted} a las ${time}`
}
