import { redirect } from 'next/navigation'

// -----------------------------------------------------------------------------
// /dashboard/ajustes/reservas — RUTA LEGACY. La pestaña "Reservas online"
// se eliminó del menú porque era duplicado conceptual con la pestaña "App"
// de Crecimiento (mismo editor canónico PublicPageSettings, misma persistencia,
// mismas decisiones de marca). Se redirige a /dashboard/app (sub-tab App
// dentro del área Crecimiento) para no romper deep-links históricos
// (emails de onboarding, bookmarks, docs).
// -----------------------------------------------------------------------------

export default function AjustesReservasLegacyRedirect() {
  redirect('/dashboard/app')
}
