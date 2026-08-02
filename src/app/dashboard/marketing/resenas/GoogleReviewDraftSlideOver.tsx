'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import SlideOver from '@/app/dashboard/_components/SlideOver'
import StarRating from '@/app/dashboard/_components/StarRating'
import { useConfirm } from '@/app/dashboard/_components/ConfirmDialog'
import type { GoogleReviewItem } from './GoogleReviewsSection'

// -----------------------------------------------------------------------------
// GoogleReviewDraftSlideOver — revisión de un borrador de respuesta IA a una
// reseña de Google (1-3★, ver src/lib/google-business/reply.ts:
// shouldAutoPublish — las de 4-5★ se publican solas y nunca pasan por aquí).
//
// El barbero lee la reseña original, edita el texto propuesto y decide:
//   · Publicar → PATCH .../reviews/[id] { action: 'publish', replyText }
//   · Descartar → PATCH .../reviews/[id] { action: 'discard' } (con confirm,
//     es definitivo: el cron no vuelve a generar un borrador para esta fila)
//
// `onDone` la llama el padre para cerrar el panel + refrescar la lista desde
// el servidor (misma convención que el resto del dashboard: el server es la
// fuente de verdad tras una mutación, no cirugía de estado en cliente).
// -----------------------------------------------------------------------------

interface Props {
  open: boolean
  onClose: () => void
  onDone: () => void
  review: GoogleReviewItem | null
  maxReplyLength: number
}

export default function GoogleReviewDraftSlideOver({
  open,
  onClose,
  onDone,
  review,
  maxReplyLength,
}: Props) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirm = useConfirm()

  // Rehidrata el texto editable cada vez que se abre sobre una reseña
  // distinta — el borrador de IA es el punto de partida, el barbero edita
  // encima.
  useEffect(() => {
    if (open && review) {
      setText(review.replyText ?? '')
      setError(null)
    }
  }, [open, review])

  const trimmed = text.trim()
  const overLimit = trimmed.length > maxReplyLength
  const canPublish = trimmed.length > 0 && !overLimit && !submitting

  async function publish() {
    if (!review || !canPublish) return
    setSubmitting(true)
    setError(null)
    try {
      const r = await fetch(`/api/google-business/reviews/${review.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish', replyText: trimmed }),
      })
      const d = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) {
        const msg = d.error ?? 'No se pudo publicar'
        setError(msg)
        toast.error(msg)
        return
      }
      toast.success('Respuesta publicada en Google')
      onDone()
    } catch {
      setError('Error de red')
      toast.error('Error de red')
    } finally {
      setSubmitting(false)
    }
  }

  async function discard() {
    if (!review) return
    const ok = await confirm({
      title: '¿Descartar este borrador?',
      message:
        'La reseña se queda sin respuesta. Es definitivo — si cambias de idea tendrás que responder a mano desde Google Business Profile.',
      confirmLabel: 'Descartar',
      variant: 'danger',
    })
    if (!ok) return
    setSubmitting(true)
    setError(null)
    try {
      const r = await fetch(`/api/google-business/reviews/${review.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'discard' }),
      })
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string }
        const msg = d.error ?? 'No se pudo descartar'
        setError(msg)
        toast.error(msg)
        return
      }
      toast.success('Borrador descartado')
      onDone()
    } catch {
      setError('Error de red')
      toast.error('Error de red')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Revisar respuesta"
      ariaLabel="Revisar y aprobar respuesta a reseña de Google"
    >
      {/* Misma cadena de altura canónica que el resto de SlideOvers: body
          scrollable + footer sticky (ver nota en RegistrarConsumoSlideOver). */}
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {review && (
            <>
              <section className="rounded-xl border border-line bg-canvas p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <StarRating value={review.starRating} />
                    <p className="truncate text-sm font-semibold text-ink">
                      {review.reviewerName || 'Cliente anónimo'}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-ink-3">
                    {review.createdAtLabel}
                  </span>
                </div>
                {review.comment ? (
                  <p
                    className="mt-2 text-sm leading-relaxed text-ink-2"
                    style={{ whiteSpace: 'pre-wrap' }}
                  >
                    {review.comment}
                  </p>
                ) : (
                  <p className="mt-2 text-sm italic text-ink-3">
                    Sin comentario, solo la valoración.
                  </p>
                )}
              </section>

              <div>
                <label
                  htmlFor="gr-reply-text"
                  className="mb-2 block text-xs font-semibold uppercase tracking-widest text-ink-3"
                >
                  Respuesta propuesta por IA
                </label>
                <textarea
                  id="gr-reply-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={7}
                  className="w-full resize-none rounded-lg border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-brand"
                  placeholder="Escribe la respuesta que verá el cliente en Google..."
                />
                <p
                  className={`mt-1.5 text-right text-[11px] ${overLimit ? 'text-danger' : 'text-ink-3'}`}
                >
                  {trimmed.length} / {maxReplyLength}
                </p>
              </div>

              <p className="text-[11px] leading-relaxed text-ink-3">
                Se publica tal cual quede aquí, en el perfil público de Google
                Business Profile de tu barbería. Revísala antes de publicar.
              </p>

              {error && (
                <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3">
          <button
            type="button"
            onClick={discard}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Descartar
          </button>
          <button
            type="button"
            onClick={publish}
            disabled={!canPublish}
            className="btn-primary btn-sm"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Publicar respuesta
          </button>
        </div>
      </div>
    </SlideOver>
  )
}
