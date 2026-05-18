import { redirect } from 'next/navigation'

// -----------------------------------------------------------------------------
// /dashboard/negocio — RUTA LEGACY. Los datos del negocio son ahora la
// pestaña índice del área Ajustes (/dashboard/ajustes). Redirect 1:1 para
// no romper deep-links ni enlaces internos (patrón SaaS estándar).
// -----------------------------------------------------------------------------

export default function NegocioLegacyRedirect() {
  redirect('/dashboard/ajustes')
}
