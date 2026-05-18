import { redirect } from 'next/navigation'

// -----------------------------------------------------------------------------
// /dashboard/caja — RUTA LEGACY. El área se renombró a "Ventas" (nomenclatura
// estándar de software de gestión) y se reestructuró en pestañas Booksy.
//
// Se conserva como redirect 1:1 para no romper deep-links ni los ~20 enlaces
// internos existentes (patrón SaaS estándar: preservar URLs viejas, redirigir
// a la nueva IA). El selector de periodo (?period=) se preserva.
// -----------------------------------------------------------------------------

export default async function CajaLegacyRedirect({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period } = await searchParams
  redirect(`/dashboard/ventas${period ? `?period=${period}` : ''}`)
}
