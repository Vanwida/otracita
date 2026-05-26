'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Trash2, Send, Clock, User } from 'lucide-react'

// -----------------------------------------------------------------------------
// WaitlistManager — vista del dashboard para gestionar la lista de espera
// (#88).
//
// El flujo automático (cliente apuntado → cita cancelada → aviso) es
// invisible para el barbero, pero aquí puede:
//   · Ver quién está esperando hoy/mañana y por qué hora/barbero.
//   · Notificar manualmente (caso template-cerrada).
//   · Borrar entradas obsoletas.
//
// Fetch via GET /api/waitlist (tenant-scoped). Mutaciones con DELETE
// /api/waitlist/[id] y POST /api/waitlist/[id]/notify.
// -----------------------------------------------------------------------------

interface Entry {
  id: string
  customerPhone: string
  customerName: string | null
  date: string
  time: string | null
  desiredTimeStart: string | null
  desiredTimeEnd: string | null
  service: string | null
  barberId: string | null
  barberLegacyName: string | null
  barberName: string | null
  status: 'waiting' | 'notified'
  notifiedAt: string | null
  expiresAt: string | null
  createdAt: string
}

interface ApiResponse {
  entries: Entry[]
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00+02:00`)
  return d.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Madrid',
  })
}

function formatPhoneShort(raw: string): string {
  // +34 600 123 456 → 600 123 456
  return raw.replace(/^\+?34/, '').replace(/\s+/g, ' ').trim() || raw
}

export default function WaitlistManager() {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const refresh = async () => {
    try {
      const r = await fetch('/api/waitlist', { cache: 'no-store' })
      const data: ApiResponse = await r.json()
      if (!r.ok) throw new Error('Error cargando')
      setEntries(data.entries)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const grouped = useMemo(() => {
    if (!entries) return []
    const map = new Map<string, Entry[]>()
    for (const e of entries) {
      const list = map.get(e.date) ?? []
      list.push(e)
      map.set(e.date, list)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [entries])

  const cancelEntry = async (id: string) => {
    setBusyId(id)
    setActionMsg(null)
    try {
      const r = await fetch(`/api/waitlist/${id}`, { method: 'DELETE' })
      if (!r.ok) {
        const data = await r.json().catch(() => ({}))
        throw new Error(data?.error || 'No se pudo borrar')
      }
      await refresh()
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  const notifyEntry = async (id: string) => {
    setBusyId(id)
    setActionMsg(null)
    try {
      const r = await fetch(`/api/waitlist/${id}/notify`, { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error || 'No se pudo notificar')
      // Mensaje según canal o motivo.
      if (data.ok && data.channel === 'push') setActionMsg('Aviso enviado por push')
      else if (data.ok && data.channel === 'whatsapp') setActionMsg('Aviso enviado por WhatsApp')
      else if (data.reason === 'whatsapp_template_required')
        setActionMsg(
          'Ventana de WhatsApp cerrada y sin PWA. Llama al cliente o espera a que escriba primero.',
        )
      else if (data.reason === 'too_late') setActionMsg('Demasiado tarde para avisar a este slot')
      else if (data.reason === 'already_notified')
        setActionMsg('Ya hay un aviso pendiente para ese día — espera a la respuesta')
      else setActionMsg('Aviso procesado')
      await refresh()
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusyId(null)
    }
  }

  if (entries === null) {
    return (
      <div className="flex items-center justify-center py-16 text-ink-3">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="rounded-2xl p-4 text-sm"
        style={{ background: 'var(--color-surface)', color: 'var(--color-ink-2)' }}
      >
        {error}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-ink-2 font-medium">No hay nadie en lista de espera ahora mismo.</p>
        <p className="text-ink-3 text-sm mt-2 max-w-md mx-auto">
          Cuando alguien pulse «avísame si se libera» en tu página de reservas,
          aparecerá aquí. Si después cancelas una cita que case con su petición,
          le avisamos automáticamente por push o WhatsApp.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">Lista de espera</h1>
        <p className="text-sm text-ink-2 mt-1">
          Clientes esperando un hueco. Al cancelar una cita, avisamos automáticamente
          al primero en orden de llegada — push si tiene la app, WhatsApp si no
          (siempre que la ventana de 24h esté abierta).
        </p>
      </header>

      {actionMsg && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            background: 'var(--color-brand-soft, var(--color-surface))',
            color: 'var(--color-ink)',
            border: '1px solid var(--color-line)',
          }}
        >
          {actionMsg}
        </div>
      )}

      {grouped.map(([date, list]) => (
        <section key={date} className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-ink-3">
            {formatDate(date)}
            <span className="ml-2 text-ink-3 lowercase font-medium">
              · {list.length} {list.length === 1 ? 'persona' : 'personas'}
            </span>
          </h2>

          <ul className="space-y-2">
            {list.map((e) => {
              const barber = e.barberName || e.barberLegacyName
              const timeLabel =
                e.desiredTimeStart && e.desiredTimeEnd && e.desiredTimeStart !== e.desiredTimeEnd
                  ? `${e.desiredTimeStart} – ${e.desiredTimeEnd}`
                  : e.time || 'cualquier hora'
              const isNotified = e.status === 'notified'
              return (
                <li
                  key={e.id}
                  className="rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-line)',
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-ink-3" strokeWidth={2.5} />
                      {e.customerName || 'Sin nombre'}
                      <span className="text-ink-3 font-normal text-sm">
                        · {formatPhoneShort(e.customerPhone)}
                      </span>
                    </p>
                    <p className="text-sm text-ink-2 mt-1 flex items-center gap-2 flex-wrap">
                      <Clock className="h-3.5 w-3.5 text-ink-3" strokeWidth={2.5} />
                      {timeLabel}
                      {barber && (
                        <>
                          <span className="text-ink-3">·</span>
                          con {barber}
                        </>
                      )}
                      {e.service && (
                        <>
                          <span className="text-ink-3">·</span>
                          {e.service}
                        </>
                      )}
                    </p>
                    {isNotified && (
                      <p className="text-xs text-ink-3 mt-1 italic">
                        Aviso enviado, esperando respuesta.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => notifyEntry(e.id)}
                      disabled={busyId === e.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
                      style={{
                        background: 'var(--color-brand)',
                        color: 'var(--color-brand-ink, white)',
                      }}
                      title="Volver a intentar el aviso"
                    >
                      {busyId === e.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Send className="h-3 w-3" strokeWidth={2.5} />
                      )}
                      Avisar
                    </button>

                    <button
                      type="button"
                      onClick={() => cancelEntry(e.id)}
                      disabled={busyId === e.id}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-full text-ink-3 hover:text-ink hover:bg-overlay transition-colors disabled:opacity-50"
                      title="Borrar de la lista"
                      aria-label="Borrar"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
