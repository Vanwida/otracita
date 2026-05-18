import { redirect } from 'next/navigation'

// -----------------------------------------------------------------------------
// /dashboard/fidelidad — RUTA LEGACY. La tarjeta de fidelidad es ahora la
// pestaña índice del área Marketing (/dashboard/marketing). Redirect 1:1
// para no romper deep-links ni enlaces internos (patrón SaaS estándar).
// -----------------------------------------------------------------------------

export default function FidelidadLegacyRedirect() {
  redirect('/dashboard/marketing')
}
