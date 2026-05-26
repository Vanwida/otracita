import 'server-only'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import {
  type Period,
  type PeriodSelectionInput,
  type PreviousPeriod,
  getPreviousPeriod,
  resolvePeriodSelection,
  toLocalIso,
} from '@/lib/dashboard/period'

// -----------------------------------------------------------------------------
// _report-data — resolución compartida de sesión + tenant + periodo para las
// pestañas de reporte de Informes (Ingresos · Clientes · Citas · Marketing).
// DRY: las cuatro resuelven igual el contexto; solo cambia la query de cada
// una.
//
// Multi-tenancy: el client SIEMPRE se resuelve de la sesión (email), nunca
// del request — mismo patrón que loadVentasData / atribucion. El periodo
// llega por `?period=` + opcionalmente `?date=` (day) o `?start=&end=`
// (range), y se valida con el helper puro `resolvePeriodSelection`.
//
// `periodStartIso` = YYYY-MM-DD inclusive, o null para "lifetime"/range
// inválido (sin filtro de fecha). `periodEndIso` = YYYY-MM-DD exclusive — la
// página siempre tiene un límite superior salvo en lifetime puro.
// -----------------------------------------------------------------------------

export interface ReportContext {
  client: typeof clients.$inferSelect
  period: Period
  /** Etiqueta legible en minúsculas (ej. "mes", "rango"). */
  periodLabel: string
  /** YYYY-MM-DD inclusive · null = lifetime (sin filtro de fecha). */
  periodStartIso: string | null
  /** YYYY-MM-DD exclusive. Si null (lifetime puro o range incompleto),
   *  fallback a "mañana" para que las queries `< periodEndIso` no rompan. */
  periodEndIso: string
  /**
   * Periodo previo comparable (mismo tamaño/posición, inmediatamente antes).
   * `null` para `lifetime` o rango inválido — no hay "anterior" definido.
   * Los reports lo usan para calcular deltas % vs el periodo previo y
   * mostrar tendencia en `StatStrip`.
   */
  previousPeriod: PreviousPeriod | null
}

export async function loadReportContext(
  input: PeriodSelectionInput,
): Promise<ReportContext> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const now = new Date()
  const selection = resolvePeriodSelection(input, now, 'month')

  // Fallback para `periodEndIso`: lifetime no tiene tope superior natural,
  // pero las queries existentes usan `< periodEndIso` para acotar arriba e
  // incluir hoy completo. Mantenemos "mañana" como tope cuando el resolver
  // no devuelve uno — comportamiento idéntico al previo.
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  )
  const periodEndIso = selection.periodEndIso ?? toLocalIso(tomorrow)

  const previousPeriod = getPreviousPeriod(
    selection.period,
    selection.periodStart,
    now,
    {
      date: selection.date,
      start: selection.rangeStart,
      end: selection.rangeEnd,
    },
  )

  return {
    client,
    period: selection.period,
    periodLabel: selection.periodLabel,
    periodStartIso: selection.periodStartIso,
    periodEndIso,
    previousPeriod,
  }
}
