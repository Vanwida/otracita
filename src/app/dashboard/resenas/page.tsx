import { redirect } from 'next/navigation'

// -----------------------------------------------------------------------------
// /dashboard/resenas — RUTA LEGACY. Las reseñas son ahora la pestaña
// Marketing → Reseñas. Redirect 1:1 para no romper deep-links ni enlaces
// internos (patrón SaaS estándar). El componente RatingsToggle sigue en
// este directorio (lo importa la nueva ruta) — solo se mueve la ruta.
// -----------------------------------------------------------------------------

export default function ResenasLegacyRedirect() {
  redirect('/dashboard/marketing/resenas')
}
