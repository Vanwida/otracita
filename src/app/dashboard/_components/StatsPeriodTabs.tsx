'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Calendar, ChevronDown, Check } from 'lucide-react'
import { PERIOD_OPTIONS, parseIsoDate, toLocalIso } from '@/lib/dashboard/period'

// -----------------------------------------------------------------------------
// StatsPeriodTabs — selector de periodo del dashboard (Informes, Equipo,
// Ventas/Resumen, Propinas, …). Single source of truth de cómo se serializa
// el periodo a la URL:
//
//   ?period=day       (default sin params extra = hoy)
//   ?period=day&date=YYYY-MM-DD
//   ?period=week|month|year|lifetime
//   ?period=range&start=YYYY-MM-DD&end=YYYY-MM-DD
//
// Feedback Reni V1: añadir "Día" con selector de fecha y "Rango custom"
// además de las chips fijas. La resolución del periodo (qué rango cubre cada
// chip) vive en `@/lib/dashboard/period`; aquí sólo pintamos UI + escribimos
// searchParams. Las páginas que consumen `?period=` reciben los nuevos
// valores sin tocarse (el resolver gestiona los edge cases: rango invertido,
// end ausente, etc.).
//
// UX:
//   · Chip "Día" — si está activa, muestra un picker (popover con
//     <input type="date">). Sin date → hoy.
//   · Chip "Rango" — abre popover con dos inputs (desde / hasta) + Aplicar.
//     Cuando hay rango activo, la chip muestra el rango formateado
//     ("3 may – 17 may"). El popover queda dentro del viewport en mobile.
//   · Resto de chips se comportan igual que antes (1 click → set period).
//
// A11y: ESC cierra el popover, clic fuera cierra, focus visible.
// -----------------------------------------------------------------------------

type OpenPopover = null | 'day' | 'range'

function formatRangeLabel(startIso: string, endIso: string): string {
  const s = parseIsoDate(startIso)
  const e = parseIsoDate(endIso)
  if (!s || !e) return 'Rango'
  const sameYear = s.getFullYear() === e.getFullYear()
  const sFmt = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(s)
  const eFmt = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(e)
  return `${sFmt} – ${eFmt}`
}

function formatDayLabel(dateIso: string | null, today: string): string {
  const iso = dateIso ?? today
  const dt = parseIsoDate(iso)
  if (!dt) return 'Día'
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
  }).format(dt)
}

export default function StatsPeriodTabs() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = searchParams.get('period') ?? 'lifetime'
  const currentDate = searchParams.get('date')
  const currentStart = searchParams.get('start')
  const currentEnd = searchParams.get('end')

  const [open, setOpen] = useState<OpenPopover>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dayInputRef = useRef<HTMLInputElement>(null)
  const rangeStartRef = useRef<HTMLInputElement>(null)

  const today = useMemo(() => toLocalIso(new Date()), [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (open === 'day') {
      requestAnimationFrame(() => dayInputRef.current?.focus())
    } else if (open === 'range') {
      requestAnimationFrame(() => rangeStartRef.current?.focus())
    }
  }, [open])

  const setPeriod = useCallback(
    (
      period: string,
      extra?: { date?: string | null; start?: string | null; end?: string | null },
    ) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('period', period)
      params.delete('date')
      params.delete('start')
      params.delete('end')
      if (period === 'day' && extra?.date) params.set('date', extra.date)
      if (period === 'range') {
        if (extra?.start) params.set('start', extra.start)
        if (extra?.end) params.set('end', extra.end)
      }
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams],
  )

  return (
    <div
      ref={containerRef}
      className="relative flex flex-wrap items-center gap-1 rounded-lg border border-line bg-overlay p-1"
    >
      {PERIOD_OPTIONS.map((p) => {
        const isActive = current === p.key
        if (p.key === 'day') {
          return (
            <DayChip
              key={p.key}
              isActive={isActive}
              label={isActive ? formatDayLabel(currentDate, today) : p.label}
              open={open === 'day'}
              onToggle={() => {
                if (!isActive) {
                  setPeriod('day', { date: null })
                  setOpen('day')
                } else {
                  setOpen(open === 'day' ? null : 'day')
                }
              }}
            />
          )
        }
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? 'bg-surface text-ink shadow-sm'
                : 'text-ink-3 hover:text-ink-2'
            }`}
          >
            {p.label}
          </button>
        )
      })}

      <RangeChip
        isActive={current === 'range'}
        label={
          current === 'range' && currentStart && currentEnd
            ? formatRangeLabel(currentStart, currentEnd)
            : 'Rango'
        }
        open={open === 'range'}
        onToggle={() => setOpen(open === 'range' ? null : 'range')}
      />

      {open === 'day' && (
        <DayPopover
          inputRef={dayInputRef}
          value={currentDate ?? today}
          today={today}
          onApply={(date) => {
            setPeriod('day', { date })
            setOpen(null)
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {open === 'range' && (
        <RangePopover
          startRef={rangeStartRef}
          initialStart={currentStart}
          initialEnd={currentEnd}
          today={today}
          onApply={(start, end) => {
            setPeriod('range', { start, end })
            setOpen(null)
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}

interface DayChipProps {
  isActive: boolean
  label: string
  open: boolean
  onToggle: () => void
}

function DayChip({ isActive, label, open, onToggle }: DayChipProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-haspopup="dialog"
      className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        isActive
          ? 'bg-surface text-ink shadow-sm'
          : 'text-ink-3 hover:text-ink-2'
      }`}
    >
      <span>{label}</span>
      {isActive && (
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      )}
    </button>
  )
}

interface RangeChipProps {
  isActive: boolean
  label: string
  open: boolean
  onToggle: () => void
}

function RangeChip({ isActive, label, open, onToggle }: RangeChipProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-haspopup="dialog"
      className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        isActive
          ? 'bg-surface text-ink shadow-sm'
          : 'text-ink-3 hover:text-ink-2'
      }`}
    >
      <Calendar className="h-3 w-3" aria-hidden="true" />
      <span className="tabular-nums">{label}</span>
      <ChevronDown
        className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
        aria-hidden="true"
      />
    </button>
  )
}

interface DayPopoverProps {
  inputRef: React.RefObject<HTMLInputElement | null>
  value: string
  today: string
  onApply: (date: string) => void
  onClose: () => void
}

function DayPopover({ inputRef, value, today, onApply, onClose }: DayPopoverProps) {
  const [local, setLocal] = useState(value)
  const titleId = useId()

  useEffect(() => {
    setLocal(value)
  }, [value])

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      className="absolute right-0 top-[calc(100%+0.375rem)] z-30 w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-line bg-surface p-3 shadow-lg"
    >
      <p id={titleId} className="mb-2 text-[0.75rem] font-semibold text-ink">
        Elige un día
      </p>
      <input
        ref={inputRef}
        type="date"
        value={local}
        max={today}
        onChange={(e) => setLocal(e.target.value)}
        className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-brand"
        aria-label="Fecha del día a mostrar"
      />
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onApply(today)}
          className="text-[0.75rem] font-medium text-ink-3 hover:text-ink-2"
        >
          Hoy
        </button>
        <div className="flex items-center gap-2">
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
              if (parseIsoDate(local)) onApply(local)
            }}
            disabled={!parseIsoDate(local)}
            className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1.5 text-[0.75rem] font-semibold text-brand-ink hover:bg-brand-strong disabled:opacity-50"
          >
            <Check className="h-3 w-3" aria-hidden="true" />
            Aplicar
          </button>
        </div>
      </div>
    </div>
  )
}

interface RangePopoverProps {
  startRef: React.RefObject<HTMLInputElement | null>
  initialStart: string | null
  initialEnd: string | null
  today: string
  onApply: (start: string, end: string) => void
  onClose: () => void
}

function RangePopover({
  startRef,
  initialStart,
  initialEnd,
  today,
  onApply,
  onClose,
}: RangePopoverProps) {
  const [start, setStart] = useState(initialStart ?? '')
  const [end, setEnd] = useState(initialEnd ?? '')
  const titleId = useId()

  const startDt = parseIsoDate(start)
  const endDt = parseIsoDate(end)
  const isValid = !!(startDt && endDt)
  const isInverted = !!(startDt && endDt && endDt.getTime() < startDt.getTime())

  const days =
    startDt && endDt
      ? Math.max(
          1,
          Math.round(
            (endDt.getTime() - startDt.getTime()) / (1000 * 60 * 60 * 24),
          ) + 1,
        )
      : null

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      className="absolute right-0 top-[calc(100%+0.375rem)] z-30 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-line bg-surface p-3 shadow-lg"
    >
      <p id={titleId} className="mb-2 text-[0.75rem] font-semibold text-ink">
        Rango personalizado
      </p>
      <div className="space-y-2">
        <label className="block">
          <span className="mb-1 block text-[0.6875rem] font-medium uppercase tracking-wide text-ink-3">
            Desde
          </span>
          <input
            ref={startRef}
            type="date"
            value={start}
            max={end || today}
            onChange={(e) => setStart(e.target.value)}
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-brand"
            aria-label="Fecha de inicio del rango"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[0.6875rem] font-medium uppercase tracking-wide text-ink-3">
            Hasta
          </span>
          <input
            type="date"
            value={end}
            min={start || undefined}
            max={today}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-brand"
            aria-label="Fecha de fin del rango"
          />
        </label>
      </div>
      {days !== null && (
        <p className="mt-2 text-[0.6875rem] text-ink-3 tabular-nums">
          {isInverted
            ? 'El "hasta" es anterior al "desde" — se invertirá al aplicar.'
            : `${days} ${days === 1 ? 'día' : 'días'} en el rango.`}
        </p>
      )}
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
            if (!isValid) return
            const [s, e] = isInverted ? [end, start] : [start, end]
            onApply(s, e)
          }}
          disabled={!isValid}
          className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1.5 text-[0.75rem] font-semibold text-brand-ink hover:bg-brand-strong disabled:opacity-50"
        >
          <Check className="h-3 w-3" aria-hidden="true" />
          Aplicar
        </button>
      </div>
    </div>
  )
}
