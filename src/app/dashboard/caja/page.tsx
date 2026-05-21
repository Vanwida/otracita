import { redirect } from 'next/navigation'

// -----------------------------------------------------------------------------
// /dashboard/caja — RUTA LEGACY. El área se renombró a "Ventas" (nomenclatura
// estándar de software de gestión) y se reestructuró en pestañas Booksy.
//
// Se conserva como redirect 1:1 para no romper deep-links ni los ~20 enlaces
// internos existentes (patrón SaaS estándar: preservar URLs viejas, redirigir
// a la nueva IA). Los selectores de periodo (?period= + date/start/end) se
// preservan al saltar a la nueva URL.
// -----------------------------------------------------------------------------

export default async function CajaLegacyRedirect({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string
    date?: string
    start?: string
    end?: string
  }>
}) {
  const params = await searchParams
  const qs = new URLSearchParams()
  if (params.period) qs.set('period', params.period)
  if (params.date) qs.set('date', params.date)
  if (params.start) qs.set('start', params.start)
  if (params.end) qs.set('end', params.end)
  const query = qs.toString()
  redirect(`/dashboard/ventas${query ? `?${query}` : ''}`)
}
