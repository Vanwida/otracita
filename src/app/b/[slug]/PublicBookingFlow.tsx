'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Loader2 } from 'lucide-react'

// -----------------------------------------------------------------------------
// PublicBookingFlow — single-screen mini booking UI (Booksy-style).
//
// Everything is visible on one screen. As the user changes selections,
// the rest updates live:
//   · Pick service → barber circles + date chips + slot grid appear
//   · Change date → barber circles that have no slots that day are
//     greyed out. If the currently selected barber loses availability,
//     we auto-clear the selection.
//   · Pick barber → the slot grid narrows to that barber's slots.
//     "Cualquiera" shows the union (any barber free).
//   · Pick slot → form for name + phone appears.
// -----------------------------------------------------------------------------

interface Service {
  name: string
  duration: number
  price: number
}

interface Barber {
  id: string
  name: string
  photoUrl: string | null
}

interface Props {
  slug: string
  brand: string
  services: Service[]
  barbers: Barber[]
}

interface Slot {
  start: string
  end: string
}

interface GridResponse {
  union: Slot[]
  byBarber: Record<string, Slot[]>
}

function formatEuros(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

function todayMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDayLabel(iso: string): { day: string; weekday: string; isToday: boolean } {
  const d = new Date(`${iso}T00:00:00Z`)
  const weekday = d.toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' })
  const day = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const isToday = iso === todayMadrid()
  return { day, weekday, isToday }
}

export default function PublicBookingFlow({ slug, brand, services, barbers }: Props) {
  const [service, setService] = useState<Service | null>(services[0] ?? null)
  const [date, setDate] = useState<string>(todayMadrid())
  const [barberId, setBarberId] = useState<string | null>(null) // null = cualquiera
  const [slot, setSlot] = useState<string | null>(null)
  const [grid, setGrid] = useState<GridResponse | null>(null)
  const [gridLoading, setGridLoading] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [prefilled, setPrefilled] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<null | {
    date: string
    time: string
    service: string
    barber: string | null
  }>(null)

  // Build the next 14 days once.
  const next14Days = useMemo(() => {
    const out: string[] = []
    for (let i = 0; i < 14; i++) out.push(addDaysISO(todayMadrid(), i))
    return out
  }, [])

  // Prefill name + phone from the PWA session if the customer is logged in.
  // Only runs once per mount; manual edits after prefill aren't overwritten.
  useEffect(() => {
    if (prefilled) return
    fetch('/api/app/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { loggedIn: boolean; user?: { name: string | null; phone: string } }) => {
        if (d.loggedIn && d.user) {
          if (d.user.name) setName((prev) => prev || d.user!.name || '')
          if (d.user.phone) setPhone((prev) => prev || d.user!.phone || '')
        }
        setPrefilled(true)
      })
      .catch(() => setPrefilled(true))
  }, [prefilled])

  // Fetch availability grid whenever (service, date) changes.
  useEffect(() => {
    if (!service || !date) return
    setGridLoading(true)
    setError(null)
    setSlot(null)
    fetch(`/api/public/availability/grid?slug=${encodeURIComponent(slug)}&service=${encodeURIComponent(service.name)}&date=${date}`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Error cargando disponibilidad')
        return d as GridResponse
      })
      .then((g) => {
        setGrid(g)
        // If the selected barber has no slots that day, clear selection so
        // the user isn't stuck on a greyed-out circle.
        if (barberId && (g.byBarber[barberId] ?? []).length === 0) {
          setBarberId(null)
        }
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Error')
        setGrid(null)
      })
      .finally(() => setGridLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, service?.name, date])

  const visibleSlots: Slot[] = useMemo(() => {
    if (!grid) return []
    return barberId ? grid.byBarber[barberId] ?? [] : grid.union
  }, [grid, barberId])

  const barberAvailable = (id: string): boolean => {
    if (!grid) return true
    return (grid.byBarber[id] ?? []).length > 0
  }

  const submit = async () => {
    if (!service || !date || !slot) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/public/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          service: service.name,
          date,
          time: slot,
          barberId,
          customerName: name.trim(),
          customerPhone: phone.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'No se pudo completar la reserva')
        setSubmitting(false)
        return
      }
      setConfirmation({
        date,
        time: slot,
        service: service.name,
        barber: data.barber || null,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setService(services[0] ?? null)
    setDate(todayMadrid())
    setBarberId(null)
    setSlot(null)
    setName('')
    setPhone('')
    setError(null)
    setConfirmation(null)
  }

  // ── Success state ────────────────────────────────────────────────────────
  if (confirmation) {
    return (
      <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-line)] p-8 text-center">
        <div
          className="mx-auto mb-4 h-14 w-14 rounded-full flex items-center justify-center"
          style={{ backgroundColor: brand, color: 'white' }}
        >
          <Check className="h-7 w-7" strokeWidth={3} />
        </div>
        <h3 className="font-display text-xl font-semibold">¡Cita reservada!</h3>
        <p className="text-sm text-[var(--color-ink-2)] mt-1">
          Te esperamos el <strong>{confirmation.date}</strong> a las <strong>{confirmation.time}</strong>
          {confirmation.barber ? ` con ${confirmation.barber}` : ''}.
        </p>
        <p className="text-xs text-[var(--color-ink-3)] mt-2">
          Recibirás recordatorio por WhatsApp el día antes.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 text-sm underline text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
        >
          Hacer otra reserva
        </button>
      </div>
    )
  }

  if (services.length === 0) {
    return (
      <p className="text-sm text-[var(--color-ink-2)]">
        Esta barbería aún no ha configurado sus servicios.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Servicio ─────────────────────────────────────────────────── */}
      <section>
        <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)] mb-2">
          Servicio
        </label>
        <div className="relative">
          <select
            value={service?.name ?? ''}
            onChange={(e) => {
              const next = services.find((s) => s.name === e.target.value) ?? null
              setService(next)
            }}
            className="w-full appearance-none bg-[var(--color-surface)] border border-[var(--color-line)] rounded-xl px-4 py-3 pr-10 text-base font-medium focus:border-[var(--brand)] outline-none"
          >
            {services.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} · {s.duration} min · {formatEuros(s.price)} €
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-ink-3)] pointer-events-none" />
        </div>
      </section>

      {/* ── Barbero (círculos) ───────────────────────────────────────── */}
      {barbers.length > 1 && (
        <section>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)] mb-3">
            Con quién
          </label>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
            {/* "Cualquiera" */}
            <button
              type="button"
              onClick={() => setBarberId(null)}
              className={`shrink-0 flex flex-col items-center gap-1.5 transition-opacity ${
                barberId === null ? '' : 'opacity-70 hover:opacity-100'
              }`}
              aria-pressed={barberId === null}
            >
              <div
                className={`h-16 w-16 rounded-full flex items-center justify-center text-lg font-display border-2 transition-colors`}
                style={{
                  borderColor: barberId === null ? brand : 'var(--color-line)',
                  background: 'var(--color-overlay)',
                  color: 'var(--color-ink-2)',
                }}
              >
                ?
              </div>
              <span className="text-[11px] text-[var(--color-ink-2)] font-medium">Cualquiera</span>
            </button>

            {barbers.map((b) => {
              const available = barberAvailable(b.id)
              const selected = barberId === b.id
              return (
                <button
                  key={b.id}
                  type="button"
                  disabled={!available}
                  onClick={() => setBarberId(b.id)}
                  title={available ? b.name : `${b.name} · sin huecos este día`}
                  className={`shrink-0 flex flex-col items-center gap-1.5 transition-opacity ${
                    !available ? 'opacity-30 cursor-not-allowed' : selected ? '' : 'opacity-70 hover:opacity-100'
                  }`}
                  aria-pressed={selected}
                >
                  <div
                    className="h-16 w-16 rounded-full overflow-hidden flex items-center justify-center text-lg font-display border-2 transition-colors"
                    style={{
                      borderColor: selected ? brand : 'var(--color-line)',
                      background: 'var(--color-overlay)',
                      color: 'var(--color-ink-2)',
                    }}
                  >
                    {b.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.photoUrl} alt={b.name} className="h-full w-full object-cover" />
                    ) : (
                      b.name.slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <span className="text-[11px] text-[var(--color-ink-2)] font-medium max-w-[72px] truncate">
                    {b.name}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Fecha ────────────────────────────────────────────────────── */}
      <section>
        <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)] mb-3">
          Día
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {next14Days.map((d) => {
            const { day, weekday, isToday } = formatDayLabel(d)
            const selected = d === date
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDate(d)}
                className="shrink-0 flex flex-col items-center px-3 py-2.5 rounded-xl border-2 min-w-[60px] transition-colors"
                style={{
                  borderColor: selected ? brand : 'var(--color-line)',
                  background: selected ? 'var(--color-surface)' : 'transparent',
                }}
                aria-pressed={selected}
              >
                <span
                  className="text-[10px] uppercase tracking-wide font-semibold"
                  style={{ color: selected ? brand : 'var(--color-ink-3)' }}
                >
                  {isToday ? 'Hoy' : weekday}
                </span>
                <span className="text-sm font-semibold mt-0.5 text-[var(--color-ink)]">{day}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Hora ─────────────────────────────────────────────────────── */}
      <section>
        <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)] mb-3">
          Hora
        </label>
        {gridLoading ? (
          <div className="py-6 text-center text-sm text-[var(--color-ink-3)] inline-flex items-center gap-1.5 w-full justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando huecos…
          </div>
        ) : visibleSlots.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-3)] py-4">
            No hay huecos{barberId ? ` con ${barbers.find((b) => b.id === barberId)?.name}` : ''} este día. Prueba
            otra fecha{barberId ? ' u otro barbero' : ''}.
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {visibleSlots.map((s) => {
              const selected = s.start === slot
              return (
                <button
                  key={s.start}
                  type="button"
                  onClick={() => setSlot(s.start)}
                  className="px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors"
                  style={{
                    borderColor: selected ? brand : 'var(--color-line)',
                    background: selected ? brand : 'var(--color-surface)',
                    color: selected ? 'white' : 'var(--color-ink)',
                  }}
                  aria-pressed={selected}
                >
                  {s.start}
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Datos + confirmar ────────────────────────────────────────── */}
      {slot && (
        <section className="space-y-3 pt-4 border-t border-[var(--color-line)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--color-ink-2)]">Tu nombre *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-lg p-3 text-sm outline-none focus:border-[var(--brand)]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--color-ink-2)]">WhatsApp *</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoComplete="tel"
                placeholder="+34 600 123 456"
                className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-lg p-3 text-sm outline-none focus:border-[var(--brand)]"
              />
            </div>
          </div>

          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={submitting || !name.trim() || !phone.trim()}
            className="w-full rounded-xl px-6 py-3 text-base font-semibold transition-transform active:scale-[0.99] disabled:opacity-60"
            style={{ backgroundColor: brand, color: 'white' }}
          >
            {submitting ? 'Reservando…' : `Reservar ${slot}`}
          </button>

          <p className="text-[11px] text-[var(--color-ink-3)] text-center">
            Al confirmar aceptas la{' '}
            <a href="/privacidad" className="underline" target="_blank" rel="noopener noreferrer">
              política de privacidad
            </a>
            .
          </p>
        </section>
      )}
    </div>
  )
}
