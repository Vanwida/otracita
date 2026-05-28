import {
  CalendarPlus,
  CalendarCheck,
  MoveHorizontal,
  Maximize2,
  CalendarX2,
  UserX,
  CheckCircle2,
  Banknote,
  BellRing,
  Circle,
  type LucideIcon,
} from 'lucide-react'
import type { BookingEventType, BookingEventActor } from '@/lib/bookings/events'

// -----------------------------------------------------------------------------
// event-meta — presentación de un evento de cita (task #107). Fuente ÚNICA
// del icono + tono (clases de token semántico) + etiqueta corta por tipo, para
// que el timeline del detalle y la vista global de Informes pinten idéntico.
//
// Tokens semánticos (globals.css). NUNCA hex inline ni bg-gray-*.
// -----------------------------------------------------------------------------

export interface BookingEventMeta {
  /** Icono lucide. */
  Icon: LucideIcon
  /** Etiqueta corta en castellano para chips/filtros. */
  label: string
  /** Clase de color del icono/punto (token semántico). */
  toneText: string
  /** Clase de fondo suave para el círculo del icono (token semántico). */
  toneBg: string
}

export const BOOKING_EVENT_META: Record<BookingEventType, BookingEventMeta> = {
  created: {
    Icon: CalendarPlus,
    label: 'Creada',
    toneText: 'text-brand-strong',
    toneBg: 'bg-brand-softer',
  },
  confirmed: {
    Icon: CalendarCheck,
    label: 'Confirmada',
    toneText: 'text-brand-strong',
    toneBg: 'bg-brand-softer',
  },
  moved: {
    Icon: MoveHorizontal,
    label: 'Movida',
    toneText: 'text-ink',
    toneBg: 'bg-overlay',
  },
  resized: {
    Icon: Maximize2,
    label: 'Duración',
    toneText: 'text-ink',
    toneBg: 'bg-overlay',
  },
  cancelled: {
    Icon: CalendarX2,
    label: 'Cancelada',
    toneText: 'text-danger',
    toneBg: 'bg-danger/10',
  },
  no_show: {
    Icon: UserX,
    label: 'No-show',
    toneText: 'text-danger',
    toneBg: 'bg-danger/10',
  },
  completed: {
    Icon: CheckCircle2,
    label: 'Completada',
    toneText: 'text-success',
    toneBg: 'bg-success/10',
  },
  charged: {
    Icon: Banknote,
    label: 'Cobrada',
    toneText: 'text-success',
    toneBg: 'bg-success/10',
  },
  reminder_sent: {
    Icon: BellRing,
    label: 'Recordatorio',
    toneText: 'text-ink-2',
    toneBg: 'bg-overlay',
  },
}

/** Meta segura: tipos desconocidos (DB con valor nuevo) caen a un neutro. */
export function bookingEventMeta(type: string): BookingEventMeta {
  return (
    BOOKING_EVENT_META[type as BookingEventType] ?? {
      Icon: Circle,
      label: type,
      toneText: 'text-ink-2',
      toneBg: 'bg-overlay',
    }
  )
}

/** Etiqueta legible del actor para mostrar junto al summary. */
export function actorLabelText(
  actor: string,
  actorLabel: string | null,
): string {
  if (actorLabel && actorLabel.trim()) return actorLabel.trim()
  const map: Record<BookingEventActor, string> = {
    customer: 'Cliente',
    barber: 'Barbero',
    admin: 'Tienda',
    bot: 'Bot',
    system: 'Sistema',
  }
  return map[actor as BookingEventActor] ?? actor
}

/** Lista ordenada de tipos para filtros (vista global). */
export const BOOKING_EVENT_TYPES_ORDERED: BookingEventType[] = [
  'created',
  'confirmed',
  'moved',
  'resized',
  'cancelled',
  'no_show',
  'completed',
  'charged',
  'reminder_sent',
]

// -----------------------------------------------------------------------------
// Tiempo relativo en castellano ("hace 2h", "ayer 18:30", "12 may 18:30").
// Sin dependencias extra — date-fns relative locale es verboso; este formato
// es el que usa el resto de superficies operativas.
// -----------------------------------------------------------------------------
export function formatRelativeEs(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.round(diffMs / 60000)

  if (diffMin < 1) return 'ahora mismo'
  if (diffMin < 60) return `hace ${diffMin} min`

  const diffH = Math.round(diffMin / 60)
  if (diffH < 24 && now.getDate() === date.getDate()) {
    return `hace ${diffH} h`
  }

  const hhmm = new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  if (sameDay(date, now)) return `hoy ${hhmm}`
  if (sameDay(date, yesterday)) return `ayer ${hhmm}`

  const sameYear = date.getFullYear() === now.getFullYear()
  const dateLabel = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date)
  return `${dateLabel} ${hhmm}`
}
