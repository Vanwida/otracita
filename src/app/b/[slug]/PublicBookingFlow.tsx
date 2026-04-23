'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, Scissors, Euro, Clock, ChevronRight, X, Star } from 'lucide-react'

// -----------------------------------------------------------------------------
// PublicBookingFlow — flujo de reserva completo, estilo app.
//
// Secciones (con anchors para el bottom tab bar):
//   #servicios  — 2-3 destacados en filas + "Ver todos" abre bottom sheet
//   #reservar   — barbero, día, hora, datos, CTA docked con total
//
// Tema adaptativo vía CSS vars inyectadas por page.tsx: --brand, --brand-2,
// --brand-soft, --brand-strong, --brand-ink, --theme-*. Los estados
// seleccionados usan brand-strong (más oscuro de los dos colores) para
// bordes legibles sobre cualquier fondo, y brand+brand-ink para rellenos
// con contraste garantizado.
// -----------------------------------------------------------------------------

interface Service {
  name: string
  duration: number
  price: number
  description: string
  featured: boolean
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

const MAX_FEATURED_VISIBLE = 3

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
  // ── Servicios destacados vs todos ───────────────────────────────────────
  // El barbero marca hasta 3 como featured desde el dashboard. Si no marca
  // ninguno, caen los primeros 3 por orden de entrada (fallback seguro).
  const featuredServices = useMemo(() => {
    const flagged = services.filter((s) => s.featured).slice(0, MAX_FEATURED_VISIBLE)
    if (flagged.length > 0) return flagged
    return services.slice(0, MAX_FEATURED_VISIBLE)
  }, [services])

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
  const [showAllServices, setShowAllServices] = useState(false)
  const [confirmation, setConfirmation] = useState<null | {
    date: string
    time: string
    service: string
    barber: string | null
  }>(null)

  const formRef = useRef<HTMLDivElement>(null)

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

  const selectService = (s: Service) => {
    setService(s)
    setShowAllServices(false)
  }

  const canSubmit = !!slot && !!name.trim() && !!phone.trim() && !submitting

  // ── Success state ────────────────────────────────────────────────────────
  if (confirmation) {
    return (
      <section className="mx-auto max-w-3xl px-4 mt-8">
        <div
          className="rounded-3xl p-8 text-center"
          style={{ background: 'var(--theme-surface)', border: '1px solid var(--theme-line)' }}
        >
          <div
            className="mx-auto mb-4 h-16 w-16 rounded-full flex items-center justify-center"
            style={{ background: 'var(--brand)', color: 'var(--brand-ink)' }}
          >
            <Check className="h-8 w-8" strokeWidth={3} />
          </div>
          <h3 className="font-display text-2xl font-bold" style={{ color: 'var(--theme-ink)' }}>
            ¡Cita reservada!
          </h3>
          <p className="text-sm mt-2" style={{ color: 'var(--theme-ink-2)' }}>
            Te esperamos el <strong>{confirmation.date}</strong> a las <strong>{confirmation.time}</strong>
            {confirmation.barber ? ` con ${confirmation.barber}` : ''}.
          </p>
          <p className="text-xs mt-2" style={{ color: 'var(--theme-ink-3)' }}>
            Recibirás recordatorio por WhatsApp el día antes.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 text-sm underline"
            style={{ color: 'var(--theme-ink-2)' }}
          >
            Hacer otra reserva
          </button>
        </div>
      </section>
    )
  }

  if (services.length === 0) {
    return (
      <section className="mx-auto max-w-3xl px-4 mt-8">
        <p className="text-sm" style={{ color: 'var(--theme-ink-2)' }}>
          Esta barbería aún no ha configurado sus servicios.
        </p>
      </section>
    )
  }

  return (
    <>
      {/* ══════ SERVICIOS ══════════════════════════════════════════════ */}
      <section id="servicios" className="mx-auto max-w-3xl px-4 mt-8">
        <SectionHeader
          title="Servicios"
          action={
            services.length > featuredServices.length ? (
              <button
                type="button"
                onClick={() => setShowAllServices(true)}
                className="text-xs font-bold uppercase tracking-widest flex items-center gap-1"
                style={{ color: 'var(--brand-strong)' }}
              >
                Ver todos
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : undefined
          }
        />
        <div className="space-y-2.5">
          {featuredServices.map((s) => (
            <ServiceRow
              key={s.name}
              service={s}
              selected={service?.name === s.name}
              onClick={() => setService(s)}
            />
          ))}
        </div>
      </section>

      {/* ══════ RESERVA ═════════════════════════════════════════════════ */}
      <section id="reservar" ref={formRef} className="mx-auto max-w-3xl px-4 mt-8">
        {barbers.length > 1 && (
          <>
            <SectionHeader title="Elige barbero" />
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-8">
              <BarberCard
                selected={barberId === null}
                onClick={() => setBarberId(null)}
                name="Cualquiera"
                available
              />
              {barbers.map((b) => (
                <BarberCard
                  key={b.id}
                  selected={barberId === b.id}
                  onClick={() => barberAvailable(b.id) && setBarberId(b.id)}
                  name={b.name}
                  photoUrl={b.photoUrl}
                  available={barberAvailable(b.id)}
                />
              ))}
            </div>
          </>
        )}

        <SectionHeader title="Día" />
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 mb-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {next14Days.map((d) => {
            const { day, weekday, month, isToday } = formatDayLabel(d)
            const selected = d === date
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDate(d)}
                className="shrink-0 flex flex-col items-center justify-center px-3 py-2.5 rounded-2xl border-2 min-w-[64px] transition-all active:scale-[0.97]"
                style={{
                  borderColor: selected ? 'var(--brand-strong)' : 'var(--theme-line)',
                  background: selected ? 'var(--brand)' : 'var(--theme-surface)',
                  color: selected ? 'var(--brand-ink)' : 'var(--theme-ink)',
                }}
                aria-pressed={selected}
              >
                <span className="text-[9px] uppercase tracking-widest font-bold opacity-75">
                  {isToday ? 'Hoy' : weekday}
                </span>
                <span className="font-display text-xl font-bold mt-0.5 leading-none">{day}</span>
                <span className="text-[9px] uppercase font-semibold mt-0.5 opacity-60">{month}</span>
              </button>
            )
          })}
        </div>

        <SectionHeader title="Hora" />
        {gridLoading ? (
          <div
            className="py-8 text-center text-sm inline-flex items-center gap-2 w-full justify-center mb-6"
            style={{ color: 'var(--theme-ink-3)' }}
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando huecos…
          </div>
        ) : visibleSlots.length === 0 ? (
          <div
            className="py-6 text-center rounded-2xl border border-dashed mb-6"
            style={{ borderColor: 'var(--theme-line)' }}
          >
            <p className="text-sm" style={{ color: 'var(--theme-ink-2)' }}>
              No hay huecos{barberId ? ' con este barbero' : ''} este día.
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--theme-ink-3)' }}>
              Prueba otra fecha{barberId ? ' u otro barbero' : ''}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-6">
            {visibleSlots.map((s) => {
              const selected = s.start === slot
              return (
                <button
                  key={s.start}
                  type="button"
                  onClick={() => setSlot(s.start)}
                  className="px-3 py-3 rounded-xl border-2 text-base font-semibold transition-all active:scale-[0.97] tabular-nums"
                  style={{
                    borderColor: selected ? 'var(--brand-strong)' : 'var(--theme-line)',
                    background: selected ? 'var(--brand)' : 'var(--theme-surface)',
                    color: selected ? 'var(--brand-ink)' : 'var(--theme-ink)',
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

        {/* Datos del cliente */}
        {slot && (
          <div
            className="rounded-2xl p-4 mt-4 space-y-3"
            style={{
              background: 'var(--theme-surface)',
              border: '1px solid var(--theme-line)',
            }}
          >
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--theme-ink-3)' }}>
              Tus datos
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Tu nombre *"
                value={name}
                onChange={setName}
                autoComplete="name"
                type="text"
              />
              <Input
                label="WhatsApp *"
                value={phone}
                onChange={setPhone}
                autoComplete="tel"
                type="tel"
                placeholder="+34 600 123 456"
              />
            </div>
          </div>
        )}

        {error && (
          <p
            className="text-sm rounded-lg px-3 py-2 mt-3"
            style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#DC2626', border: '1px solid rgba(239, 68, 68, 0.2)' }}
          >
            {error}
          </p>
        )}
      </section>

      {/* ══════ RESUMEN + CTA (anclado antes del bottom tab bar) ═══════ */}
      {service && (
        <section className="mx-auto max-w-3xl px-4 mt-6">
          <div
            className="rounded-2xl p-4 space-y-3"
            style={{
              background: 'var(--theme-surface-elevated)',
              border: '1px solid var(--theme-line)',
              boxShadow: `0 -4px 20px -8px rgba(0,0,0,0.1)`,
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--theme-ink-3)' }}>
                  Resumen
                </p>
                <p className="text-sm font-semibold truncate mt-0.5" style={{ color: 'var(--theme-ink)' }}>
                  {service.name}
                  {slot && ` · ${slot}`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--theme-ink-3)' }}>
                  Total
                </p>
                <p className="font-display text-2xl font-bold" style={{ color: 'var(--brand-strong)' }}>
                  {formatEuros(service.price)}€
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="w-full rounded-xl px-6 py-4 text-base font-bold transition-transform active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: canSubmit
                  ? `linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)`
                  : 'var(--theme-overlay)',
                color: canSubmit ? 'var(--brand-ink)' : 'var(--theme-ink-3)',
                boxShadow: canSubmit ? `0 10px 24px -8px var(--brand-strong)` : undefined,
              }}
            >
              {submitting ? 'Reservando…' : slot ? `Confirmar reserva a las ${slot}` : 'Elige una hora primero'}
            </button>

            <p className="text-[11px] text-center" style={{ color: 'var(--theme-ink-3)' }}>
              Al confirmar aceptas la{' '}
              <a href="/privacidad" className="underline" target="_blank" rel="noopener noreferrer">
                política de privacidad
              </a>
              . Sin pago por adelantado.
            </p>
          </div>
        </section>
      )}

      {/* ══════ BOTTOM SHEET: TODOS LOS SERVICIOS ═══════════════════ */}
      {showAllServices && (
        <ServicesSheet
          services={services}
          selected={service?.name}
          onSelect={selectService}
          onClose={() => setShowAllServices(false)}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="font-display text-xl sm:text-2xl font-bold" style={{ color: 'var(--theme-ink)' }}>
        {title}
      </h2>
      {action}
    </div>
  )
}

function ServiceRow({
  service,
  selected,
  onClick,
}: {
  service: Service
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 transition-all active:scale-[0.99] text-left"
      style={{
        background: selected ? 'var(--brand-soft)' : 'var(--theme-surface)',
        border: `2px solid ${selected ? 'var(--brand-strong)' : 'var(--theme-line)'}`,
        boxShadow: selected ? `0 6px 16px -8px var(--brand-strong)` : undefined,
      }}
      aria-pressed={selected}
    >
      <div
        className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl flex items-center justify-center shrink-0"
        style={{
          background: selected ? 'var(--brand)' : 'var(--theme-overlay)',
          color: selected ? 'var(--brand-ink)' : 'var(--brand-strong)',
        }}
      >
        <Scissors className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm sm:text-base leading-snug" style={{ color: 'var(--theme-ink)' }}>
          {service.name}
          {service.featured && (
            <Star
              className="inline-block h-3 w-3 -mt-1 ml-1.5"
              fill="currentColor"
              style={{ color: 'var(--brand-2)' }}
            />
          )}
        </p>
        <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--theme-ink-3)' }}>
          <Clock className="h-3 w-3" />
          {service.duration} min
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-display text-lg sm:text-xl font-bold" style={{ color: 'var(--brand-strong)' }}>
          {formatEuros(service.price)}€
        </p>
      </div>
      <div
        className="h-5 w-5 rounded-full flex items-center justify-center shrink-0"
        style={{
          border: `2px solid ${selected ? 'var(--brand-strong)' : 'var(--theme-line)'}`,
          background: selected ? 'var(--brand)' : 'transparent',
          color: selected ? 'var(--brand-ink)' : 'transparent',
        }}
      >
        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
      </div>
    </button>
  )
}

function BarberCard({
  selected,
  onClick,
  name,
  photoUrl,
  available,
}: {
  selected: boolean
  onClick: () => void
  name: string
  photoUrl?: string | null
  available: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!available}
      className={`flex flex-col items-center gap-2 transition-all active:scale-[0.97] ${
        !available ? 'opacity-30 cursor-not-allowed' : ''
      }`}
      aria-pressed={selected}
    >
      <div
        className="relative w-full aspect-square rounded-2xl overflow-hidden transition-all"
        style={{
          border: `3px solid ${selected ? 'var(--brand-strong)' : 'transparent'}`,
          background: 'var(--theme-overlay)',
          boxShadow: selected ? `0 8px 20px -8px var(--brand-strong)` : undefined,
        }}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div
            className="h-full w-full flex items-center justify-center font-display text-3xl"
            style={{ color: 'var(--brand-strong)' }}
          >
            {name === 'Cualquiera' ? '✦' : name.slice(0, 1).toUpperCase()}
          </div>
        )}
        {selected && (
          <span
            className="absolute top-2 right-2 h-6 w-6 rounded-full flex items-center justify-center"
            style={{
              background: 'var(--brand)',
              color: 'var(--brand-ink)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        )}
      </div>
      <span
        className="text-xs font-semibold text-center truncate max-w-full"
        style={{
          color: selected ? 'var(--brand-strong)' : 'var(--theme-ink-2)',
        }}
      >
        {name}
      </span>
    </button>
  )
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoComplete?: string
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium" style={{ color: 'var(--theme-ink-2)' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        className="rounded-lg px-3 py-3 text-sm outline-none transition-colors"
        style={{
          background: 'var(--theme-surface-elevated)',
          border: '1px solid var(--theme-line)',
          color: 'var(--theme-ink)',
        }}
      />
    </div>
  )
}

// Bottom sheet con la lista completa de servicios + descripción.
function ServicesSheet({
  services,
  selected,
  onSelect,
  onClose,
}: {
  services: Service[]
  selected?: string
  onSelect: (s: Service) => void
  onClose: () => void
}) {
  // Bloquear scroll del body.
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="absolute bottom-0 inset-x-0 rounded-t-3xl max-h-[85vh] flex flex-col"
        style={{
          background: 'var(--theme-surface)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3">
          <div
            className="h-1 w-10 rounded-full"
            style={{ background: 'var(--theme-line)' }}
          />
        </div>

        <div className="flex items-center justify-between px-5 py-3">
          <h3 className="font-display text-xl font-bold" style={{ color: 'var(--theme-ink)' }}>
            Todos los servicios
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="h-9 w-9 rounded-full flex items-center justify-center"
            style={{ background: 'var(--theme-overlay)', color: 'var(--theme-ink-2)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-6 space-y-2.5">
          {services.map((s) => {
            const isSelected = selected === s.name
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => onSelect(s)}
                className="w-full rounded-2xl p-4 flex flex-col gap-2 transition-all active:scale-[0.99] text-left"
                style={{
                  background: isSelected ? 'var(--brand-soft)' : 'var(--theme-surface-elevated)',
                  border: `2px solid ${isSelected ? 'var(--brand-strong)' : 'var(--theme-line)'}`,
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: isSelected ? 'var(--brand)' : 'var(--theme-overlay)',
                      color: isSelected ? 'var(--brand-ink)' : 'var(--brand-strong)',
                    }}
                  >
                    <Scissors className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold" style={{ color: 'var(--theme-ink)' }}>
                      {s.name}
                    </p>
                    <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--theme-ink-3)' }}>
                      <Clock className="h-3 w-3" />
                      {s.duration} min
                    </p>
                  </div>
                  <p className="font-display text-lg font-bold shrink-0" style={{ color: 'var(--brand-strong)' }}>
                    {formatEuros(s.price)}
                    <Euro className="inline h-4 w-4 -mt-1" />
                  </p>
                </div>
                {s.description && (
                  <p
                    className="text-xs leading-relaxed pl-[52px]"
                    style={{ color: 'var(--theme-ink-2)' }}
                  >
                    {s.description}
                  </p>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
