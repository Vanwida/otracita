import { db } from '@/db'
import { teamCompetitions, teamCompetitionWeeks, bookings, barbers as barbersTable } from '@/db/schema'
import { and, eq, gte, lte, sql, desc } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'
import {
  isoWeekStart,
  isoWeekEnd,
  isWeekClosed,
  rankLeaderboard,
  streakBonusFor,
  type BarberMetricRow,
} from '@/lib/competitions/leaderboard'
import { BUSINESS_TIMEZONE } from '@/lib/time'

// -----------------------------------------------------------------------------
// /api/competitions/leaderboard?competitionId=&week=YYYY-MM-DD  (R10)
//
// Ranking de barberos para la semana ISO que contiene `week` (default: hoy
// en Madrid). Métrica = la de la competición.
//
// LAZY-COMPUTE-FREEZE-ONCE (decisión 2, sin cron):
//   · Semana ABIERTA  → se computa al vuelo, NO se persiste (sigue viva).
//   · Semana CERRADA  → la 1ª lectura persiste winnerBarberId+computedAt
//     en team_competition_weeks y NUNCA se recomputa. Blinda el histórico
//     contra ediciones retroactivas de ventas / rectificativas.
//
// El "frozen winner" se respeta aunque el ranking visible se recompute
// (transparencia): solo el GANADOR cobrable queda congelado.
// -----------------------------------------------------------------------------

function todayMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE })
}

export async function GET(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'teamBonuses')
  if (gate) return gate

  const { searchParams } = new URL(request.url)
  const competitionId = searchParams.get('competitionId')
  if (!competitionId) {
    return Response.json({ error: 'competitionId requerido' }, { status: 400 })
  }
  const weekParam = searchParams.get('week')
  const refDate = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : todayMadrid()
  const weekStart = isoWeekStart(refDate)
  const weekEnd = isoWeekEnd(refDate)
  const today = todayMadrid()

  const [comp] = await db
    .select()
    .from(teamCompetitions)
    .where(
      and(eq(teamCompetitions.id, competitionId), eq(teamCompetitions.clientId, access.client.id)),
    )
  if (!comp) return Response.json({ error: 'Competición no encontrada' }, { status: 404 })

  // Barberos activos (para nombres + incluir a quien tiene 0 en el ranking).
  const barbers = await db
    .select({ id: barbersTable.id, name: barbersTable.name })
    .from(barbersTable)
    .where(and(eq(barbersTable.clientId, access.client.id), eq(barbersTable.active, true)))

  // Agregado de la métrica en la ventana [weekStart, weekEnd] (citas
  // completadas). bookings.price_cents ya está en céntimos.
  const agg = await db
    .select({
      barberId: bookings.barberId,
      revenueCents: sql<string>`COALESCE(SUM(${bookings.priceCents}), 0)`,
      bookingsCount: sql<number>`COUNT(*)::int`,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, access.client.id),
        eq(bookings.status, 'completed'),
        gte(bookings.date, weekStart),
        lte(bookings.date, weekEnd),
      ),
    )
    .groupBy(bookings.barberId)

  const valueByBarber = new Map<string, number>()
  for (const row of agg) {
    if (!row.barberId) continue
    const value =
      comp.metric === 'revenue'
        ? parseInt(row.revenueCents ?? '0', 10)
        : Number(row.bookingsCount ?? 0)
    valueByBarber.set(row.barberId, value)
  }

  const rows: BarberMetricRow[] = barbers.map((b) => ({
    barberId: b.id,
    barberName: b.name,
    value: valueByBarber.get(b.id) ?? 0,
  }))

  const live = rankLeaderboard(rows)
  const closed = isWeekClosed(weekStart, today)

  // ── FREEZE-ONCE ───────────────────────────────────────────────────────────
  // ¿Ya hay una fila congelada para (competición, semana)?
  const [frozen] = await db
    .select()
    .from(teamCompetitionWeeks)
    .where(
      and(
        eq(teamCompetitionWeeks.competitionId, comp.id),
        eq(teamCompetitionWeeks.isoWeekStart, weekStart),
      ),
    )

  let officialWinnerId: string | null
  let officialWinnerValue: number | null
  let frozenAt: string | null = null

  if (frozen) {
    // Congelado → es la verdad cobrable, pase lo que pase con ventas luego.
    officialWinnerId = frozen.winnerBarberId
    officialWinnerValue = frozen.winnerMetricValue
    frozenAt = frozen.computedAt.toISOString()
  } else if (closed) {
    // 1ª lectura tras cerrarse la semana → persistir y no recomputar nunca.
    // onConflictDoNothing: si dos lecturas concurrentes corren a la vez, una
    // gana y la otra no pisa (zero-sum garantizado por la unique).
    await db
      .insert(teamCompetitionWeeks)
      .values({
        clientId: access.client.id,
        competitionId: comp.id,
        isoWeekStart: weekStart,
        winnerBarberId: live.winnerBarberId,
        winnerMetricValue: live.winnerValue,
      })
      .onConflictDoNothing({
        target: [teamCompetitionWeeks.competitionId, teamCompetitionWeeks.isoWeekStart],
      })

    const [persisted] = await db
      .select()
      .from(teamCompetitionWeeks)
      .where(
        and(
          eq(teamCompetitionWeeks.competitionId, comp.id),
          eq(teamCompetitionWeeks.isoWeekStart, weekStart),
        ),
      )
    officialWinnerId = persisted?.winnerBarberId ?? live.winnerBarberId
    officialWinnerValue = persisted?.winnerMetricValue ?? live.winnerValue
    frozenAt = persisted?.computedAt.toISOString() ?? null
  } else {
    // Semana en curso → provisional, sin congelar.
    officialWinnerId = live.winnerBarberId
    officialWinnerValue = live.winnerValue
  }

  // Bono de racha (solo informativo en v1 — payout STANDALONE). Mira las
  // últimas N semanas YA CONGELADAS para este ganador.
  let streakBonusCents = 0
  if (officialWinnerId && comp.streakBonusCents > 0) {
    // TODO(streak-adjacency): enforce consecutive weeks when payout is folded
    // into payroll. Hoy streakBonusFor mira las últimas N filas congeladas
    // sin exigir que sean semanas adyacentes — un hueco no rompe la racha.
    // Irrelevante en v1 (R10 standalone, la racha no paga), pero quien
    // pliegue la competición a nómina debe cerrarlo.
    const recent = await db
      .select({ winnerBarberId: teamCompetitionWeeks.winnerBarberId })
      .from(teamCompetitionWeeks)
      .where(
        and(
          eq(teamCompetitionWeeks.competitionId, comp.id),
          lte(teamCompetitionWeeks.isoWeekStart, weekStart),
        ),
      )
      .orderBy(desc(teamCompetitionWeeks.isoWeekStart))
      .limit(comp.streakWeeksForBonus)
    streakBonusCents = streakBonusFor({
      barberId: officialWinnerId,
      recentWinnersDesc: recent.map((r) => r.winnerBarberId),
      streakWeeksForBonus: comp.streakWeeksForBonus,
      streakBonusCents: comp.streakBonusCents,
    })
  }

  return Response.json({
    competition: {
      id: comp.id,
      name: comp.name,
      metric: comp.metric,
      rewardCentsPerWeek: comp.rewardCentsPerWeek,
      streakWeeksForBonus: comp.streakWeeksForBonus,
      streakBonusCents: comp.streakBonusCents,
    },
    week: { start: weekStart, end: weekEnd, closed },
    leaderboard: live.entries,
    winner: {
      barberId: officialWinnerId,
      metricValue: officialWinnerValue,
      frozen: !!frozen || (closed && !!officialWinnerId),
      frozenAt,
      rewardCents: officialWinnerId ? comp.rewardCentsPerWeek : 0,
      streakBonusCents,
    },
  })
}
