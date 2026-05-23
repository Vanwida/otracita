'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { LogOut, Scissors, TrendingUp, Heart } from 'lucide-react'
import type { TodayFeed } from '../_lib/types'
import { formatEuros } from '../_lib/format'

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<TodayFeed>)

export default function YoClient({ token }: { token: string }) {
  const { data } = useSWR<TodayFeed>('/api/r/me/today', fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  })
  const [loggingOut, setLoggingOut] = useState(false)

  const logout = async () => {
    if (!confirm('¿Cerrar sesión en este móvil?\n\nPodrás volver desde el enlace que te mandó el jefe.')) return
    setLoggingOut(true)
    try {
      await fetch('/api/r/me/logout', { method: 'POST' })
    } finally {
      // Recarga full para limpiar SWR cache; ir a la welcome screen del
      // token actual (que NO setea cookie hasta que pulse "Entrar").
      window.location.href = `/r/${token}?install=1`
    }
  }

  const barber = data?.barber
  const sales = data?.sales
  const tips = data?.tips

  return (
    <div className="space-y-5">
      {/* Identidad */}
      <section className="rounded-control border border-line bg-surface p-5 text-center shadow-sm">
        {barber?.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={barber.photoUrl}
            alt={barber.name}
            className="mx-auto h-20 w-20 rounded-full border border-line object-cover"
          />
        ) : (
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-line bg-overlay text-2xl font-bold text-ink-2">
            {barber?.name.slice(0, 1).toUpperCase() ?? '?'}
          </div>
        )}
        <p className="mt-3 text-lg font-bold text-ink">
          {barber?.name ?? 'Cargando…'}
        </p>
        {barber?.role && (
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
            {barber.role}
          </p>
        )}
        {data?.client.businessName && (
          <p className="mt-2 text-xs text-ink-2">
            Trabajas en {data.client.businessName}
          </p>
        )}
      </section>

      {/* Stats mes */}
      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-3">
          Resumen del mes
        </h2>
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            label="Cortes hoy"
            value={(sales?.todayCount ?? 0).toString()}
            Icon={Scissors}
          />
          <StatCard
            label="Ingresos mes"
            value={formatEuros(sales?.monthCents ?? 0)}
            Icon={TrendingUp}
          />
          <StatCard
            label="Propinas hoy"
            value={formatEuros(tips?.todayCents ?? 0)}
            Icon={Heart}
          />
          <StatCard
            label="Propinas mes"
            value={formatEuros(
              (tips?.cashEntregadaCents ?? 0) +
                (tips?.cardPendienteCents ?? 0),
            )}
            Icon={Heart}
          />
        </div>
      </section>

      {/* Logout */}
      <section>
        <button
          type="button"
          onClick={logout}
          disabled={loggingOut}
          className="flex w-full items-center justify-center gap-2 rounded-control border border-line bg-surface py-3 text-sm font-medium text-ink-2 transition-colors hover:bg-overlay/40 disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" />
          {loggingOut ? 'Cerrando…' : 'Cerrar sesión'}
        </button>
        <p className="mt-2 text-center text-[11px] text-ink-3">
          El enlace personal que te mandó el jefe seguirá funcionando.
        </p>
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  Icon,
}: {
  label: string
  value: string
  Icon: typeof Scissors
}) {
  return (
    <div className="rounded-control border border-line bg-surface p-4">
      <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-softer">
        <Icon className="h-4 w-4 text-brand" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-ink">{value}</p>
    </div>
  )
}
