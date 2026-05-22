// -----------------------------------------------------------------------------
// GET /dashboard/manifest.webmanifest
//
// PWA manifest del DASHBOARD de otracita (barberos / staff). Distinto al
// manifest por-tenant en `/manifest/[slug]/manifest.webmanifest`:
//
//   · El dashboard es genérico (mismo branding otracita para todos los
//     tenants), no necesita resolver cliente por slug.
//   · `scope` y `start_url` son `/dashboard` para que la PWA instalada
//     SOLO controle el área admin — al abrirla cae directo en el panel,
//     no en la landing.
//   · Iconos generados desde `public/logo.png` (placeholders 192/512 +
//     apple-touch). Reemplazar por iconos producto cuando Alex prepare
//     los definitivos en `/public/dashboard-icons/`.
// -----------------------------------------------------------------------------
//
// Branding tokens (espejo de globals.css `:root`):
//   --color-brand:  #C9653C  (terracota)
//   --color-canvas: #F7F3EE  (cream cálido)
//
// Si esos cambian en globals.css hay que actualizarlos aquí también —
// los manifests son JSON estático servido al SO del usuario, no consumen
// CSS variables.
// -----------------------------------------------------------------------------

export const dynamic = 'force-static'

const BRAND = '#C9653C'
const CANVAS = '#F7F3EE'

export function GET() {
  const manifest = {
    name: 'otracita · Dashboard',
    short_name: 'otracita',
    description:
      'Gestiona tu barbería desde el iPad o el móvil: agenda, caja, fidelidad, facturas y bot.',
    start_url: '/dashboard',
    scope: '/dashboard',
    id: '/dashboard',
    display: 'standalone',
    orientation: 'any',
    lang: 'es',
    dir: 'ltr',
    background_color: CANVAS,
    theme_color: BRAND,
    categories: ['business', 'productivity'],
    prefer_related_applications: false,
    icons: [
      {
        src: '/dashboard-icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/dashboard-icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/dashboard-icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }

  return Response.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
    },
  })
}
