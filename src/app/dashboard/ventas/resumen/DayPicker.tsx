'use client'

import * as React from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Calendar, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { parseIsoDate, toLocalIso } from '@/lib/dashboard/period'

// -----------------------------------------------------------------------------
// DayPicker — selector de fecha para `/dashboard/ventas/resumen`.
//
// El resumen detallado se ata a UN DÍA concreto (no a un periodo). Las chips
// son "Hoy", "Ayer" + los últimos 5 días con su día de semana abreviado, más
// un popover con <input type=date> para saltar a cualquier fecha pasada.
//
// Serializa la fecha como `?d=YYYY-MM-DD`. Sin `d` o con `d` inválido, la
// página resuelve a "hoy". Flechas izquierda/derecha permiten avanzar día a
// día sin abrir el calendario — útil para revisar varios días seguidos.
//
// A11y: focus visible, ESC cierra popover, Enter aplica.
// -----------------------------------------------------------------------------

const DAY_LABELS_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

function formatDayLabel(dateIso: string, today: string): string {
  if (dateIso === today) return 'Hoy'
  const yesterday = shiftDay(today, -1)
  if (dateIso === yesterday) return 'Ayer'
  const dt = parseIsoDate(dateIso)
  if (!dt) return dateIso
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
  }).format(dt)
}

function shiftDay(iso: string, deltaDays: number): string {
  const dt = parseIsoDate(iso)
  if (!dt) return iso
  const shifted = new Date(
    dt.getFullYear(),
    dt.getMonth(),
    dt.getDate() + deltaDays,
  )
  return toLocalIso(shifted)
}

function buildRecentDays(today: string, count: number): string[] {
  // Hoy → hoy-(count-1). Quita duplicados manteniendo orden.
  const out: string[] = []
  for (let i = 0; i < count; i++) out.push(shiftDay(today, -i))
  return out
}

interface DayPickerProps {
  /** YYYY-MM-DD activo en la URL (ya validado y normalizado en la página). */
  selectedDay: string
  /** YYYY-MM-DD del día de hoy (local). Se calcula en server para evitar
   *  flash inicial si el dispositivo está fuera de TZ Europe/Madrid. */
  today: string
  /**
   * Origen del breakdown — pinta una mini-etiqueta junto a la fecha activa
   * para que Reni entienda de un vistazo si lo que ve es snapshot inmutable,
   * sesión viva, o sintetizado desde las ventas del día.
   */
  source?: 'snapshot' | 'session_live' | 'synthesized'
}

const SOURCE_LABEL: Record<NonNullable<DayPickerProps['source']>, string> = {
  snapshot: 'Cierre confirmado',
  session_live: 'Caja abierta',
  synthesized: 'Sin caja del día',
}

export default function DayPicker({
  selectedDay,
  today,
  source,
}: DayPickerProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const recentDays = useMemo(() => buildRecentDays(today, 5), [today])

  const setDay = useCallback(
    (iso: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (iso === today) params.delete('d')
      else params.set('d', iso)
      const qs = params.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    },
    [pathname, router, searchParams, today],
  )

  // Click fuera + ESC cierran el popover.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!popoverRef.current) return
      if (!popoverRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    requestAnimationFrame(() => inputRef.current?.focus())
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const prevDay = shiftDay(selectedDay, -1)
  const nextDay = shiftDay(selectedDay, 1)
  const canGoNext = nextDay <= today

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Día activo + flechas de navegación día a día. */}
      <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
        <button
          type="button"
          onClick={() => setDay(prevDay)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:bg-overlay hover:text-ink transition-colors"
          aria-label="Día anterior"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="px-2 text-center">
          <p className="text-[0.75rem] font-semibold text-ink leading-tight tabular-nums">
            {formatLongDay(selectedDay)}
          </p>
          {source && (
            <p className="text-[0.625rem] uppercase tracking-[0.08em] text-ink-3 leading-tight">
              {SOURCE_LABEL[source]}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => (canGoNext ? setDay(nextDay) : undefined)}
          disabled={!canGoNext}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:bg-overlay hover:text-ink transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label="Día siguiente"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Chips rápidos: Hoy / Ayer + 5 últimos días con dow + número. */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-overlay p-1">
        {recentDays.map((iso) => {
          const isActive = iso === selectedDay
          const dt = parseIsoDate(iso)
          const dowLabel = dt ? DAY_LABELS_ES[dt.getDay()] : ''
          const dayLabel = formatDayLabel(iso, today)
          return (
            <button
              key={iso}
              type="button"
              onClick={() => setDay(iso)}
              aria-pressed={isActive}
              className={`min-w-[3.25rem] rounded-md px-2.5 py-1 text-center transition-colors ${
                isActive
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink-3 hover:text-ink-2 hover:bg-surface/60'
              }`}
            >
              {(iso === today || iso === shiftDay(today, -1)) ? (
                <span className="text-[0.75rem] font-semibold tabular-nums leading-tight">
                  {dayLabel}
                </span>
              ) : (
                <>
                  <span className="block text-[0.625rem] uppercase tracking-[0.08em] leading-tight">
                    {dowLabel}
                  </span>
                  <span className="block text-[0.75rem] font-semibold tabular-nums leading-tight">
                    {dayLabel}
                  </span>
                </>
              )}
            </button>
          )
        })}
      </div>

      {/* Popover con <input type=date> para saltar a cualquier día pasado. */}
      <div ref={popoverRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[0.75rem] font-medium text-ink-2 hover:text-ink hover:border-line-strong transition-colors"
        >
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Otra fecha</span>
        </button>
        {open && (
          <CustomDatePopover
            inputRef={inputRef}
            today={today}
            initial={selectedDay}
            onApply={(iso) => {
              setDay(iso)
              setOpen(false)
            }}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    </div>
  )
}

function formatLongDay(iso: string): string {
  const dt = parseIsoDate(iso)
  if (!dt) return iso
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dt)
}

interface CustomDatePopoverProps {
  inputRef: React.RefObject<HTMLInputElement | null>
  today: string
  initial: string
  onApply: (iso: string) => void
  onClose: () => void
}

function CustomDatePopover({
  inputRef,
  today,
  initial,
  onApply,
  onClose,
}: CustomDatePopoverProps) {
  const [value, setValue] = useState(initial)
  const titleId = useId()
  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      className="absolute right-0 top-[calc(100%+0.375rem)] z-30 w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-line bg-surface p-3 shadow-lg"
    >
      <p id={titleId} className="mb-2 text-[0.75rem] font-semibold text-ink">
        Saltar a una fecha
      </p>
      <input
        ref={inputRef}
        type="date"
        value={value}
        max={today}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && parseIsoDate(value)) {
            e.preventDefault()
            onApply(value)
          }
        }}
        className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-brand"
        aria-label="Fecha del día a mostrar"
      />
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2.5 py-1.5 text-[0.75rem] font-medium text-ink-2 hover:bg-overlay"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => {
            if (parseIsoDate(value)) onApply(value)
          }}
          disabled={!parseIsoDate(value)}
          className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1.5 text-[0.75rem] font-semibold text-brand-ink hover:bg-brand-strong disabled:opacity-50"
        >
          <Check className="h-3 w-3" aria-hidden="true" />
          Aplicar
        </button>
      </div>
    </div>
  )
}
