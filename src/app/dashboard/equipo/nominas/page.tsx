import { redirect } from 'next/navigation'

// -----------------------------------------------------------------------------
// /dashboard/equipo/nominas — RUTA LEGACY. Contrato de IA: las Nóminas
// (P&L del equipo) pasan al área Informes → pestaña Nóminas. Redirect 1:1
// para no romper deep-links ni enlaces internos (patrón SaaS estándar).
// El contenido (Payroll) vive ahora en /dashboard/informes/nominas.
// -----------------------------------------------------------------------------

export default function EquipoNominasLegacyRedirect() {
  redirect('/dashboard/informes/nominas')
}
