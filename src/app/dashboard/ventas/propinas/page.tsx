import { redirect } from 'next/navigation'

// -----------------------------------------------------------------------------
// Redirect legacy — Propinas dejó de ser pestaña de Ventas (U-13). Es un
// informe de reparto (cash vs card, pendiente de entregar vía nómina), no una
// vía de cobro: vive en /dashboard/informes/propinas. Stub para no romper
// deep-links antiguos.
// -----------------------------------------------------------------------------

export default function VentasPropinasRedirect() {
  redirect('/dashboard/informes/propinas')
}
