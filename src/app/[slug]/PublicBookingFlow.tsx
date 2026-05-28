'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, Scissors, Euro, Clock, ChevronRight, X, Star } from 'lucide-react'
import { captureLastTouch, readStoredAttribution } from '@/lib/attribution/capture'
import { barberPhotoUrl } from '@/lib/barber-photo-url'
import NoShowCardModal from './NoShowCardModal'
import { dispatchTracking } from '@/lib/tracking/dispatch'

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

// Fecha legible para la pantalla de confirmación: "jueves, 28 de mayo".
// Capitalizamos el primer carácter (toLocaleDateString devuelve minúscula).
function formatLongDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  const full = d.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
  return full.charAt(0).toUpperCase() + full.slice(1)
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
  const [email, setEmail] = useState('')
  const [prefilled, setPrefilled] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAllServices, setShowAllServices] = useState(false)
  // Consentimiento RGPD para tratamiento de datos. Obligatorio antes de
  // confirmar. Persistimos la aceptación en localStorage para que el
  // usuario que ya aceptó en una reserva previa no tenga que volver a
  // marcarlo (la base legal del tratamiento sigue siendo la misma).
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  // No-show fee: modal de guardado de tarjeta. `card` se rellena tras pedir
  // el SetupIntent al backend; null = el negocio no exige tarjeta (fee=0) o
  // aún no se ha iniciado el paso.
  const [card, setCard] = useState<null | {
    publishableKey: string
    clientSecret: string
    setupIntentId: string
    feeCents: number
  }>(null)
  const [cardLoading, setCardLoading] = useState(false)
  const [confirmation, setConfirmation] = useState<null | {
    date: string
    time: string
    service: string
    barber: string | null
  }>(null)
  // Lista de espera (#88): cuando el día/barbero no tiene huecos, el cliente
  // puede pulsar "avísame si se libera" → POST /api/public/waitlist. Estado
  // local para feedback inmediato (sin recargar la página).
  const [waitlistState, setWaitlistState] = useState<
    'idle' | 'submitting' | 'on_list' | 'error'
  >('idle')
  const [waitlistError, setWaitlistError] = useState<string | null>(null)

  const formRef = useRef<HTMLDivElement>(null)

  const next14Days = useMemo(() => {
    const out: string[] = []
    for (let i = 0; i < 14; i++) out.push(addDaysISO(todayMadrid(), i))
    return out
  }, [])

  // Restaurar consentimiento previo desde localStorage. SSR-safe (corre
  // solo en cliente). Si una versión futura cambia los términos, bumpea
  // la clave (-v2) para forzar re-aceptación.
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      if (window.localStorage.getItem('privacy-accepted-v1') === '1') {
        setPrivacyAccepted(true)
      }
    } catch {
      // localStorage puede fallar en modo privado — ignoramos sin romper.
    }
  }, [])

  // Modo test del dashboard: ?tracking_test=1 dispara un evento de prueba
  // a todos los trackers cargados — el barbero puede verificar desde
  // Marketing → Tracking que sus pixels reciben eventos sin tener que
  // hacer una reserva real. Espera 1s a que los Scripts se carguen.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('tracking_test') !== '1') return
    const t = window.setTimeout(() => {
      dispatchTracking({
        event: 'booking_confirmed',
        valueCents: 2500,
        currency: 'EUR',
        transactionId: `test-${Date.now()}`,
        metadata: { test: true },
      })
    }, 1500)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    if (prefilled) return
    fetch('/api/app/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { loggedIn: boolean; user?: { name: string | null; phone: string; email?: string | null } }) => {
        if (d.loggedIn && d.user) {
          if (d.user.name) setName((prev) => prev || d.user!.name || '')
          if (d.user.phone) setPhone((prev) => prev || d.user!.phone || '')
          if (d.user.email) setEmail((prev) => prev || d.user!.email || '')
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

  // Split por franjas — Booksy-style. Umbral 14:00 (a partir de ahí, tarde).
  // Así cuando ofrecemos muchos slots (paso 15 min = ~40 slots posibles en
  // jornada de 10h) el usuario escanea más rápido.
  const slotsMorning: Slot[] = useMemo(() => visibleSlots.filter((s) => s.start < '14:00'), [visibleSlots])
  const slotsAfternoon: Slot[] = useMemo(() => visibleSlots.filter((s) => s.start >= '14:00'), [visibleSlots])

  const barberAvailable = (id: string): boolean => {
    if (!grid) return true
    return (grid.byBarber[id] ?? []).length > 0
  }

  // Paso 1 del submit: ¿el negocio exige tarjeta (tarifa no-show)?
  // Preguntamos al backend (única fuente de verdad: clients.no_show_fee_cents).
  //   · required:false  → reservar directo (flujo idéntico al de siempre).
  //   · required:true   → abrir modal de tarjeta; al guardarla con éxito,
  //     completeBooking(setupIntentId) crea la reserva.
  const submit = async () => {
    if (!service || !date || !slot) return
    setError(null)
    setCardLoading(true)
    try {
      const res = await fetch('/api/public/bookings/setup-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          customerPhone: phone.trim(),
          customerName: name.trim(),
          customerEmail: email.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'No se pudo iniciar la reserva')
        setCardLoading(false)
        return
      }
      if (data.required === false) {
        setCardLoading(false)
        await completeBooking()
        return
      }
      // Tarjeta requerida → abrir modal con el SetupIntent.
      setCard({
        publishableKey: data.publishableKey,
        clientSecret: data.clientSecret,
        setupIntentId: data.setupIntentId,
        feeCents: data.feeCents,
      })
      setCardLoading(false)
    } catch {
      setError('Error de red')
      setCardLoading(false)
    }
  }

  // Paso 2: crea la reserva. Si vino de la rama con tarjeta, pasa el
  // setupIntentId confirmado (el backend lo RE-valida contra Stripe).
  const completeBooking = async (setupIntentId?: string) => {
    if (!service || !date || !slot) return
    setSubmitting(true)
    setError(null)

    // Last-touch attribution para ESTA reserva. Si hay first-touch guardado
    // del primer aterrizaje (más fresco que esta visita), usamos last-touch
    // = la sesión actual; el backend lo persiste en bookings.referrer*.
    const attribution = captureLastTouch()
    const firstTouch = readStoredAttribution()

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
          customerEmail: email.trim(),
          // Si NO hay first-touch en storage, mandamos el last-touch como
          // attribution para que el backend lo use también como first-touch
          // (es la PRIMERA visita conocida). Si hay first-touch, lo usamos
          // para que el primer touch de este customer sea el correcto.
          attribution: firstTouch ?? attribution,
          cardConsent: setupIntentId
            ? { setupIntentId, consented: true, source: 'web' as const }
            : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'No se pudo completar la reserva')
        setSubmitting(false)
        // Si el backend rechaza por tarjeta (raro: el modal ya la validó),
        // reabrimos el paso de tarjeta limpiando el SetupIntent gastado.
        if (data.errorCode === 'card_required') setCard(null)
        return
      }

      // Disparar evento de conversión a todos los trackers cargados (GTM,
      // Meta Pixel, Google Ads, TikTok). dispatchTracking es silencioso si
      // el tracker no está cargado. `service.price` está en EUROS — para el
      // helper lo pasamos en céntimos (convención del backend).
      dispatchTracking({
        event: 'booking_confirmed',
        valueCents: Math.round((service.price ?? 0) * 100),
        currency: 'EUR',
        transactionId: data.bookingId,
        metadata: {
          items: [
            {
              item_name: service.name,
              item_category: 'service',
              price: service.price ?? 0,
              quantity: 1,
            },
          ],
        },
      })

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
    setEmail('')
    setError(null)
    setConfirmation(null)
    setWaitlistState('idle')
    setWaitlistError(null)
  }

  // Lista de espera (#88) — el cliente pulsa "avísame si se libera" sobre un
  // día sin huecos. Usamos como `time` una hora pivote (08:00) y como rango
  // todo el día (00:00-23:59) para que cualquier cancelación matche. Cuando
  // el dashboard del barbero quiera más granularidad (hora específica), la
  // UI se ampliará — el endpoint ya acepta desiredTimeStart/End específicos.
  const joinWaitlist = async () => {
    if (!date) return
    const trimmedName = name.trim()
    const trimmedPhone = phone.trim()
    if (!trimmedName || !trimmedPhone) {
      setWaitlistError('Rellena tu nombre y teléfono para apuntarte')
      setWaitlistState('error')
      return
    }
    setWaitlistError(null)
    setWaitlistState('submitting')
    try {
      const res = await fetch('/api/public/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          customerName: trimmedName,
          customerPhone: trimmedPhone,
          date,
          time: '08:00',
          desiredTimeStart: '00:00',
          desiredTimeEnd: '23:59',
          barberId,
          service: service?.name ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setWaitlistError(data.error || 'No se pudo apuntar a la lista de espera')
        setWaitlistState('error')
        return
      }
      setWaitlistState('on_list')
    } catch {
      setWaitlistError('Error de red')
      setWaitlistState('error')
    }
  }

  // Reset estado de waitlist cuando cambia día/barbero — para que el cliente
  // pueda apuntarse a otro día si lo prueba después.
  useEffect(() => {
    setWaitlistState('idle')
    setWaitlistError(null)
  }, [date, barberId])

  const selectService = (s: Service) => {
    setService(s)
    setShowAllServices(false)
  }

  const canSubmit =
    !!slot &&
    !!name.trim() &&
    !!phone.trim() &&
    privacyAccepted &&
    !submitting &&
    !cardLoading

  // Persistimos la aceptación cuando el usuario marca el checkbox: la
  // base legal del tratamiento no cambia entre reservas, así que evitamos
  // re-pedírselo en cada visita.
  const togglePrivacy = (next: boolean) => {
    setPrivacyAccepted(next)
    try {
      if (typeof window === 'undefined') return
      if (next) window.localStorage.setItem('privacy-accepted-v1', '1')
      else window.localStorage.removeItem('privacy-accepted-v1')
    } catch {
      // Sin storage no podemos persistir, pero la sesión actual sigue
      // siendo válida en memoria.
    }
  }

  // ── Success state ────────────────────────────────────────────────────────
  // El backend YA confirmó la reserva cuando montamos esto (completeBooking
  // setea `confirmation` solo tras res.ok). El anillo que se rellena es el
  // "proceso final" visual — nunca mostramos confirmado antes del OK real.
  if (confirmation) {
    return (
      <BookingConfirmation
        date={confirmation.date}
        time={confirmation.time}
        service={confirmation.service}
        barber={confirmation.barber}
        onReset={reset}
      />
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
                  photoUrl={b.photoUrl ? barberPhotoUrl(b.id) : null}
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
            className="py-6 px-4 text-center rounded-2xl border border-dashed mb-6 space-y-3"
            style={{ borderColor: 'var(--theme-line)' }}
          >
            <p className="text-sm" style={{ color: 'var(--theme-ink-2)' }}>
              No hay huecos{barberId ? ' con este barbero' : ''} este día.
            </p>
            <p className="text-xs" style={{ color: 'var(--theme-ink-3)' }}>
              Prueba otra fecha{barberId ? ' u otro barbero' : ''}, o apúntate a la lista de espera.
            </p>
            {waitlistState === 'on_list' ? (
              <p
                className="text-xs font-semibold inline-flex items-center gap-1.5 px-3 py-2 rounded-full"
                style={{ background: 'var(--brand-soft)', color: 'var(--brand-strong)' }}
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                Te avisamos en cuanto se libere
              </p>
            ) : (
              <>
                {(!name.trim() || !phone.trim()) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md mx-auto">
                    <input
                      type="text"
                      placeholder="Tu nombre"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="px-3 py-2 rounded-lg text-sm w-full"
                      style={{
                        background: 'var(--theme-surface)',
                        border: '1px solid var(--theme-line)',
                        color: 'var(--theme-ink)',
                      }}
                      autoComplete="name"
                    />
                    <input
                      type="tel"
                      placeholder="+34 600 123 456"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="px-3 py-2 rounded-lg text-sm w-full"
                      style={{
                        background: 'var(--theme-surface)',
                        border: '1px solid var(--theme-line)',
                        color: 'var(--theme-ink)',
                      }}
                      autoComplete="tel"
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={joinWaitlist}
                  disabled={waitlistState === 'submitting' || !name.trim() || !phone.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: 'var(--brand)',
                    color: 'var(--brand-ink)',
                  }}
                >
                  {waitlistState === 'submitting' ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Apuntando…
                    </>
                  ) : (
                    'Avísame si se libera'
                  )}
                </button>
                {waitlistError && (
                  <p className="text-xs" style={{ color: '#DC2626' }}>
                    {waitlistError}
                  </p>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="mb-6 space-y-5">
            {slotsMorning.length > 0 && (
              <SlotBand title="Mañana" slots={slotsMorning} current={slot} onPick={setSlot} />
            )}
            {slotsAfternoon.length > 0 && (
              <SlotBand title="Tarde" slots={slotsAfternoon} current={slot} onPick={setSlot} />
            )}
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
              <div className="sm:col-span-2">
                <Input
                  label="Email (opcional)"
                  value={email}
                  onChange={setEmail}
                  autoComplete="email"
                  type="email"
                  placeholder="tu@email.com"
                  optional
                />
              </div>
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

            {/* Consentimiento RGPD — obligatorio antes de confirmar.
                Base legal del tratamiento: contrato (reserva) + este
                consentimiento explícito. */}
            <label
              className="flex items-start gap-2.5 cursor-pointer select-none rounded-xl border px-3 py-2.5 transition-colors"
              style={{
                borderColor: privacyAccepted ? 'var(--brand)' : 'var(--theme-line)',
                background: privacyAccepted ? 'var(--brand-soft)' : 'transparent',
              }}
            >
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={(e) => togglePrivacy(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-current"
                style={{ accentColor: 'var(--brand-strong)' }}
                required
                aria-required="true"
              />
              <span className="text-xs leading-snug" style={{ color: 'var(--theme-ink-2)' }}>
                He leído y acepto la{' '}
                <a
                  href="/legal/privacidad"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                  style={{ color: 'var(--brand-strong)' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  política de privacidad
                </a>
                .
              </span>
            </label>

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
              {submitting || cardLoading
                ? 'Reservando…'
                : !slot
                  ? 'Elige una hora primero'
                  : !privacyAccepted
                    ? 'Marca el consentimiento para continuar'
                    : `Confirmar reserva a las ${slot}`}
            </button>

            <p className="text-[11px] text-center" style={{ color: 'var(--theme-ink-3)' }}>
              Sin pago por adelantado.
            </p>
          </div>
        </section>
      )}

      {/* ══════ MODAL: GUARDAR TARJETA (tarifa no-show) ═════════════ */}
      {card && (
        <NoShowCardModal
          publishableKey={card.publishableKey}
          clientSecret={card.clientSecret}
          feeCents={card.feeCents}
          onSaved={(setupIntentId) => {
            setCard(null)
            void completeBooking(setupIntentId)
          }}
          onClose={() => setCard(null)}
        />
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

// Diámetro del anillo (px) y geometría SVG. El stroke se dibuja sobre un
// círculo cuyo radio deja sitio al grosor; la circunferencia se inyecta como
// var CSS (--ring-circ) para que el keyframe ring-fill arranque vacío.
const RING_SIZE = 112
const RING_STROKE = 8
const RING_R = (RING_SIZE - RING_STROKE) / 2
const RING_CIRC = 2 * Math.PI * RING_R
// El check entra cuando el anillo termina de rellenarse (~750ms). Damos un
// pelín de margen para que el pop solape el final del relleno.
const RING_FILL_MS = 750

function BookingConfirmation({
  date,
  time,
  service,
  barber,
  onReset,
}: {
  date: string
  time: string
  service: string
  barber: string | null
  onReset: () => void
}) {
  // Fases: 'filling' (anillo rellenándose) → 'done' (check + texto).
  // Con prefers-reduced-motion arrancamos ya en 'done' (sin relleno) usando
  // el inicializador lazy de useState — así evitamos un setState síncrono en
  // el effect. Esta pantalla solo se monta tras la interacción del cliente
  // (nunca en SSR real), así que matchMedia está disponible al inicializar.
  const [phase, setPhase] = useState<'filling' | 'done'>(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    return prefersReduced ? 'done' : 'filling'
  })

  useEffect(() => {
    // Solo programamos el paso a 'done' si arrancamos rellenando. En
    // reduced-motion ya estamos en 'done' desde el inicializador.
    if (phase !== 'filling') return
    const t = window.setTimeout(() => setPhase('done'), RING_FILL_MS)
    return () => window.clearTimeout(t)
    // Solo al montar: el timer dispara el cambio de fase una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ringDone = phase === 'done'

  return (
    <section className="mx-auto max-w-3xl px-4 mt-8">
      <div
        className="rounded-3xl p-8 text-center"
        style={{ background: 'var(--theme-surface)', border: '1px solid var(--theme-line)' }}
        role="status"
        aria-live="polite"
      >
        {/* Anillo de progreso + check. Verde de éxito (--color-success): es el
            microestado universal de "confirmado", no superficie de marca del
            barbero, así que no rompe el white-label. */}
        <div
          className="relative mx-auto mb-5"
          style={{ width: RING_SIZE, height: RING_SIZE }}
        >
          <svg
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            className="-rotate-90"
            aria-hidden="true"
          >
            {/* Track tenue del anillo. */}
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_R}
              fill="none"
              stroke="var(--color-success-surface)"
              strokeWidth={RING_STROKE}
            />
            {/* Progreso que se rellena. */}
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_R}
              fill="none"
              stroke="var(--color-success)"
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              className="animate-ring-fill"
              style={{
                strokeDasharray: RING_CIRC,
                // Fallback inicial = vacío; el keyframe lo lleva a 0.
                strokeDashoffset: RING_CIRC,
                ['--ring-circ' as string]: String(RING_CIRC),
              }}
            />
          </svg>
          {/* Check: aparece con pop sutil cuando el anillo está lleno. */}
          {ringDone && (
            <span
              className="absolute inset-0 flex items-center justify-center animate-check-pop"
              style={{ color: 'var(--color-success)' }}
            >
              <Check className="h-12 w-12" strokeWidth={3} />
            </span>
          )}
        </div>

        {ringDone && (
          <div className="animate-confirm-fade-up">
            <h3 className="font-display text-3xl font-bold" style={{ color: 'var(--theme-ink)' }}>
              ¡Confirmado!
            </h3>
            <p
              className="font-brand-num text-xl font-semibold mt-3"
              style={{ color: 'var(--theme-ink)' }}
            >
              {formatLongDate(date)}
            </p>
            <p
              className="font-brand-num text-3xl font-bold mt-1 tabular-nums"
              style={{ color: 'var(--color-success)' }}
            >
              {time}
            </p>
            <p className="text-sm mt-3" style={{ color: 'var(--theme-ink-2)' }}>
              {service}
              {barber ? ` · con ${barber}` : ''}
            </p>
            <p className="text-sm mt-4" style={{ color: 'var(--theme-ink-2)' }}>
              Te esperamos.
            </p>
            <p className="text-xs mt-1.5" style={{ color: 'var(--theme-ink-3)' }}>
              Recibirás recordatorio por WhatsApp el día antes.
            </p>
            <button
              type="button"
              onClick={onReset}
              className="mt-6 text-sm underline"
              style={{ color: 'var(--theme-ink-2)' }}
            >
              Hacer otra reserva
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

function SlotBand({
  title,
  slots,
  current,
  onPick,
}: {
  title: string
  slots: Slot[]
  current: string | null
  onPick: (start: string) => void
}) {
  return (
    <div>
      <p
        className="text-[11px] font-bold uppercase tracking-[0.18em] mb-2"
        style={{ color: 'var(--theme-ink-3)' }}
      >
        {title}
        <span className="ml-2 font-normal normal-case tracking-normal opacity-60">
          · {slots.length} {slots.length === 1 ? 'hueco' : 'huecos'}
        </span>
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {slots.map((s) => {
          const selected = s.start === current
          return (
            <button
              key={s.start}
              type="button"
              onClick={() => onPick(s.start)}
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
    </div>
  )
}

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
  const hasDescription = service.description && service.description.trim().length > 0
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl p-3 sm:p-4 flex flex-col gap-3 transition-all active:scale-[0.99] text-left overflow-hidden"
      style={{
        background: selected ? 'var(--brand-soft)' : 'var(--theme-surface)',
        border: `2px solid ${selected ? 'var(--brand-strong)' : 'var(--theme-line)'}`,
        boxShadow: selected ? `0 6px 16px -8px var(--brand-strong)` : undefined,
      }}
      aria-pressed={selected}
      aria-expanded={selected && hasDescription ? true : undefined}
    >
      <div className="flex items-center gap-3 sm:gap-4 w-full">
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
          {hasDescription && !selected && (
            <p
              className="text-xs mt-1 leading-snug line-clamp-2"
              style={{ color: 'var(--theme-ink-2)' }}
            >
              {service.description}
            </p>
          )}
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
      </div>

      {/* Descripción completa expandida cuando se selecciona. */}
      {selected && hasDescription && (
        <div
          className="pl-[60px] sm:pl-[72px] pr-2 pb-1 text-xs sm:text-sm leading-relaxed"
          style={{ color: 'var(--theme-ink-2)' }}
        >
          {service.description}
        </div>
      )}
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
  optional = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoComplete?: string
  placeholder?: string
  /** Cuando true el campo NO es obligatorio (name/phone siguen required). */
  optional?: boolean
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
        required={!optional}
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
