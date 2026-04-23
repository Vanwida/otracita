'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Euro } from 'lucide-react'

// -----------------------------------------------------------------------------
// PublicBookingFlow — mini flujo de reserva en una sola pantalla.
//
// Todo usa CSS vars inyectadas por page.tsx (--brand, --brand-2,
// --brand-soft, --brand-strong, --brand-ink). Ninguna inline-style
// recomputa colores — la paleta vive arriba.
//
// Estados de selección usan `brand-strong` para bordes/rings (el más
// oscuro de los dos colores de la barbería → siempre legible sobre
// blanco) y `brand` + `brand-ink` para rellenos (el ink auto se elige
// negro o blanco según luminancia).
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

function formatDayLabel(iso: string): { day: string; weekday: string; month: string; isToday: boolean } {
  const d = new Date(`${iso}T00:00:00Z`)
  const weekday = d.toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' }).replace('.', '')
  const day = d.toLocaleDateString('es-ES', { day: 'numeric', timeZone: 'UTC' })
  const month = d.toLocaleDateString('es-ES', { month: 'short', timeZone: 'UTC' }).replace('.', '')
  const isToday = iso === todayMadrid()
  return { day, weekday, month, isToday }
}

export default function PublicBookingFlow({ slug, services, barbers }: Props) {
  const [service, setService] = useState<Service | null>(services[0] ?? null)
  const [date, setDate] = useState<string>(todayMadrid())
  const [barberId, setBarberId] = useState<string | null>(null)
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

  const next14Days = useMemo(() => {
    const out: string[] = []
    for (let i = 0; i < 14; i++) out.push(addDaysISO(todayMadrid(), i))
    return out
  }, [])

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
      <div className="text-center py-6">
        <div
          className="mx-auto mb-4 h-16 w-16 rounded-full flex items-center justify-center relative"
          style={{ backgroundColor: 'var(--brand)', color: 'var(--brand-ink)' }}
        >
          <Check className="h-8 w-8" strokeWidth={3} />
          <span
            className="absolute -inset-2 rounded-full -z-10"
            style={{ background: 'var(--brand-2-soft)' }}
          />
        </div>
        <h3 className="font-display text-2xl font-bold text-[var(--color-ink)]">¡Cita reservada!</h3>
        <p className="text-sm text-[var(--color-ink-2)] mt-2">
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
    <div className="space-y-7">
      {/* ═══ 1 · SERVICIO ═══════════════════════════════════════════════ */}
      <section>
        <StepLabel n={1} label="Servicio" />
        <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {services.map((s) => {
            const selected = service?.name === s.name
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => setService(s)}
                className="shrink-0 rounded-xl border-2 p-3.5 text-left min-w-[165px] max-w-[220px] transition-all active:scale-[0.98]"
                style={{
                  borderColor: selected ? 'var(--brand-strong)' : 'var(--color-line)',
                  background: selected ? 'var(--brand-soft)' : 'var(--color-surface)',
                  boxShadow: selected ? `0 6px 16px -8px var(--brand-strong)` : undefined,
                }}
                aria-pressed={selected}
              >
                <div className="text-[13px] font-semibold text-[var(--color-ink)] leading-snug line-clamp-2 min-h-[2.5em]">
                  {s.name}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[var(--color-ink-3)] font-medium">
                    {s.duration} min
                  </span>
                  <span
                    className="font-display text-base font-bold inline-flex items-baseline gap-0.5"
                    style={{ color: selected ? 'var(--brand-strong)' : 'var(--color-ink)' }}
                  >
                    {formatEuros(s.price)}
                    <Euro className="h-3 w-3 -ml-0.5" />
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* ═══ 2 · BARBERO ═══════════════════════════════════════════════ */}
      {barbers.length > 1 && (
        <section>
          <StepLabel n={2} label="Con quién" />
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <BarberCircle
              selected={barberId === null}
              onClick={() => setBarberId(null)}
              name="Cualquiera"
              emoji="✦"
              available
            />
            {barbers.map((b) => (
              <BarberCircle
                key={b.id}
                selected={barberId === b.id}
                onClick={() => barberAvailable(b.id) && setBarberId(b.id)}
                name={b.name}
                photoUrl={b.photoUrl}
                available={barberAvailable(b.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ═══ 3 · DÍA ══════════════════════════════════════════════════ */}
      <section>
        <StepLabel n={barbers.length > 1 ? 3 : 2} label="Día" />
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {next14Days.map((d) => {
            const { day, weekday, month, isToday } = formatDayLabel(d)
            const selected = d === date
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDate(d)}
                className="shrink-0 flex flex-col items-center justify-center px-3 py-2.5 rounded-xl border-2 min-w-[64px] transition-all active:scale-[0.97]"
                style={{
                  borderColor: selected ? 'var(--brand-strong)' : 'var(--color-line)',
                  background: selected ? 'var(--brand)' : 'var(--color-surface)',
                  color: selected ? 'var(--brand-ink)' : 'var(--color-ink)',
                }}
                aria-pressed={selected}
              >
                <span
                  className="text-[9px] uppercase tracking-widest font-bold opacity-75"
                >
                  {isToday ? 'Hoy' : weekday}
                </span>
                <span className="font-display text-xl font-bold mt-0.5 leading-none">
                  {day}
                </span>
                <span className="text-[9px] uppercase font-semibold mt-0.5 opacity-60">
                  {month}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ═══ 4 · HORA ═════════════════════════════════════════════════ */}
      <section>
        <StepLabel n={barbers.length > 1 ? 4 : 3} label="Hora" />
        {gridLoading ? (
          <div className="py-8 text-center text-sm text-[var(--color-ink-3)] inline-flex items-center gap-2 w-full justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando huecos…
          </div>
        ) : visibleSlots.length === 0 ? (
          <div className="py-6 text-center rounded-xl border border-dashed border-[var(--color-line)]">
            <p className="text-sm text-[var(--color-ink-2)]">
              No hay huecos{barberId ? ' con este barbero' : ''} este día.
            </p>
            <p className="text-xs text-[var(--color-ink-3)] mt-1">
              Prueba otra fecha{barberId ? ' u otro barbero' : ''}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {visibleSlots.map((s) => {
              const selected = s.start === slot
              return (
                <button
                  key={s.start}
                  type="button"
                  onClick={() => setSlot(s.start)}
                  className="px-3 py-3 rounded-xl border-2 text-base font-semibold transition-all active:scale-[0.97] tabular-nums"
                  style={{
                    borderColor: selected ? 'var(--brand-strong)' : 'var(--color-line)',
                    background: selected ? 'var(--brand)' : 'var(--color-surface)',
                    color: selected ? 'var(--brand-ink)' : 'var(--color-ink)',
                    boxShadow: selected ? `0 8px 20px -8px var(--brand-strong)` : undefined,
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

      {/* ═══ DATOS + CTA ═══════════════════════════════════════════════ */}
      {slot && (
        <section className="space-y-3 pt-5 border-t border-dashed border-[var(--color-line)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--color-ink-2)]">Tu nombre *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-lg px-3 py-3 text-sm outline-none transition-colors focus:border-[var(--brand-strong)]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--color-ink-2)]">WhatsApp *</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoComplete="tel"
                placeholder="+34 600 123 456"
                className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-lg px-3 py-3 text-sm outline-none transition-colors focus:border-[var(--brand-strong)]"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={submitting || !name.trim() || !phone.trim()}
            className="w-full rounded-xl px-6 py-4 text-base font-bold transition-transform active:scale-[0.98] disabled:opacity-60 shadow-lg"
            style={{
              background: `linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)`,
              color: 'var(--brand-ink)',
              boxShadow: `0 10px 24px -8px var(--brand-strong)`,
            }}
          >
            {submitting ? 'Reservando…' : `Reservar a las ${slot}`}
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

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────────

/** Etiqueta de paso — número en círculo + título en caps. */
function StepLabel({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span
        className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold"
        style={{
          background: 'var(--brand-soft)',
          color: 'var(--brand-strong)',
          border: '1px solid var(--brand-2-soft)',
        }}
      >
        {n}
      </span>
      <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-2)]">
        {label}
      </span>
    </div>
  )
}

function BarberCircle({
  selected,
  onClick,
  name,
  photoUrl,
  emoji,
  available,
}: {
  selected: boolean
  onClick: () => void
  name: string
  photoUrl?: string | null
  emoji?: string
  available: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!available}
      className={`shrink-0 flex flex-col items-center gap-1.5 transition-opacity ${
        !available ? 'opacity-30 cursor-not-allowed' : selected ? '' : 'opacity-80 hover:opacity-100'
      }`}
      aria-pressed={selected}
    >
      <div className="relative">
        <div
          className="h-16 w-16 rounded-full overflow-hidden flex items-center justify-center text-xl font-display transition-all"
          style={{
            background: 'var(--color-overlay)',
            color: 'var(--color-ink-2)',
            border: `3px solid ${selected ? 'var(--brand-strong)' : 'transparent'}`,
            boxShadow: selected
              ? `0 0 0 2px var(--color-surface), 0 6px 14px -6px var(--brand-strong)`
              : '0 1px 3px rgba(0,0,0,0.08)',
          }}
        >
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
          ) : emoji ? (
            <span style={{ color: 'var(--brand-strong)' }}>{emoji}</span>
          ) : (
            name.slice(0, 1).toUpperCase()
          )}
        </div>
        {selected && (
          <span
            className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full flex items-center justify-center"
            style={{
              background: 'var(--brand)',
              color: 'var(--brand-ink)',
              border: '2px solid var(--color-surface)',
            }}
          >
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
      </div>
      <span className="text-[11px] text-[var(--color-ink-2)] font-medium max-w-[72px] truncate">
        {name}
      </span>
    </button>
  )
}
