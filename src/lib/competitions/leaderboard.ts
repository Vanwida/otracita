// -----------------------------------------------------------------------------
// R10 — competición semanal de equipo. Lógica PURA (sin DB) para:
//   · resolver la semana ISO de una fecha (lunes→domingo, Europe/Madrid),
//   · rankear barberos por una métrica dentro de esa semana,
//   · decidir el ganador zero-sum (1 por semana; desempate determinista).
//
// El "freeze once" (persistir el ganador la 1ª lectura tras cerrarse la
// semana y no recomputar nunca) se orquesta en la API — aquí solo está la
// matemática para que sea testeable sin montar Postgres.
//
// Fechas: el repo usa strings 'YYYY-MM-DD' en horario Madrid (bookings.date
// es texto). Trabajamos en ese mismo espacio para no introducir un TZ nuevo.
// -----------------------------------------------------------------------------

export type CompetitionMetric = 'revenue' | 'bookings'

/** Lunes (YYYY-MM-DD) de la semana ISO que contiene `dateStr`. ISO: la
 *  semana empieza en lunes. Cálculo en UTC puro sobre la fecha civil para
 *  evitar saltos de DST (no hay hora, solo día). */
export function isoWeekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  // getUTCDay: 0=domingo … 6=sábado. ISO quiere lunes=0 … domingo=6.
  const isoDow = (dt.getUTCDay() + 6) % 7
  dt.setUTCDate(dt.getUTCDate() - isoDow)
  return dt.toISOString().slice(0, 10)
}

/** Domingo (YYYY-MM-DD) de la semana ISO que contiene `dateStr`. */
export function isoWeekEnd(dateStr: string): string {
  const start = isoWeekStart(dateStr)
  const [y, m, d] = start.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 6)
  return dt.toISOString().slice(0, 10)
}

/** ¿Esa semana ISO ya cerró respecto a `today`? True si hoy es estrictamente
 *  posterior al domingo de la semana → el resultado puede congelarse. */
export function isWeekClosed(isoWeekStartStr: string, today: string): boolean {
  return today > isoWeekEnd(isoWeekStartStr)
}

export interface BarberMetricRow {
  barberId: string
  barberName: string
  /** Valor de la métrica en la semana. revenue ⇒ cents; bookings ⇒ nº. */
  value: number
}

export interface LeaderboardEntry extends BarberMetricRow {
  rank: number
  isWinner: boolean
}

/**
 * Ordena de mayor a menor valor. El ganador es el primero con valor > 0.
 * Desempate DETERMINISTA por barberId (orden lexicográfico) — sin azar,
 * para que congelar y recomputar den siempre lo mismo. Empate a 0 ⇒ sin
 * ganador (no se reparte premio una semana sin actividad).
 */
export function rankLeaderboard(rows: BarberMetricRow[]): {
  entries: LeaderboardEntry[]
  winnerBarberId: string | null
  winnerValue: number | null
} {
  const sorted = [...rows].sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value
    return a.barberId < b.barberId ? -1 : a.barberId > b.barberId ? 1 : 0
  })

  const top = sorted[0]
  const hasWinner = !!top && top.value > 0
  const winnerBarberId = hasWinner ? top.barberId : null
  const winnerValue = hasWinner ? top.value : null

  const entries: LeaderboardEntry[] = sorted.map((r, i) => ({
    ...r,
    rank: i + 1,
    isWinner: hasWinner && r.barberId === winnerBarberId,
  }))

  return { entries, winnerBarberId, winnerValue }
}

/**
 * Bono de racha: si el mismo barbero ganó las últimas `streakWeeksForBonus`
 * semanas consecutivas (incluida la recién cerrada), cobra `streakBonusCents`
 * además del premio semanal. `recentWinnersDesc` = ganadores de las últimas
 * N semanas, más reciente primero (un null rompe la racha).
 */
export function streakBonusFor(args: {
  barberId: string
  recentWinnersDesc: (string | null)[]
  streakWeeksForBonus: number
  streakBonusCents: number
}): number {
  if (args.streakBonusCents <= 0 || args.streakWeeksForBonus <= 0) return 0
  if (args.recentWinnersDesc.length < args.streakWeeksForBonus) return 0
  for (let i = 0; i < args.streakWeeksForBonus; i++) {
    if (args.recentWinnersDesc[i] !== args.barberId) return 0
  }
  return args.streakBonusCents
}
