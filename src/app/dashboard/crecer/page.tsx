import { redirect } from 'next/navigation'

// -----------------------------------------------------------------------------
// /dashboard/crecer — RUTA LEGACY. El hub "Crecer" se disolvió: su contenido
// se repartió en áreas estándar con nombre propio — Clientes (ficha,
// fidelidad, reseñas) y Marketing (promos, bot, tienda). Ya no hay una
// landing de tarjetas intermedia; el rail lleva directo a cada área.
//
// Redirect a Marketing (la parte "crecer el negocio" más activa). Patrón
// SaaS estándar: preservar la URL vieja, redirigir a la nueva IA.
// -----------------------------------------------------------------------------

export default function CrecerLegacyRedirect() {
  redirect('/dashboard/marketing')
}
