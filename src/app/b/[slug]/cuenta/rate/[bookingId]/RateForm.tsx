'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Star, Check, ChevronLeft, Loader2 } from 'lucide-react'

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

interface Props {
  slug: string
  bookingId: string
  businessName: string
  service: string
  barber: string | null
  date: string
  time: string
  existing: ExistingRating | null
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
}: Props) {
  const router = useRouter()
  const [rating, setRating] = useState<number | null>(existing?.rating ?? null)
  const [hoverRating, setHoverRating] = useState<number | null>(null)
  const [comment, setComment] = useState<string>(existing?.comment ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(Boolean(existing))
  const [error, setError] = useState<string | null>(null)

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
          href={`/b/${slug}/cuenta`}
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
            <Link
              href={`/b/${slug}/cuenta`}
              className="mt-5 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-bold transition-transform active:scale-[0.98]"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              Volver a mi cuenta
            </Link>
          </div>
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
              onClick={() => router.push(`/b/${slug}/cuenta`)}
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
