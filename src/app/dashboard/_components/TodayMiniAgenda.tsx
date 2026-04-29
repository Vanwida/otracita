import Link from 'next/link'
import { Calendar, Clock, ChevronRight, Scissors, User } from 'lucide-react'

// -----------------------------------------------------------------------------
// TodayMiniAgenda — vista compacta de hoy en /dashboard.
//
// Muestra las citas de hoy intercaladas con marcadores de hueco entre cita
// y cita (si el hueco es ≥30 min). El barbero ve "qué llenar" sin tener
// que ir a /dashboard/agenda.
//
// Solo muestra hasta 8 items (citas + huecos) para no saturar el dashboard;
// link "Ver agenda" lleva al detalle completo.
// -----------------------------------------------------------------------------

const MIN_GAP_MINUTES = 30
const MAX_ITEMS = 8

export interface MiniBooking {
  id: string
  time: string             // HH:MM
  duration: number         // minutos
  customerName: string | null
  customerPhone: string
  service: string
  barber: string | null
  status: string           // 'confirmed' | 'completed' | 'no_show' | 'cancelled'
}

interface Props {
  bookings: MiniBooking[]   // ya filtradas a hoy, ordenadas asc por time
  /** Horario shop hoy. null si cerrado o no configurado. */
  shopHours: { start: string; end: string } | null
  /** Hora actual HH:MM en zona Madrid — para no marcar huecos pasados. */
  nowTime: string
}

type Item =
  | { kind: 'booking'; booking: MiniBooking }
  | { kind: 'gap'; start: string; end: string; minutes: number }

function parseMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
function fmtMin(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export default function TodayMiniAgenda({ bookings, shopHours, nowTime }: Props) {
  // Construir items (bookings + huecos intercalados).
  const activeBookings = bookings
    .filter((b) => b.status !== 'cancelled')
    .sort((a, b) => a.time.localeCompare(b.time))

  const items: Item[] = []
  if (shopHours) {
    const openMin = Math.max(parseMin(shopHours.start), parseMin(nowTime))
    const closeMin = parseMin(shopHours.end)

    let cursor = openMin
    for (const b of activeBookings) {
      const bStart = parseMin(b.time)
      const bEnd = bStart + b.duration

      // Hueco antes de esta cita?
      if (bStart - cursor >= MIN_GAP_MINUTES) {
        items.push({ kind: 'gap', start: fmtMin(cursor), end: fmtMin(bStart), minutes: bStart - cursor })
      }

      items.push({ kind: 'booking', booking: b })
      cursor = Math.max(cursor, bEnd)
    }

    // Hueco final hasta el cierre?
    if (closeMin - cursor >= MIN_GAP_MINUTES) {
      items.push({ kind: 'gap', start: fmtMin(cursor), end: fmtMin(closeMin), minutes: closeMin - cursor })
    }
  } else {
    // Sin horario configurado, solo mostramos las citas (sin huecos).
    for (const b of activeBookings) {
      items.push({ kind: 'booking', booking: b })
    }
  }

  const visible = items.slice(0, MAX_ITEMS)
  const hidden = items.length - visible.length

  return (
    <section className="bg-surface border border-line rounded-2xl overflow-hidden">
      <header className="px-5 py-4 border-b border-line flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-ink uppercase tracking-widest">Hoy</h2>
          <span className="text-xs text-ink-3 ml-2">
            {activeBookings.length} {activeBookings.length === 1 ? 'cita' : 'citas'}
          </span>
        </div>
        <Link
          href="/dashboard/agenda"
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand-strong transition-colors"
        >
          Ver agenda
          <ChevronRight className="h-3 w-3" />
        </Link>
      </header>

      {items.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <Calendar className="h-7 w-7 text-ink-3 mx-auto mb-2" />
          <p className="text-sm text-ink-3">
            {shopHours ? 'No hay citas para hoy.' : 'Sin horario configurado.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((item, idx) =>
            item.kind === 'booking' ? (
              <BookingRow key={item.booking.id} booking={item.booking} />
            ) : (
              <GapRow key={`gap-${idx}-${item.start}`} start={item.start} end={item.end} minutes={item.minutes} />
            ),
          )}
          {hidden > 0 && (
            <li className="px-5 py-3 text-center">
              <Link
                href="/dashboard/agenda"
                className="text-xs text-ink-2 hover:text-ink"
              >
                +{hidden} más en la agenda
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

function BookingRow({ booking }: { booking: MiniBooking }) {
  const isCompleted = booking.status === 'completed'
  const isNoShow = booking.status === 'no_show'
  return (
    <li className={`px-5 py-3 flex items-center gap-3 ${isNoShow ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-1.5 w-14 shrink-0">
        <Clock className="h-3.5 w-3.5 text-ink-3" />
        <span className="text-sm font-mono text-ink-2 tabular-nums">{booking.time}</span>
      </div>
      <div className="h-7 w-7 rounded-full bg-overlay border border-line flex items-center justify-center shrink-0">
        <User className="h-3.5 w-3.5 text-ink-3" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink font-medium truncate">
          {booking.customerName || booking.customerPhone}
        </p>
        <p className="text-xs text-ink-3 truncate flex items-center gap-1">
          <Scissors className="h-3 w-3 shrink-0" />
          {booking.service}
          {booking.barber && <span> · {booking.barber}</span>}
        </p>
      </div>
      {isCompleted && (
        <span className="shrink-0 text-[10px] uppercase tracking-widest text-success font-semibold">Hecha</span>
      )}
      {isNoShow && (
        <span className="shrink-0 text-[10px] uppercase tracking-widest text-danger font-semibold">No vino</span>
      )}
    </li>
  )
}

function GapRow({ start, end, minutes }: { start: string; end: string; minutes: number }) {
  const label = minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 > 0 ? ` ${minutes % 60}m` : ''}` : `${minutes} min`
  return (
    <li className="px-5 py-2.5 flex items-center gap-3 bg-overlay/40">
      <div className="flex items-center gap-1.5 w-14 shrink-0">
        <span className="text-xs font-mono text-ink-3 tabular-nums">{start}</span>
      </div>
      <div className="h-7 w-7 rounded-full border border-dashed border-line shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs uppercase tracking-widest text-ink-3 font-semibold">
          Hueco · {label}
        </p>
        <p className="text-xs text-ink-3">
          {start}–{end}
        </p>
      </div>
    </li>
  )
}
