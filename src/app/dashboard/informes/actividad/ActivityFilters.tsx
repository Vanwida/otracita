'use client'

import { useCallback } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  BOOKING_EVENT_TYPES_ORDERED,
  bookingEventMeta,
} from '@/lib/bookings/event-meta'

// -----------------------------------------------------------------------------
// ActivityFilters — filtros de la vista global de actividad (task #107):
// por TIPO de evento y por BARBERO. Persisten en la URL (?type=&barber=) para
// ser back/refresh-friendly y compartibles. El periodo lo gestiona aparte
// StatsPeriodTabs (header del área).
//
// "Todos" = sin param (URL limpia). Server-component (page.tsx) lee los
// searchParams y filtra la query — este componente solo escribe la URL.
// -----------------------------------------------------------------------------

interface BarberOption {
  id: string
  name: string
}

interface Props {
  barbers: BarberOption[]
  /** Tipo activo (de la URL) o null = todos. */
  activeType: string | null
  /** barberId activo (de la URL) o null = todos. */
  activeBarberId: string | null
}

export default function ActivityFilters({
  barbers,
  activeType,
  activeBarberId,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value === null || value === 'all') params.delete(key)
      else params.set(key, value)
      const q = params.toString()
      router.push(q ? `${pathname}?${q}` : pathname)
    },
    [pathname, router, searchParams],
  )

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Filtro por tipo — chips. */}
      <div
        className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-overlay p-1"
        role="group"
        aria-label="Filtrar por tipo de evento"
      >
        <button
          type="button"
          onClick={() => setParam('type', null)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            activeType === null
              ? 'bg-surface text-ink shadow-sm'
              : 'text-ink-3 hover:text-ink-2'
          }`}
        >
          Todo
        </button>
        {BOOKING_EVENT_TYPES_ORDERED.map((t) => {
          const meta = bookingEventMeta(t)
          const isActive = activeType === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setParam('type', isActive ? null : t)}
              aria-pressed={isActive}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              {meta.label}
            </button>
          )
        })}
      </div>

      {/* Filtro por barbero — select (puede haber muchos). */}
      {barbers.length > 1 && (
        <label className="flex items-center gap-2 text-xs text-ink-2">
          <span className="sr-only">Filtrar por barbero</span>
          <select
            value={activeBarberId ?? 'all'}
            onChange={(e) => setParam('barber', e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink outline-none transition-colors focus:border-brand"
            aria-label="Filtrar por barbero"
          >
            <option value="all">Todos los barberos</option>
            {barbers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
