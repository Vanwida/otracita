'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Wallet, ArrowRight, Loader2, CreditCard } from 'lucide-react'

// -----------------------------------------------------------------------------
// Online-payments summary card on /dashboard/mi-plan. Shows month-to-date
// totals, transaction count, and the ten most recent payment rows. Fetched
// client-side so we can reuse the /api/payments/summary endpoint (the one
// also powering a future mobile view) without a DB round-trip in the server
// page.
// -----------------------------------------------------------------------------

interface PaymentRow {
  id: string
  bookingId: string | null
  amountCents: number
  currency: string
  status: string
  description: string | null
  createdAt: string
  paidAt: string | null
}

interface SummaryResponse {
  month: {
    totalCents: number
    feeCents: number
    count: number
  }
  recent: PaymentRow[]
}

interface Props {
  connectStatus: string
}

export default function OnlinePaymentsSummary({ connectStatus }: Props) {
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(connectStatus === 'active')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (connectStatus !== 'active') return
    let cancelled = false
    fetch('/api/payments/summary')
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Error cargando resumen')
        }
        return res.json() as Promise<SummaryResponse>
      })
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [connectStatus])

  if (connectStatus !== 'active') {
    return (
      <div className="mt-8 bg-surface border border-line rounded-2xl p-5 md:p-6">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="h-12 w-12 rounded-xl bg-brand-softer border border-brand/20 flex items-center justify-center shrink-0">
            <Wallet className="h-5 w-5 text-brand" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <h2 className="font-semibold text-ink" style={{ fontSize: 'var(--text-section-title)' }}>
              Cobros online
            </h2>
            <p className="text-sm text-ink-2 mt-1">
              Activa los cobros para aceptar pagos con tarjeta desde la agenda y que el dinero
              vaya directo a tu banco.
            </p>
            <Link
              href="/dashboard/caja"
              className="btn-primary mt-4"
            >
              <CreditCard className="h-4 w-4" />
              Activar cobros online
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-8 bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="px-5 py-4 md:px-6 border-b border-line flex items-center gap-2">
        <Wallet className="h-4 w-4 text-ink-3" />
        <h2 className="text-base font-semibold text-ink">Cobros online</h2>
      </div>

      {loading ? (
        <div className="p-8 flex items-center justify-center gap-2 text-ink-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando…
        </div>
      ) : error ? (
        <div className="p-8 text-sm text-danger">{error}</div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line">
            <Stat
              label="Total este mes"
              value={`${(data.month.totalCents / 100).toFixed(2)} €`}
            />
            <Stat
              label="Transacciones"
              value={String(data.month.count)}
            />
            <Stat
              label="Comisión otracita"
              value={`${(data.month.feeCents / 100).toFixed(2)} €`}
            />
          </div>

          <div className="border-t border-line">
            <div className="px-5 py-3 md:px-6 text-xs font-semibold uppercase tracking-widest text-ink-3">
              Últimas transacciones
            </div>
            {data.recent.length === 0 ? (
              <div className="px-5 py-8 md:px-6 text-center text-sm text-ink-3">
                Aún no hay transacciones.
              </div>
            ) : (
              <div className="divide-y divide-line">
                {data.recent.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center gap-4 px-5 py-3 md:px-6 text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-ink font-medium truncate">
                        {row.description ?? 'Pago'}
                      </p>
                      <p className="text-xs text-ink-3 mt-0.5">
                        {new Date(row.createdAt).toLocaleDateString('es-ES', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="text-sm font-semibold text-ink tabular-nums">
                      {(row.amountCents / 100).toFixed(2)} {row.currency.toUpperCase()}
                    </div>
                    <PaymentStatusBadge status={row.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-5 md:px-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-3">{label}</p>
      <p className="mt-1 font-bold text-ink tabular-nums" style={{ fontSize: 'var(--text-figure)' }}>{value}</p>
    </div>
  )
}

function PaymentStatusBadge({ status }: { status: string }) {
  if (status === 'succeeded') {
    return (
      <span className="inline-flex items-center rounded-full bg-success/10 text-success border border-success/20 px-2.5 py-0.5 text-xs font-medium">
        Pagada
      </span>
    )
  }
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center rounded-full bg-warning/10 text-warning border border-warning/20 px-2.5 py-0.5 text-xs font-medium">
        Pendiente
      </span>
    )
  }
  if (status === 'refunded') {
    return (
      <span className="inline-flex items-center rounded-full bg-overlay text-ink-2 border border-line px-2.5 py-0.5 text-xs font-medium">
        Reembolsada
      </span>
    )
  }
  if (status === 'failed' || status === 'cancelled') {
    return (
      <span className="inline-flex items-center rounded-full bg-danger/10 text-danger border border-danger/20 px-2.5 py-0.5 text-xs font-medium">
        {status === 'failed' ? 'Fallida' : 'Cancelada'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-overlay text-ink-2 border border-line px-2.5 py-0.5 text-xs font-medium">
      {status}
    </span>
  )
}
