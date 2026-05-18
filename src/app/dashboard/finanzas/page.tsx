import { redirect } from 'next/navigation'

// -----------------------------------------------------------------------------
// /dashboard/finanzas — RUTA LEGACY. El área se renombró a "Informes"
// (nomenclatura estándar). Redirect 1:1 preservando ?month para no romper
// deep-links ni los enlaces internos existentes (patrón SaaS estándar).
// El P&L vive ahora en /dashboard/informes.
// -----------------------------------------------------------------------------

export default async function FinanzasLegacyRedirect({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month } = await searchParams
  redirect(`/dashboard/informes${month ? `?month=${month}` : ''}`)
}
