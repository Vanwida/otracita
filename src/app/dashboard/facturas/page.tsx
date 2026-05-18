import { redirect } from 'next/navigation'

// -----------------------------------------------------------------------------
// /dashboard/facturas — RUTA LEGACY de la LISTA. La lista se movió a la
// pestaña Ventas → Facturas (/dashboard/ventas/facturas). El DETALLE
// (/dashboard/facturas/[id]) y la EMISIÓN MANUAL (/dashboard/facturas/nueva)
// se quedan donde estaban — son drill-downs enlazados desde muchos sitios
// (patrón Booksy: lista → detalle en ruta hija).
//
// Redirect 1:1 preservando todos los query params (month, type, showVoided,
// verifactuError) para no romper deep-links ni el banner de errores AEAT.
// -----------------------------------------------------------------------------

export default async function FacturasListLegacyRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string') qs.set(k, v)
  }
  const query = qs.toString()
  redirect(`/dashboard/ventas/facturas${query ? `?${query}` : ''}`)
}
