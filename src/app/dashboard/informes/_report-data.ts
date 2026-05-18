import 'server-only'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import {
  type Period,
  resolvePeriod,
  getPeriodStart,
  PERIOD_OPTIONS,
} from '@/lib/dashboard/period'

// -----------------------------------------------------------------------------
// _report-data — resolución compartida de sesión + tenant + periodo para las
// pestañas de reporte de Informes (Ingresos · Clientes · Citas). DRY: las
// tres resuelven igual el contexto; solo cambia la query de cada una.
//
// Multi-tenancy: el client SIEMPRE se resuelve de la sesión (email), nunca
// del request — mismo patrón que loadVentasData / atribucion. El periodo
// llega por `?period=` (StatsPeriodTabs) y se valida con el helper puro.
//
// `periodStartIso` = YYYY-MM-DD inclusive, o null para "lifetime" (sin
// filtro de fecha). `periodEndIso` = mañana (exclusivo) — incluye hoy
// completo sin depender de la hora del servidor.
// -----------------------------------------------------------------------------

export interface ReportContext {
  client: typeof clients.$inferSelect
  period: Period
  /** Etiqueta legible en minúsculas (ej. "mes", "total"). */
  periodLabel: string
  /** YYYY-MM-DD inclusive · null = lifetime (sin filtro de fecha). */
  periodStartIso: string | null
  /** YYYY-MM-DD exclusive (mañana). Acota el límite superior. */
  periodEndIso: string
}

function toLocalIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function loadReportContext(
  rawPeriod: string | undefined,
): Promise<ReportContext> {
  const period = resolvePeriod(rawPeriod, 'month')

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const now = new Date()
  const periodStart = getPeriodStart(period, now)
  const periodStartIso = periodStart ? toLocalIso(periodStart) : null

  // Límite superior = mañana (exclusivo) → hoy entra completo.
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const periodEndIso = toLocalIso(tomorrow)

  const periodLabel =
    PERIOD_OPTIONS.find((p) => p.key === period)?.label.toLowerCase() ?? period

  return { client, period, periodLabel, periodStartIso, periodEndIso }
}
