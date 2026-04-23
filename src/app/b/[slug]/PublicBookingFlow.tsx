'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calendar, ChevronLeft, Check, Loader2 } from 'lucide-react'

// -----------------------------------------------------------------------------
// PublicBookingFlow — booking funnel rendered inside the public page.
//
// Steps (standard Booksy/Treatwell funnel):
//   1. Pick service
//   2. Pick barber (or "Cualquiera disponible")
//   3. Pick date (next N days)
//   4. Pick slot (comes from /api/public/availability)
//   5. Form: name + phone + optional email
//   6. Confirm → POST /api/public/bookings/create → success screen
//
// Uses the same `createBooking` pipeline as the bot (server-side),
// so scheduling standards (lead time, horizon, buffer, per-barber hours,
// "sin preferencia" resolver) are enforced identically.
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

type Step = 'service' | 'barber' | 'date' | 'slot' | 'details' | 'success' | 'error'

interface SlotRow {
  start: string
  end: string
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

function formatDayLabel(iso: string): { day: string; weekday: string } {
  const d = new Date(`${iso}T00:00:00Z`)
  const weekday = d.toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' })
  const day = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return { day, weekday }
}

export default function PublicBookingFlow({ slug, brand, services, barbers }: Props) {
  const [step, setStep] = useState<Step>('service')
  const [service, setService] = useState<Service | null>(null)
  const [barberId, setBarberId] = useState<string | null>(null) // null = cualquiera
  const [date, setDate] = useState<string | null>(null)
  const [slot, setSlot] = useState<string | null>(null)
  const [slots, setSlots] = useState<SlotRow[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<null | {
    date: string
    time: string
    service: string
    barber: string | null
  }>(null)

  const next14Days = useMemo(() => {
    const t = todayMadrid()
    const out: string[] = []
    for (let i = 0; i < 14; i++) out.push(addDaysISO(t, i))
    return out
  }, [])

  // Fetch slots whenever service + date are chosen.
  useEffect(() => {
    if (!service || !date) return
    setSlotsLoading(true)
    setError(null)
    fetch(`/api/public/availability?slug=${encodeURIComponent(slug)}&service=${encodeURIComponent(service.name)}&date=${date}${barberId ? `&barberId=${barberId}` : ''}`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Error cargando horarios')
        return d
      })
      .then((d: { slots: SlotRow[] }) => {
        setSlots(Array.isArray(d.slots) ? d.slots : [])
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Error')
        setSlots([])
      })
      .finally(() => setSlotsLoading(false))
  }, [slug, service, date, barberId])

  const reset = () => {
    setStep('service')
    setService(null)
    setBarberId(null)
    setDate(null)
    setSlot(null)
    setSlots([])
    setName('')
    setPhone('')
    setEmail('')
    setNotes('')
    setError(null)
    setConfirmation(null)
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
          customerEmail: email.trim() || undefined,
          notes: notes.trim() || undefined,
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
      setStep('success')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setSubmitting(false)
    }
  }

  const brandStyle = { backgroundColor: brand, color: 'white' } as const

  // ── Success state ────────────────────────────────────────────────────────
  if (step === 'success' && confirmation) {
    return (
      <div className="text-center py-4">
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
        Esta barbería aún no ha configurado sus servicios. Inténtalo más tarde o contáctales por WhatsApp.
      </p>
    )
  }

  return (
    <div>
      {/* Breadcrumb back */}
      {step !== 'service' && (
        <button
          type="button"
          onClick={() => {
            if (step === 'barber') setStep('service')
            else if (step === 'date') setStep(barbers.length > 1 ? 'barber' : 'service')
            else if (step === 'slot') setStep('date')
            else if (step === 'details') setStep('slot')
          }}
          className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
        >
          <ChevronLeft className="h-4 w-4" />
          Atrás
        </button>
      )}

      {/* Step 1: service */}
      {step === 'service' && (
        <div className="space-y-2">
          <p className="text-sm text-[var(--color-ink-2)] mb-3">¿Qué servicio quieres?</p>
          {services.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => {
                setService(s)
                setStep(barbers.length > 1 ? 'barber' : 'date')
              }}
              className="w-full text-left px-4 py-3 rounded-xl border border-[var(--color-line)] hover:border-[var(--brand)] flex items-center justify-between gap-3 transition-colors"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{s.name}</p>
                <p className="text-xs text-[var(--color-ink-3)]">{s.duration} min</p>
              </div>
              <span className="font-mono text-sm shrink-0">{formatEuros(s.price)} €</span>
            </button>
          ))}
        </div>
      )}

      {/* Step 2: barber */}
      {step === 'barber' && (
        <div className="space-y-2">
          <p className="text-sm text-[var(--color-ink-2)] mb-3">¿Con quién?</p>
          <button
            type="button"
            onClick={() => {
              setBarberId(null)
              setStep('date')
            }}
            className="w-full text-left px-4 py-3 rounded-xl border border-[var(--color-line)] hover:border-[var(--brand)] flex items-center gap-3 transition-colors"
          >
            <div className="h-10 w-10 rounded-full bg-[var(--color-overlay)] flex items-center justify-center text-xs text-[var(--color-ink-2)]">?</div>
            <div>
              <p className="font-medium">Cualquiera disponible</p>
              <p className="text-xs text-[var(--color-ink-3)]">Te asignamos al primer barbero libre.</p>
            </div>
          </button>
          {barbers.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                setBarberId(b.id)
                setStep('date')
              }}
              className="w-full text-left px-4 py-3 rounded-xl border border-[var(--color-line)] hover:border-[var(--brand)] flex items-center gap-3 transition-colors"
            >
              <div className="h-10 w-10 rounded-full bg-[var(--color-overlay)] overflow-hidden flex items-center justify-center text-xs text-[var(--color-ink-2)]">
                {b.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.photoUrl} alt={b.name} className="h-full w-full object-cover" />
                ) : (
                  b.name.slice(0, 1).toUpperCase()
                )}
              </div>
              <p className="font-medium">{b.name}</p>
            </button>
          ))}
        </div>
      )}

      {/* Step 3: date */}
      {step === 'date' && (
        <div>
          <p className="text-sm text-[var(--color-ink-2)] mb-3 flex items-center gap-1.5">
            <Calendar className="h-4 w-4" /> Elige día
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {next14Days.map((d) => {
              const { day, weekday } = formatDayLabel(d)
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setDate(d)
                    setStep('slot')
                  }}
                  className="flex flex-col items-center px-2 py-3 rounded-xl border border-[var(--color-line)] hover:border-[var(--brand)] transition-colors"
                >
                  <span className="text-[10px] uppercase tracking-wide text-[var(--color-ink-3)]">{weekday}</span>
                  <span className="text-sm font-semibold mt-0.5">{day}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Step 4: slot */}
      {step === 'slot' && (
        <div>
          <p className="text-sm text-[var(--color-ink-2)] mb-3">Horas disponibles</p>
          {slotsLoading ? (
            <div className="py-6 text-center text-sm text-[var(--color-ink-3)] inline-flex items-center gap-1.5">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : slots.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-3)] py-4">
              No hay huecos para este día. Prueba otra fecha.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {slots.map((s) => (
                <button
                  key={s.start}
                  type="button"
                  onClick={() => {
                    setSlot(s.start)
                    setStep('details')
                  }}
                  className="px-3 py-2 rounded-lg border border-[var(--color-line)] hover:border-[var(--brand)] text-sm font-medium transition-colors"
                >
                  {s.start}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 5: details */}
      {step === 'details' && service && date && slot && (
        <div className="space-y-4">
          <div className="rounded-xl bg-[var(--color-overlay)] border border-[var(--color-line)] p-3 text-sm">
            <p><strong>{service.name}</strong> · {service.duration} min · {formatEuros(service.price)} €</p>
            <p className="text-[var(--color-ink-2)] mt-0.5">
              {date} · {slot}{barberId ? ` · ${barbers.find((b) => b.id === barberId)?.name}` : ' · Cualquiera disponible'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[var(--color-ink-2)]">Nombre *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
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
                placeholder="+34 600 123 456"
                className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-lg p-3 text-sm outline-none focus:border-[var(--brand)]"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--color-ink-2)]">Email (opcional)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-lg p-3 text-sm outline-none focus:border-[var(--brand)]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--color-ink-2)]">Comentario (opcional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-lg p-3 text-sm outline-none focus:border-[var(--brand)] resize-none"
            />
          </div>

          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={submitting || !name.trim() || !phone.trim()}
            className="w-full rounded-xl px-6 py-3 text-base font-semibold transition-transform active:scale-[0.99] disabled:opacity-60"
            style={brandStyle}
          >
            {submitting ? 'Reservando…' : 'Confirmar reserva'}
          </button>

          <p className="text-[11px] text-[var(--color-ink-3)] text-center">
            Al confirmar aceptas la{' '}
            <a href="/privacidad" className="underline" target="_blank" rel="noopener noreferrer">
              política de privacidad
            </a>
            .
          </p>
        </div>
      )}
    </div>
  )
}
