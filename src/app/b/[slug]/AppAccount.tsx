'use client'

import { useEffect, useState, useCallback } from 'react'
import { User, X, LogOut, Calendar, Loader2, ChevronLeft, Bell, BellOff } from 'lucide-react'
import { getPushStatus, pushSupported, subscribeToPush, unsubscribeFromPush, type PushStatus } from '@/lib/app-auth/push-client'

// -----------------------------------------------------------------------------
// AppAccount — floating "Mi cuenta" button + full-screen panel.
//
// Unauthenticated: OTP flow (phone → code → done).
// Authenticated: tabs with "Mis reservas" and "Perfil" (+ logout).
//
// Keeps the public booking flow intact. Logged-in users enjoy the extras;
// unauthenticated users can still book as a guest.
// -----------------------------------------------------------------------------

interface Props {
  slug: string
  brand: string
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

type Panel = 'closed' | 'home' | 'login-phone' | 'login-code' | 'bookings' | 'profile'

export default function AppAccount({ slug, brand }: Props) {
  const [panel, setPanel] = useState<Panel>('closed')
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Login state
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [otpHint, setOtpHint] = useState<string | null>(null)

  // Bookings state
  const [upcoming, setUpcoming] = useState<Booking[]>([])
  const [past, setPast] = useState<Booking[]>([])
  const [loadingBookings, setLoadingBookings] = useState(false)

  const refreshMe = useCallback(async () => {
    try {
      const r = await fetch('/api/app/me', { cache: 'no-store' })
      const d = (await r.json()) as Me
      setMe(d)
    } catch {
      setMe({ loggedIn: false })
    }
  }, [])

  useEffect(() => { refreshMe() }, [refreshMe])

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
    if (panel === 'bookings') fetchBookings()
  }, [panel, fetchBookings])

  const openHome = () => setPanel(me?.loggedIn ? 'home' : 'login-phone')
  const close = () => setPanel('closed')

  const requestCode = async () => {
    setError(null)
    if (!phone.trim()) { setError('Escribe tu teléfono.'); return }
    setLoading(true)
    try {
      const r = await fetch('/api/app/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, phone: phone.trim() }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d?.error || 'No se pudo enviar el código'); return }
      setOtpHint(d?.hint ?? null)
      setPanel('login-code')
    } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }

  const verifyCode = async () => {
    setError(null)
    if (!/^\d{6}$/.test(code)) { setError('El código es de 6 dígitos.'); return }
    setLoading(true)
    try {
      const r = await fetch('/api/app/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, phone: phone.trim(), code, name: name.trim() || undefined }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d?.error || 'No se pudo verificar'); return }
      await refreshMe()
      setPanel('home')
      setCode('')
      // Ask for push permission right after login so the user gets confirmations
      // and reminders from this barbería. Fire-and-forget — if they deny,
      // the Perfil panel lets them reconsider later.
      if (pushSupported() && Notification.permission === 'default') {
        subscribeToPush(slug).catch(() => {})
      }
    } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    await fetch('/api/app/logout', { method: 'POST' }).catch(() => {})
    await refreshMe()
    setPanel('closed')
  }

  const cancelBooking = async (id: string) => {
    if (!confirm('¿Cancelar esta reserva?')) return
    const r = await fetch(`/api/app/bookings/${id}/cancel`, { method: 'POST' })
    if (r.ok) fetchBookings()
  }

  // ── Floating button ──────────────────────────────────────────────────────
  const button = (
    <button
      type="button"
      onClick={openHome}
      className="fixed top-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-white border border-[var(--color-line)] shadow-sm px-3 py-2 text-sm font-medium hover:shadow-md transition-shadow"
      aria-label={me?.loggedIn ? 'Mi cuenta' : 'Iniciar sesión'}
    >
      <div
        className="h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
        style={{ background: brand }}
      >
        {me?.loggedIn && me?.user?.name ? me.user.name.slice(0, 1).toUpperCase() : <User className="h-3.5 w-3.5" />}
      </div>
      <span className="hidden sm:inline">
        {me?.loggedIn ? (me.user?.name?.split(' ')[0] || 'Mi cuenta') : 'Entrar'}
      </span>
    </button>
  )

  if (panel === 'closed') return button

  // ── Panel chrome ─────────────────────────────────────────────────────────
  const panelChrome = (title: string, back?: () => void, body?: React.ReactNode) => (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col">
        <header className="flex items-center gap-2 p-3 border-b border-[var(--color-line)]">
          {back ? (
            <button type="button" onClick={back} className="p-2 -ml-2 text-[var(--color-ink-2)]" aria-label="Atrás">
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : <div className="w-9" />}
          <h2 className="flex-1 text-center text-sm font-semibold text-[var(--color-ink)]">{title}</h2>
          <button type="button" onClick={close} className="p-2 -mr-2 text-[var(--color-ink-2)]" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{body}</div>
      </div>
    </div>
  )

  // ── Login step 1: phone ──────────────────────────────────────────────────
  if (panel === 'login-phone') {
    return (
      <>
        {button}
        {panelChrome(
          'Iniciar sesión',
          undefined,
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-ink-2)]">
              Te enviamos un código por WhatsApp para acceder a tus reservas y propinas.
            </p>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-[var(--color-ink-2)]">Tu WhatsApp</label>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+34 600 123 456"
                className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-lg p-3 text-sm outline-none focus:border-[var(--brand)]"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-[var(--color-ink-2)]">Nombre (opcional la primera vez)</label>
              <input
                type="text"
                autoComplete="given-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-lg p-3 text-sm outline-none focus:border-[var(--brand)]"
              />
            </div>
            {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
            <button
              type="button"
              onClick={requestCode}
              disabled={loading || !phone.trim()}
              className="w-full rounded-xl px-6 py-3 text-base font-semibold text-white disabled:opacity-60"
              style={{ background: brand }}
            >
              {loading ? 'Enviando…' : 'Recibir código'}
            </button>
          </div>,
        )}
      </>
    )
  }

  // ── Login step 2: code ───────────────────────────────────────────────────
  if (panel === 'login-code') {
    return (
      <>
        {button}
        {panelChrome(
          'Introduce el código',
          () => setPanel('login-phone'),
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-ink-2)]">
              {otpHint || 'Código enviado por WhatsApp. Llega en unos segundos.'}
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full text-center tracking-[0.5em] text-2xl font-mono bg-[var(--color-surface)] border border-[var(--color-line)] rounded-lg p-3 outline-none focus:border-[var(--brand)]"
            />
            {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
            <button
              type="button"
              onClick={verifyCode}
              disabled={loading || code.length !== 6}
              className="w-full rounded-xl px-6 py-3 text-base font-semibold text-white disabled:opacity-60"
              style={{ background: brand }}
            >
              {loading ? 'Verificando…' : 'Entrar'}
            </button>
            <button
              type="button"
              onClick={requestCode}
              disabled={loading}
              className="w-full text-xs text-[var(--color-ink-2)] underline underline-offset-2"
            >
              Reenviar código
            </button>
          </div>,
        )}
      </>
    )
  }

  // ── Authenticated home ──────────────────────────────────────────────────
  if (panel === 'home' && me?.loggedIn) {
    return (
      <>
        {button}
        {panelChrome(
          'Mi cuenta',
          undefined,
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-overlay)]">
              <div
                className="h-12 w-12 rounded-full flex items-center justify-center text-white text-lg font-bold"
                style={{ background: brand }}
              >
                {me.user?.name?.slice(0, 1).toUpperCase() || <User className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <p className="font-semibold truncate">{me.user?.name || 'Cliente'}</p>
                <p className="text-xs text-[var(--color-ink-3)] truncate">{me.user?.phone}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPanel('bookings')}
              className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[var(--color-overlay)] transition-colors"
            >
              <Calendar className="h-5 w-5 text-[var(--color-ink-2)]" />
              <span className="flex-1 text-sm font-medium">Mis reservas</span>
            </button>
            <button
              type="button"
              onClick={() => setPanel('profile')}
              className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[var(--color-overlay)] transition-colors"
            >
              <User className="h-5 w-5 text-[var(--color-ink-2)]" />
              <span className="flex-1 text-sm font-medium">Perfil</span>
            </button>
            <button
              type="button"
              onClick={logout}
              className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[var(--color-overlay)] transition-colors text-[var(--color-danger)]"
            >
              <LogOut className="h-5 w-5" />
              <span className="flex-1 text-sm font-medium">Cerrar sesión</span>
            </button>
          </div>,
        )}
      </>
    )
  }

  // ── Bookings list ───────────────────────────────────────────────────────
  if (panel === 'bookings') {
    const render = (list: Booking[], emptyMsg: string) =>
      loadingBookings ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-[var(--color-ink-3)]" /></div>
      ) : list.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-3)] py-6 text-center">{emptyMsg}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((b) => (
            <li key={b.id} className="rounded-xl border border-[var(--color-line)] p-3 bg-white">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{b.service}</p>
                  <p className="text-xs text-[var(--color-ink-2)] mt-0.5">
                    {b.date} · {b.time}{b.barber ? ` · ${b.barber}` : ''}
                  </p>
                </div>
                {b.status === 'cancelled' && (
                  <span className="text-[10px] uppercase tracking-wider text-[var(--color-danger)] font-semibold">Cancelada</span>
                )}
                {b.status === 'no_show' && (
                  <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)] font-semibold">No-show</span>
                )}
              </div>
              {(b.status === 'confirmed' || b.status === 'completed') && b.date >= new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }) && (
                <button
                  type="button"
                  onClick={() => cancelBooking(b.id)}
                  className="mt-2 text-xs text-[var(--color-danger)] hover:underline"
                >
                  Cancelar reserva
                </button>
              )}
            </li>
          ))}
        </ul>
      )
    return (
      <>
        {button}
        {panelChrome(
          'Mis reservas',
          () => setPanel('home'),
          <div className="space-y-6">
            <div>
              <h3 className="text-xs uppercase tracking-wider text-[var(--color-ink-3)] font-semibold mb-2">Próximas</h3>
              {render(upcoming, 'No tienes reservas próximas.')}
            </div>
            <div>
              <h3 className="text-xs uppercase tracking-wider text-[var(--color-ink-3)] font-semibold mb-2">Historial</h3>
              {render(past, 'Aún no has venido con nosotros.')}
            </div>
          </div>,
        )}
      </>
    )
  }

  // ── Profile ─────────────────────────────────────────────────────────────
  if (panel === 'profile' && me?.loggedIn) {
    return (
      <>
        {button}
        {panelChrome(
          'Perfil',
          () => setPanel('home'),
          <div className="space-y-3 text-sm">
            <Field label="Nombre" value={me.user?.name || '—'} />
            <Field label="Teléfono" value={me.user?.phone || '—'} />
            <Field label="Email" value={me.user?.email || '—'} />
            <PushToggle slug={slug} brand={brand} />
            <p className="text-xs text-[var(--color-ink-3)] pt-4">
              Edición de perfil próximamente. Para cambios urgentes escríbenos por WhatsApp.
            </p>
          </div>,
        )}
      </>
    )
  }

  return button
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] p-3">
      <span className="text-xs uppercase tracking-wider text-[var(--color-ink-3)]">{label}</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  )
}

function PushToggle({ slug, brand }: { slug: string; brand: string }) {
  const [status, setStatus] = useState<PushStatus>('unsupported')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setStatus(getPushStatus())
  }, [])

  if (status === 'unsupported') {
    return (
      <div className="rounded-xl border border-[var(--color-line)] p-3 text-xs text-[var(--color-ink-3)] flex items-center gap-2">
        <BellOff className="h-3.5 w-3.5" />
        Este dispositivo no soporta notificaciones.
      </div>
    )
  }

  const enable = async () => {
    setBusy(true)
    const next = await subscribeToPush(slug)
    setStatus(next)
    setBusy(false)
  }

  const disable = async () => {
    setBusy(true)
    await unsubscribeFromPush()
    setStatus('default')
    setBusy(false)
  }

  if (status === 'denied') {
    return (
      <div className="rounded-xl border border-[var(--color-line)] p-3 text-xs text-[var(--color-ink-2)] flex items-center gap-2">
        <BellOff className="h-3.5 w-3.5" />
        Notificaciones bloqueadas en los ajustes del navegador. Actívalas ahí para recibir recordatorios.
      </div>
    )
  }

  if (status === 'granted') {
    return (
      <button
        type="button"
        onClick={disable}
        disabled={busy}
        className="w-full flex items-center gap-3 rounded-xl border border-[var(--color-line)] p-3 text-left hover:bg-[var(--color-overlay)] transition-colors disabled:opacity-60"
      >
        <Bell className="h-5 w-5" style={{ color: brand }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Notificaciones activadas</p>
          <p className="text-xs text-[var(--color-ink-3)]">Te avisamos antes de cada cita. Toca para desactivar.</p>
        </div>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={enable}
      disabled={busy}
      className="w-full flex items-center gap-3 rounded-xl p-3 text-left text-white disabled:opacity-60"
      style={{ background: brand }}
    >
      <Bell className="h-5 w-5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">Activar notificaciones</p>
        <p className="text-xs opacity-90">Recordatorios de cita y novedades — cero spam.</p>
      </div>
    </button>
  )
}
