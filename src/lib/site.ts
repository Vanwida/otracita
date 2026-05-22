// -----------------------------------------------------------------------------
// site — URLs canónicas del producto otracita.
//
// ÚNICA fuente. Antes existían 7+ `'https://otracita.es'` regados (auth,
// stripe portal, legal verifactu, BotActivationStatus, PublicPageSettings,
// AppPage…). El día que se cambie el dominio (otracita.com, multi-env staging,
// fork por marca) había que cazar literales por todo el repo. Aquí, una línea.
//
// Override por env: `NEXT_PUBLIC_SITE_URL` gana al default. Los webhooks y
// callbacks (Stripe, WhatsApp Cloud API) NECESITAN el override en preview /
// staging — el default sólo aplica si no hay env (build local, fallback).
// -----------------------------------------------------------------------------

/** Origen canónico del producto (sin trailing slash). */
export const SITE_ORIGIN: string =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://otracita.es'

/** Construye una URL absoluta a partir de un path relativo. Garantiza un
 *  solo slash entre el origen y el path. */
export function siteUrl(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  return `${SITE_ORIGIN}${clean}`
}

/** Rutas internas usadas como callbacks externos (Stripe return, admin,
 *  legal). Centralizadas aquí para que el día que renombremos `/mi-plan` →
 *  `/billing`, un solo grep alcance todos los webhooks. */
export const SITE_ROUTES = {
  admin: '/admin',
  miPlan: '/dashboard/mi-plan',
  legalVerifactu: '/legal/verifactu',
  legalVerifactuHistorico: '/legal/verifactu/historico',
} as const

/** Helpers — URLs absolutas para callbacks/webhooks. */
export const SITE_URLS = {
  admin: () => siteUrl(SITE_ROUTES.admin),
  miPlan: () => siteUrl(SITE_ROUTES.miPlan),
  legalVerifactu: () => siteUrl(SITE_ROUTES.legalVerifactu),
  legalVerifactuHistorico: () => siteUrl(SITE_ROUTES.legalVerifactuHistorico),
}

// -----------------------------------------------------------------------------
// PWA pública (por slug de barbería). Estas rutas las construyen ~9 sitios
// distintos (manifest, cron de recordatorios, followup post-cita, promos,
// admin, setup, bookings/create…). Si algún día `/<slug>` se renombra a
// `/booking/` o `/agendalo/`, los helpers de aquí concentran el cambio.
//
// Convención: paths RELATIVOS (empiezan con `/`). El caller decide si los
// pasa a `siteUrl()` para hacerlos absolutos o los usa tal cual para hrefs
// internos / push payloads.
// -----------------------------------------------------------------------------

/** Home de la PWA pública para una barbería (`/<slug>`). */
export function publicPagePath(slug: string): string {
  return `/${slug}`
}

/** "Mi cuenta" del cliente en la PWA (`/<slug>/cuenta`). */
export function publicAccountPath(slug: string): string {
  return `/${slug}/cuenta`
}

/** Página de valoración de una reserva concreta (`/<slug>/cuenta/rate/<bookingId>`). */
export function publicRatePath(slug: string, bookingId: string): string {
  return `/${slug}/cuenta/rate/${bookingId}`
}
