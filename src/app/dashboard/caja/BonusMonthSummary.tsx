import { db } from '@/db'
import { bonuses, bonusEntries, barbers as barbersTable } from '@/db/schema'
import { and, asc, eq, gte, lt, sum } from 'drizzle-orm'
import { Award, CheckCircle2 } from 'lucide-react'
import { computeBonusProgress, formatBonusValue, type BonusUnit } from '@/lib/bonuses/progress'

// -----------------------------------------------------------------------------
// BonusMonthSummary — vista de SOLO LECTURA del progreso del mes en curso.
//
// El catálogo de bonos pertenece al local. Cada bono se muestra como una
// card, con TODOS los barberos activos listados debajo. Cada barbero tiene
// su propio progreso/objetivo y su propia chip "✓ Cobra X€" si llegó.
//
// Sum total comprometido arriba: suma de recompensas de TODOS los barberos
// que llegaron en CUALQUIER bono este mes. Útil para saber cuánto hay que
// pagar a fin de mes.
//
// La card se auto-oculta si no hay bonos definidos o no hay barberos.
// -----------------------------------------------------------------------------

interface Props {
  clientId: string
  /** YYYY-MM. Si null, mes actual Madrid. */
  month?: string
}

function currentMonthMadrid(): string {
  const iso = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
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

  // 1) Catálogo de bonos activos del local.
  const bonusRows = await db
    .select({
      id: bonuses.id,
      name: bonuses.name,
      unit: bonuses.unit,
      target: bonuses.target,
      rewardCents: bonuses.rewardCents,
    })
    .from(bonuses)
    .where(and(eq(bonuses.clientId, clientId), eq(bonuses.active, true)))
    .orderBy(asc(bonuses.createdAt))

  if (bonusRows.length === 0) return null

  // 2) Barberos activos del local.
  const barberRows = await db
    .select({
      id: barbersTable.id,
      name: barbersTable.name,
    })
    .from(barbersTable)
    .where(and(eq(barbersTable.clientId, clientId), eq(barbersTable.active, true)))
    .orderBy(asc(barbersTable.displayOrder), asc(barbersTable.name))

  if (barberRows.length === 0) return null

  // 3) Progreso del mes: sum(value) por (bonus_id, barber_id).
  const progressRows = await db
    .select({
      bonusId: bonusEntries.bonusId,
      barberId: bonusEntries.barberId,
      progress: sum(bonusEntries.value).as('progress'),
    })
    .from(bonusEntries)
    .where(
      and(
        eq(bonusEntries.clientId, clientId),
        gte(bonusEntries.date, bounds.start),
        lt(bonusEntries.date, bounds.end),
      ),
    )
    .groupBy(bonusEntries.bonusId, bonusEntries.barberId)

  // Map por clave compuesta para O(1) lookup.
  const progressMap = new Map<string, number>()
  for (const p of progressRows) {
    progressMap.set(`${p.bonusId}|${p.barberId}`, Number(p.progress ?? 0))
  }

  // 4) Calcular payout total comprometido este mes.
  let totalPayoutCents = 0
  for (const bonus of bonusRows) {
    for (const barber of barberRows) {
      const progress = progressMap.get(`${bonus.id}|${barber.id}`) ?? 0
      const r = computeBonusProgress({
        unit: bonus.unit as BonusUnit,
        target: bonus.target,
        rewardCents: bonus.rewardCents,
        entries: [progress],
      })
      totalPayoutCents += r.payoutCents
    }
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
            <p className="text-xs text-ink-3 mt-0.5">Quién va a cobrar este mes</p>
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
        {bonusRows.map((bonus) => (
          <div key={bonus.id} className="px-5 py-4">
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
              <p className="font-medium text-ink text-sm">{bonus.name}</p>
              <p className="text-[11px] text-ink-3">
                objetivo {formatBonusValue(bonus.target, bonus.unit as BonusUnit)} · recompensa {formatBonusValue(bonus.rewardCents, 'euros')}
              </p>
            </div>

            <ul className="space-y-2">
              {barberRows.map((barber) => {
                const progress = progressMap.get(`${bonus.id}|${barber.id}`) ?? 0
                const summary = computeBonusProgress({
                  unit: bonus.unit as BonusUnit,
                  target: bonus.target,
                  rewardCents: bonus.rewardCents,
                  entries: [progress],
                })
                const reached = summary.status === 'reached'

                return (
                  <li key={barber.id}>
                    <div className="flex items-center gap-2 flex-wrap text-sm mb-1">
                      <span className="flex-1 min-w-[120px] text-ink-2">{barber.name}</span>
                      <span className="tabular-nums text-ink-2 text-xs">
                        {formatBonusValue(summary.progress, bonus.unit as BonusUnit)}
                        <span className="text-ink-3"> / {formatBonusValue(bonus.target, bonus.unit as BonusUnit)}</span>
                      </span>
                      {reached ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success border border-success/20 px-2 py-0.5 text-xs font-semibold">
                          <CheckCircle2 className="h-3 w-3" />
                          Cobra {formatBonusValue(bonus.rewardCents, 'euros')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-overlay text-ink-3 border border-line px-2 py-0.5 text-xs">
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
