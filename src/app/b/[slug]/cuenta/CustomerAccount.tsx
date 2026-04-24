'use client'

import { useEffect, useState, useCallback } from 'react'
import { User, LogOut, Calendar, Loader2, ChevronLeft, ChevronRight, CheckCircle2, XCircle } from 'lucide-react'
import LoyaltyCard from './LoyaltyCard'

// -----------------------------------------------------------------------------
// CustomerAccount — Flujo completo de cuenta del cliente PWA.
//
// Tres estados:
//   1) No loggeado → form OTP en dos pasos (teléfono → código)
//   2) Loggeado + vista "home" → tarjeta + enlaces a reservas y logout
//   3) Loggeado + vista "bookings" → upcoming + past + cancelar
//
// Todas las transiciones son state-based (no navegación) para sentir app.
// Reusa CSS vars del <main> padre para theming consistente con la barbería.
// -----------------------------------------------------------------------------

interface Props {
  slug: string
  businessName: string
}

interface Me {
  loggedIn: boolean
  user?: { phone: string; name: string | null; email: string | null }
}

interface Booking {
  id: string
  date: string
  time: string
  duration: number
  service: string
  barber: string | null
  status: string
  price: number | null
  clientBusinessName: string
  clientSlug: string | null
  clientBrandColor: string | null
}

type View = 'loading' | 'login-phone' | 'login-code' | 'home' | 'bookings'

export default function CustomerAccount({ slug, businessName }: Props) {
  const [view, setView] = useState<View>('loading')
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [otpHint, setOtpHint] = useState<string | null>(null)

  const [upcoming, setUpcoming] = useState<Booking[]>([])
  const [past, setPast] = useState<Booking[]>([])
  const [loadingBookings, setLoadingBookings] = useState(false)

  const refreshMe = useCallback(async () => {
    try {
      const r = await fetch('/api/app/me', { cache: 'no-store' })
      const d = (await r.json()) as Me
      setMe(d)
      setView(d.loggedIn ? 'home' : 'login-phone')
    } catch {
      setMe({ loggedIn: false })
      setView('login-phone')
    }
  }, [])

  useEffect(() => {
    refreshMe()
  }, [refreshMe])

  const fetchBookings = useCallback(async () => {
    setLoadingBookings(true)
    try {
      const r = await fetch(`/api/app/bookings?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      const d = await r.json()
      setUpcoming(Array.isArray(d.upcoming) ? d.upcoming : [])
      setPast(Array.isArray(d.past) ? d.past : [])
    } finally {
      setLoadingBookings(false)
    }
  }, [slug])

  useEffect(() => {
    if (view === 'bookings') fetchBookings()
  }, [view, fetchBookings])

  const requestCode = async () => {
    setError(null)
    if (!phone.trim()) {
      setError('Escribe tu teléfono.')
      return
    }
    setLoading(true)
    try {
      const r = await fetch('/api/app/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, phone: phone.trim() }),
      })
      const d = await r.json()
      if (!r.ok) {
        setError(d?.error || 'No se pudo enviar el código')
        return
      }
      setOtpHint(d?.hint ?? null)
      setView('login-code')
    } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }

  const verifyCode = async () => {
    setError(null)
    if (!/^\d{6}$/.test(code)) {
      setError('El código es de 6 dígitos.')
      return
    }
    setLoading(true)
    try {
      const r = await fetch('/api/app/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, phone: phone.trim(), code, name: name.trim() || undefined }),
      })
      const d = await r.json()
      if (!r.ok) {
        setError(d?.error || 'No se pudo verificar')
        return
      }
      await refreshMe()
      setCode('')
    } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    await fetch('/api/app/logout', { method: 'POST' }).catch(() => {})
    setMe({ loggedIn: false })
    setPhone('')
    setName('')
    setCode('')
    setView('login-phone')
  }

  const cancelBooking = async (id: string) => {
    if (!confirm('¿Cancelar esta reserva?')) return
    const r = await fetch(`/api/app/bookings/${id}/cancel`, { method: 'POST' })
    if (r.ok) fetchBookings()
  }

  // ── Loading inicial ───────────────────────────────────────────────────
  if (view === 'loading') {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--theme-ink-3)' }} />
      </div>
    )
  }

  // ── Login paso 1: teléfono ────────────────────────────────────────────
  if (view === 'login-phone') {
    return (
      <section className="mx-auto max-w-md px-4 pt-6 pb-8">
        <LoginHero businessName={businessName} />
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--theme-ink-3)' }}>
              WhatsApp
            </label>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+34 600 123 456"
              className="rounded-xl px-4 py-3.5 text-base outline-none transition-colors"
              style={{
                background: 'var(--theme-surface)',
                border: '1px solid var(--theme-line)',
                color: 'var(--theme-ink)',
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--theme-ink-3)' }}>
              Nombre <span className="font-normal normal-case text-[10px]">(opcional la primera vez)</span>
            </label>
            <input
              type="text"
              autoComplete="given-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl px-4 py-3.5 text-base outline-none transition-colors"
              style={{
                background: 'var(--theme-surface)',
                border: '1px solid var(--theme-line)',
                color: 'var(--theme-ink)',
              }}
            />
          </div>
          {error && (
            <p
              className="text-sm rounded-lg px-3 py-2"
              style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#DC2626', border: '1px solid rgba(239, 68, 68, 0.2)' }}
            >
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={requestCode}
            disabled={loading || !phone.trim()}
            className="w-full rounded-xl px-6 py-4 text-base font-bold transition-transform active:scale-[0.98] disabled:opacity-60"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            {loading ? 'Enviando…' : 'Recibir código por WhatsApp'}
          </button>
          <p className="text-[11px] text-center" style={{ color: 'var(--theme-ink-3)' }}>
            Con tu cuenta accedes a tus próximas citas, historial y puedes reservar más rápido.
          </p>
        </div>
      </section>
    )
  }

  // ── Login paso 2: código ──────────────────────────────────────────────
  if (view === 'login-code') {
    return (
      <section className="mx-auto max-w-md px-4 pt-6 pb-8">
        <button
          type="button"
          onClick={() => {
            setView('login-phone')
            setCode('')
            setError(null)
          }}
          className="inline-flex items-center gap-1 text-sm mb-4 transition-colors"
          style={{ color: 'var(--theme-ink-2)' }}
        >
          <ChevronLeft className="h-4 w-4" />
          Cambiar número
        </button>
        <h1 className="font-display text-2xl font-bold mb-2" style={{ color: 'var(--theme-ink)' }}>
          Introduce el código
        </h1>
        <p className="text-sm mb-5" style={{ color: 'var(--theme-ink-2)' }}>
          {otpHint || `Código enviado por WhatsApp al ${phone}. Llega en unos segundos.`}
        </p>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          className="w-full text-center tracking-[0.5em] text-3xl font-mono rounded-xl py-4 outline-none transition-colors"
          style={{
            background: 'var(--theme-surface)',
            border: '1px solid var(--theme-line)',
            color: 'var(--theme-ink)',
          }}
        />
        {error && (
          <p
            className="text-sm rounded-lg px-3 py-2 mt-3"
            style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#DC2626', border: '1px solid rgba(239, 68, 68, 0.2)' }}
          >
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={verifyCode}
          disabled={loading || code.length !== 6}
          className="w-full mt-4 rounded-xl px-6 py-4 text-base font-bold transition-transform active:scale-[0.98] disabled:opacity-60"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          {loading ? 'Verificando…' : 'Entrar'}
        </button>
        <button
          type="button"
          onClick={requestCode}
          disabled={loading}
          className="w-full mt-3 text-sm underline underline-offset-2"
          style={{ color: 'var(--theme-ink-2)' }}
        >
          Reenviar código
        </button>
      </section>
    )
  }

  // ── Home loggeado ────────────────────────────────────────────────────
  if (view === 'home' && me?.loggedIn) {
    return (
      <section className="mx-auto max-w-md px-4 pt-6 pb-8 space-y-4">
        <div
          className="rounded-2xl p-5 flex items-center gap-4"
          style={{
            background: `linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 70%, black) 100%)`,
            color: 'var(--accent-ink)',
          }}
        >
          <div
            className="h-14 w-14 rounded-full flex items-center justify-center font-display text-xl font-bold shrink-0"
            style={{ background: 'rgba(255,255,255,0.25)' }}
          >
            {me.user?.name?.slice(0, 1).toUpperCase() || <User className="h-6 w-6" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold truncate">{me.user?.name || 'Cliente'}</p>
            <p className="text-sm opacity-85 truncate">{me.user?.phone}</p>
          </div>
        </div>

        <LoyaltyCard slug={slug} />

        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--theme-surface)', border: '1px solid var(--theme-line)' }}
        >
          <RowLink
            icon={Calendar}
            label="Mis reservas"
            hint="Próximas y historial"
            onClick={() => setView('bookings')}
          />
          <div className="h-px" style={{ background: 'var(--theme-line)' }} />
          <RowStatic
            icon={User}
            label="Perfil"
            value={me.user?.email || me.user?.phone || ''}
          />
        </div>

        <button
          type="button"
          onClick={logout}
          className="w-full rounded-2xl px-5 py-4 text-sm font-semibold flex items-center gap-3 transition-colors"
          style={{
            background: 'var(--theme-surface)',
            border: '1px solid var(--theme-line)',
            color: '#DC2626',
          }}
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </section>
    )
  }

  // ── Bookings ────────────────────────────────────────────────────────
  if (view === 'bookings') {
    return (
      <section className="mx-auto max-w-md px-4 pt-6 pb-8">
        <button
          type="button"
          onClick={() => setView('home')}
          className="inline-flex items-center gap-1 text-sm mb-4 transition-colors"
          style={{ color: 'var(--theme-ink-2)' }}
        >
          <ChevronLeft className="h-4 w-4" />
          Volver
        </button>
        <h1 className="font-display text-2xl font-bold mb-5" style={{ color: 'var(--theme-ink)' }}>
          Mis reservas
        </h1>

        <div className="space-y-6">
          <div>
            <h3 className="text-[11px] uppercase tracking-widest font-bold mb-2" style={{ color: 'var(--theme-ink-3)' }}>
              Próximas
            </h3>
            <BookingList
              list={upcoming}
              loading={loadingBookings}
              emptyMsg="No tienes reservas próximas."
              onCancel={cancelBooking}
              canCancel
            />
          </div>
          <div>
            <h3 className="text-[11px] uppercase tracking-widest font-bold mb-2" style={{ color: 'var(--theme-ink-3)' }}>
              Historial
            </h3>
            <BookingList
              list={past}
              loading={loadingBookings}
              emptyMsg="Aún no has venido con nosotros."
              onCancel={cancelBooking}
              canCancel={false}
            />
          </div>
        </div>
      </section>
    )
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────────

function LoginHero({ businessName }: { businessName: string }) {
  return (
    <div className="mb-6 text-center">
      <div
        className="mx-auto mb-4 h-16 w-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}
      >
        <User className="h-7 w-7" />
      </div>
      <h1 className="font-display text-2xl font-bold" style={{ color: 'var(--theme-ink)' }}>
        Bienvenido
      </h1>
      <p className="text-sm mt-1" style={{ color: 'var(--theme-ink-2)' }}>
        Entra con tu WhatsApp para ver tus reservas en {businessName}.
      </p>
    </div>
  )
}

function RowLink({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof Calendar
  label: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors"
    >
      <div
        className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--theme-ink)' }}>
          {label}
        </p>
        {hint && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--theme-ink-3)' }}>
            {hint}
          </p>
        )}
      </div>
      <ChevronRight className="h-4 w-4" style={{ color: 'var(--theme-ink-3)' }} />
    </button>
  )
}

function RowStatic({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <div
        className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: 'var(--theme-overlay)', color: 'var(--theme-ink-2)' }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--theme-ink)' }}>
          {label}
        </p>
        {value && (
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--theme-ink-3)' }}>
            {value}
          </p>
        )}
      </div>
    </div>
  )
}

function BookingList({
  list,
  loading,
  emptyMsg,
  onCancel,
  canCancel,
}: {
  list: Booking[]
  loading: boolean
  emptyMsg: string
  onCancel: (id: string) => void
  canCancel: boolean
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--theme-ink-3)' }} />
      </div>
    )
  }
  if (list.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed p-5 text-center"
        style={{ borderColor: 'var(--theme-line)' }}
      >
        <p className="text-sm" style={{ color: 'var(--theme-ink-3)' }}>
          {emptyMsg}
        </p>
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      {list.map((b) => (
        <li
          key={b.id}
          className="rounded-xl p-4"
          style={{
            background: 'var(--theme-surface)',
            border: '1px solid var(--theme-line)',
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate" style={{ color: 'var(--theme-ink)' }}>
                {b.service}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--theme-ink-2)' }}>
                {b.date} · {b.time}
                {b.barber ? ` · ${b.barber}` : ''}
              </p>
            </div>
            {b.status === 'cancelled' && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-red-600">
                <XCircle className="h-3 w-3" />
                Cancelada
              </span>
            )}
            {b.status === 'completed' && (
              <span
                className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold"
                style={{ color: 'var(--theme-ink-3)' }}
              >
                <CheckCircle2 className="h-3 w-3" />
                Hecha
              </span>
            )}
            {b.status === 'no_show' && (
              <span
                className="text-[10px] uppercase tracking-widest font-bold"
                style={{ color: 'var(--theme-ink-3)' }}
              >
                No-show
              </span>
            )}
          </div>
          {canCancel && (b.status === 'confirmed' || b.status === 'completed') && (
            <button
              type="button"
              onClick={() => onCancel(b.id)}
              className="mt-2 text-xs underline underline-offset-2 text-red-600 hover:text-red-700"
            >
              Cancelar reserva
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

