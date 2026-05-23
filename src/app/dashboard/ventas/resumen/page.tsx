export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { parseIsoDate, toLocalIso } from '@/lib/dashboard/period'
import { loadBreakdownForDay } from '@/lib/cash/load-breakdown'
import AreaContent from '../../_components/AreaContent'
import ClosingReport from '../../caja/ClosingReport'
import DayPicker from './DayPicker'

// -----------------------------------------------------------------------------
// /dashboard/ventas/resumen — Resumen DETALLADO del día seleccionado (#64).
//
// Antes esta pestaña era una tira de 4 KPIs + barberos. Reni necesita un
// detalle estilo "cierre de caja" pero NAVEGABLE por día — no solo la
// sesión activa. Esta página le da exactamente eso:
//
//   · Selector de día arriba (Hoy / Ayer / últimos 5 días + datepicker).
//   · ClosingReport completo abajo, alimentado por loadBreakdownForDay:
//       - Día con sesión cerrada → snapshot persistido (inmutable).
//       - Día con sesión viva → cálculo en vivo (compute.ts).
//       - Día sin sesión → sintetizado desde bookings + product_sales + tips.
//
// Multi-tenant: client se resuelve por sesión (igual que loadVentasData),
// nunca por query. El query param `d` solo elige la FECHA — el aislamiento
// va por server-side auth.
// -----------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ d?: string }>
}

export default async function VentasResumenPage({ searchParams }: PageProps) {
  const params = await searchParams
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  const todayIso = toLocalIso(new Date())

  // Validamos `?d=YYYY-MM-DD`. Vacío o inválido → hoy. No aceptamos futuros
  // (no tiene sentido un resumen del mañana — y evita confusiones de TZ).
  const requested = params.d ?? ''
  const requestedDate = parseIsoDate(requested)
  const selectedDay =
    requestedDate && requested <= todayIso ? requested : todayIso

  const breakdown = await loadBreakdownForDay(client.id, selectedDay)

  return (
    <AreaContent scroll="region" maxWidth="7xl">
      <div className="space-y-4">
        <DayPicker
          selectedDay={selectedDay}
          today={todayIso}
          source={breakdown.source}
        />

        <ClosingReport
          openingCents={breakdown.openingCents}
          openedAt={breakdown.openedAt}
          openedByEmail={breakdown.openedByEmail}
          cashExpectedCents={breakdown.cashExpectedCents}
          cardExpectedCents={breakdown.cardExpectedCents}
          onlineExpectedCents={breakdown.onlineExpectedCents}
          totals={breakdown.totals}
          byMethod={breakdown.byMethod}
          byKind={breakdown.byKind}
          byBarber={breakdown.byBarber}
          byPaymentDetail={breakdown.byPaymentDetail}
          movements={breakdown.movements}
          unknownMethodCount={breakdown.unknownMethodCount}
        />
      </div>
    </AreaContent>
  )
}
