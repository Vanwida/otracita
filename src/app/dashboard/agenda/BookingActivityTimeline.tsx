'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { bookingEventMeta, actorLabelText, formatRelativeEs } from '@/lib/bookings/event-meta'

// -----------------------------------------------------------------------------
// BookingActivityTimeline — sección "Actividad" del panel de detalle de cita
// (task #107). Timeline vertical simple, orden cronológico DESCENDENTE (lo
// último arriba). Cada evento: icono por tipo + summary + actorLabel + hora
// relativa ("hace 2h", "ayer 18:30").
//
// Fetch a /api/bookings/[id]/events al montar / cambiar de cita. Silencioso
// ante fallos de red (la actividad es informativa, no bloquea el panel).
// -----------------------------------------------------------------------------

interface ActivityEvent {
  id: string
  type: string
  actor: string
  actorLabel: string | null
  summary: string
  createdAt: string
}

interface Props {
  bookingId: string
}

export default function BookingActivityTimeline({ bookingId }: Props) {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    ;(async () => {
      try {
        const res = await fetch(`/api/bookings/${bookingId}/events`)
        if (!res.ok) throw new Error('fetch failed')
        const data = (await res.json()) as { events: ActivityEvent[] }
        if (!cancelled) setEvents(data.events ?? [])
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bookingId])

  return (
    <div className="pt-2 border-t border-line space-y-3">
      <p className="text-xs font-bold uppercase tracking-widest text-ink-2">
        Actividad
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-ink-3 text-xs py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Cargando actividad…
        </div>
      ) : error ? (
        <p className="text-xs text-ink-3">No se pudo cargar la actividad.</p>
      ) : !events || events.length === 0 ? (
        <p className="text-xs text-ink-3">Sin actividad registrada todavía.</p>
      ) : (
        <ol className="relative space-y-3 pl-1">
          {events.map((ev, idx) => {
            const meta = bookingEventMeta(ev.type)
            const Icon = meta.Icon
            const isLast = idx === events.length - 1
            return (
              <li key={ev.id} className="relative flex gap-3">
                {/* Línea vertical conectora — no en el último item. */}
                {!isLast && (
                  <span
                    className="absolute left-[0.6875rem] top-7 bottom-[-0.75rem] w-px bg-line"
                    aria-hidden="true"
                  />
                )}
                <span
                  className={`relative z-10 inline-flex h-[1.375rem] w-[1.375rem] shrink-0 items-center justify-center rounded-full ${meta.toneBg}`}
                  aria-hidden="true"
                >
                  <Icon className={`h-3 w-3 ${meta.toneText}`} />
                </span>
                <div className="min-w-0 flex-1 -mt-px">
                  <p className="text-[0.8125rem] leading-snug text-ink">
                    {ev.summary}
                  </p>
                  <p className="text-[0.6875rem] text-ink-3">
                    {actorLabelText(ev.actor, ev.actorLabel)}
                    <span className="mx-1" aria-hidden="true">
                      ·
                    </span>
                    {formatRelativeEs(ev.createdAt)}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
