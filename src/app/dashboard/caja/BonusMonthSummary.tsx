import { db } from '@/db'
import { barberBonuses, barberBonusEntries, barbers as barbersTable } from '@/db/schema'
import { and, asc, eq, gte, lt, sum } from 'drizzle-orm'
import { Award, CheckCircle2 } from 'lucide-react'
import { computeBonusProgress, formatBonusValue, type BonusUnit } from '@/lib/bonuses/progress'

// -----------------------------------------------------------------------------
// BonusMonthSummary — vista de SOLO LECTURA del progreso del mes en curso.
// Server-rendered: una query JOIN bonos × entries-agregadas, agrupada por
// barbero. Cada bono muestra progress/objetivo + estado.
//
// El payout total mostrado es la SUMA de recompensas de los bonos que ya
// están en estado 'reached'. Útil al final del mes para el dueño saber
// cuánto dinero hay comprometido en bonos.
//
// La card se auto-oculta si no hay bonos configurados (no genera ruido).
// -----------------------------------------------------------------------------

interface Props {
  clientId: string
  /** YYYY-MM. Si null, mes actual Madrid. */
  month?: string
}

function currentMonthMadrid(): string {
  const now = new Date()
  // toLocaleDateString con timeZone:Madrid devuelve YYYY-MM-DD
  const iso = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  return iso.slice(0, 7)
}

function monthBounds(monthStr: string): { start: string; end: string } {
  const [y, m] = monthStr.split('-').map(Number)
  const start = `${y}-${String(m).padStart(2, '0')}-01`
  const nextM = m === 12 ? 1 : m + 1
  const nextY = m === 12 ? y + 1 : y
  const end = `${nextY}-${String(nextM).padStart(2, '0')}-01`
  return { start, end }
}

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function humanMonth(monthStr: string): string {
  const [y, m] = monthStr.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

export default async function BonusMonthSummary({ clientId, month }: Props) {
  const monthStr = month ?? currentMonthMadrid()
  const bounds = monthBounds(monthStr)

  // Trae todos los bonos del cliente con el nombre del barbero, y la suma
  // de entries del mes filtradas por bono. Una sola query agregada.
  const rows = await db
    .select({
      bonusId: barberBonuses.id,
      barberId: barberBonuses.barberId,
      barberName: barbersTable.name,
      name: barberBonuses.name,
      unit: barberBonuses.unit,
      target: barberBonuses.target,
      rewardCents: barberBonuses.rewardCents,
      active: barberBonuses.active,
      progress: sum(barberBonusEntries.value).as('progress'),
    })
    .from(barberBonuses)
    .innerJoin(barbersTable, eq(barberBonuses.barberId, barbersTable.id))
    .leftJoin(
      barberBonusEntries,
      and(
        eq(barberBonusEntries.bonusId, barberBonuses.id),
        gte(barberBonusEntries.date, bounds.start),
        lt(barberBonusEntries.date, bounds.end),
      ),
    )
    .where(eq(barberBonuses.clientId, clientId))
    .groupBy(barberBonuses.id, barbersTable.name)
    .orderBy(asc(barbersTable.displayOrder), asc(barbersTable.name), asc(barberBonuses.createdAt))

  if (rows.length === 0) {
    return null
  }

  // Solo mostramos bonos activos. Los desactivados no aparecen pero no se
  // eliminan — quedan disponibles para reactivar.
  const activeRows = rows.filter((r) => r.active)
  if (activeRows.length === 0) return null

  const byBarber = new Map<string, { barberName: string; bonuses: typeof activeRows }>()
  for (const r of activeRows) {
    if (!byBarber.has(r.barberId)) {
      byBarber.set(r.barberId, { barberName: r.barberName, bonuses: [] })
    }
    byBarber.get(r.barberId)!.bonuses.push(r)
  }

  // Total comprometido en bonos alcanzados este mes
  let totalPayoutCents = 0
  for (const r of activeRows) {
    const p = computeBonusProgress({
      unit: r.unit as BonusUnit,
      target: r.target,
      rewardCents: r.rewardCents,
      entries: [Number(r.progress ?? 0)],
    })
    totalPayoutCents += p.payoutCents
  }

  return (
    <div className="rounded-2xl border border-line bg-surface overflow-hidden">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-brand-softer text-brand-strong flex items-center justify-center">
            <Award className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-ink text-sm">Bonos del equipo · {humanMonth(monthStr)}</p>
            <p className="text-xs text-ink-3 mt-0.5">Progreso hacia el objetivo del mes</p>
          </div>
        </div>
        {totalPayoutCents > 0 && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-ink-3 font-semibold">
              Comprometido
            </p>
            <p className="font-display text-lg font-bold text-success tabular-nums">
              {formatBonusValue(totalPayoutCents, 'euros')}
            </p>
          </div>
        )}
      </div>

      <div className="divide-y divide-line">
        {Array.from(byBarber.values()).map(({ barberName, bonuses }) => (
          <div key={barberName} className="px-5 py-4">
            <p className="text-[11px] uppercase tracking-widest text-ink-3 font-semibold mb-2">
              {barberName}
            </p>
            <ul className="space-y-2">
              {bonuses.map((b) => {
                const progress = Number(b.progress ?? 0)
                const summary = computeBonusProgress({
                  unit: b.unit as BonusUnit,
                  target: b.target,
                  rewardCents: b.rewardCents,
                  entries: [progress],
                })
                const reached = summary.status === 'reached'

                return (
                  <li key={b.bonusId}>
                    <div className="flex items-center gap-2 flex-wrap text-sm mb-1">
                      <span className="flex-1 min-w-[140px] text-ink font-medium">{b.name}</span>
                      <span className="tabular-nums text-ink-2">
                        {formatBonusValue(summary.progress, b.unit as BonusUnit)}
                        <span className="text-ink-3"> / {formatBonusValue(b.target, b.unit as BonusUnit)}</span>
                      </span>
                      {reached ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success border border-success/20 px-2 py-0.5 text-xs font-semibold">
                          <CheckCircle2 className="h-3 w-3" />
                          Cobra {formatBonusValue(b.rewardCents, 'euros')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-overlay text-ink-2 border border-line px-2 py-0.5 text-xs">
                          {summary.pct}%
                        </span>
                      )}
                    </div>
                    <div className="h-1.5 rounded-full bg-overlay overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${summary.pct}%`,
                          backgroundColor: reached ? 'var(--color-success)' : 'var(--color-brand)',
                        }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
