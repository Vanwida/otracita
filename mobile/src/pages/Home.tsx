import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { getMe, getToday, type BookingRow, type MeResponse } from '../lib/api'
import { formatCents } from '../lib/format'

// -----------------------------------------------------------------------------
// Home — la pantalla principal del barbero. Lista de bookings de hoy con
// botón gigante "Cobrar" + sección walk-in para importes libres + sección
// de citas pasadas pendientes de cerrar.
// -----------------------------------------------------------------------------

export function HomePage() {
  const navigate = useNavigate()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [today, setToday] = useState<BookingRow[]>([])
  const [pendingClosure, setPendingClosure] = useState<BookingRow[]>([])
  const [walkinAmount, setWalkinAmount] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setError(null)
    try {
      const [meData, todayData] = await Promise.all([getMe(), getToday()])
      setMe(meData)
      setToday(todayData.today.filter((b) => b.priceCents && b.priceCents > 0))
      setPendingClosure(todayData.pendingClosure)
    } catch {
      setError('No se pudo cargar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  function startCheckout(amountCents: number, opts: { bookingId?: string; subtitle?: string }) {
    navigate('/checkout', { state: { amountCents, ...opts } })
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-canvas">
        <p className="text-ink-3 text-sm">Cargando…</p>
      </div>
    )
  }

  return (
    <div
      className="min-h-full bg-canvas pb-8"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <header className="px-5 pt-4 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">{me?.business.name ?? '—'}</h1>
          <p className="text-xs text-ink-3 capitalize">
            {new Date().toLocaleDateString('es-ES', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="h-10 w-10 rounded-full bg-surface border border-line flex items-center justify-center text-ink-2 active:bg-overlay"
          aria-label="Ajustes"
        >
          <span className="text-lg">⚙</span>
        </button>
      </header>

      {error && (
        <div className="mx-5 mb-3 rounded-xl bg-danger/10 border border-danger/30 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Walk-in / cobro libre */}
      <section className="mx-5 mb-5 rounded-2xl bg-surface border border-line p-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-ink-2 mb-2">
          Cobro rápido
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0,00"
            value={walkinAmount}
            onChange={(e) => setWalkinAmount(e.target.value)}
            className="flex-1 h-14 text-2xl tabular-nums font-semibold text-right bg-overlay border border-line rounded-xl px-4 outline-none focus:border-brand"
          />
          <Button
            size="xl"
            disabled={!walkinAmount || Number(walkinAmount) <= 0}
            onClick={() => {
              const eur = Number(walkinAmount)
              if (!Number.isFinite(eur) || eur <= 0) return
              startCheckout(Math.round(eur * 100), { subtitle: 'Cobro libre' })
            }}
          >
            Cobrar
          </Button>
        </div>
      </section>

      {/* Citas de hoy */}
      {today.length > 0 && (
        <section className="px-5 mb-5">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink-2 mb-2">
            Citas de hoy ({today.length})
          </h2>
          <ul className="space-y-2">
            {today.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                onCobrar={() =>
                  startCheckout(b.priceCents ?? 0, {
                    bookingId: b.id,
                    subtitle: `${b.service} · ${b.customerName ?? b.customerPhone}`,
                  })
                }
              />
            ))}
          </ul>
        </section>
      )}

      {/* Pendientes de cerrar */}
      {pendingClosure.length > 0 && (
        <section className="px-5 mb-5">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-warning mb-2">
            Citas pasadas sin cerrar ({pendingClosure.length})
          </h2>
          <ul className="space-y-2">
            {pendingClosure.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                accent
                onCobrar={() =>
                  startCheckout(b.priceCents ?? 0, {
                    bookingId: b.id,
                    subtitle: `${b.service} · ${b.customerName ?? b.customerPhone}`,
                  })
                }
              />
            ))}
          </ul>
        </section>
      )}

      {today.length === 0 && pendingClosure.length === 0 && (
        <p className="text-center text-sm text-ink-3 mt-12 px-6">
          Sin citas pendientes. Usa el cobro rápido arriba para walk-ins.
        </p>
      )}
    </div>
  )
}

function BookingCard({
  booking,
  onCobrar,
  accent = false,
}: {
  booking: BookingRow
  onCobrar: () => void
  accent?: boolean
}) {
  const customer = booking.customerName?.trim() || booking.customerPhone
  // CÉNTIMOS → "12,50 €" (es-ES). Antes era euros enteros y 12,50 salía
  // como 13 (L-05).
  const amount = formatCents(booking.priceCents ?? 0)
  return (
    <li
      className={`rounded-2xl bg-surface p-4 ${accent ? 'border border-warning/30' : 'border border-line'}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <p className="text-sm font-semibold text-ink truncate">
          <span className="text-ink-3 font-normal mr-1.5">{booking.time}</span>
          {customer}
        </p>
        <p className="text-base font-bold text-ink tabular-nums shrink-0">{amount}</p>
      </div>
      <p className="text-xs text-ink-3 mb-3 truncate">
        {booking.service}
        {booking.barber ? ` · ${booking.barber}` : ''}
      </p>
      <Button size="lg" className="w-full" onClick={onCobrar}>
        Cobrar {amount}
      </Button>
    </li>
  )
}
