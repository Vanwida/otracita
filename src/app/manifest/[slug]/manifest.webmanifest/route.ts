import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { publicPagePath } from '@/lib/site'

// -----------------------------------------------------------------------------
// GET /manifest/[slug]/manifest.webmanifest
//
// Per-barbería PWA manifest. When the client's customer "Adds to Home Screen"
// from /b/[slug], their OS reads this file and uses the barbería's name +
// logo + brand color for the app icon, splash screen and chrome — NOT
// otracita's branding. Each barbería effectively gets their own installable
// app on the user's phone.
// -----------------------------------------------------------------------------

export const dynamic = 'force-dynamic'

interface IconSpec {
  src: string
  sizes: string
  type?: string
  purpose?: string
}

function hexToRgba(hex: string, alpha = 1): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return `rgba(17,17,17,${alpha})`
  const int = parseInt(m[1], 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  return `rgba(${r},${g},${b},${alpha})`
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  const [client] = await db.select().from(clients).where(eq(clients.publicSlug, slug))
  if (!client || !client.publicEnabled) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const brand =
    client.brandColor && /^#[0-9a-f]{6}$/i.test(client.brandColor) ? client.brandColor : '#111111'
  // Brief background color used on iOS splash; softer than the brand so icons
  // and titles read well during the cold-start transition.
  const background = hexToRgba(brand, 0.08).replace(/[^,]+$/, '1)')

  const icons: IconSpec[] = client.brandLogoUrl
    ? [
        // Browsers / OSes will rescale the same source for all required sizes.
        // Maskable allows Android to zoom and crop to the safe area.
        { src: client.brandLogoUrl, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: client.brandLogoUrl, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: client.brandLogoUrl, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: client.brandLogoUrl, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ]
    : [
        // Fallback SVG icon endpoint generates a letter-on-brand-color square.
        { src: `/manifest/${slug}/icon.svg`, sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
        { src: `/manifest/${slug}/icon.svg`, sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
      ]

  const manifest = {
    name: client.businessName,
    short_name: client.businessName.slice(0, 12),
    description:
      client.publicDescription ||
      `Reserva tu cita en ${client.businessName} directamente desde el móvil.`,
    start_url: `${publicPagePath(slug)}?utm_source=pwa`,
    scope: publicPagePath(slug),
    display: 'standalone',
    orientation: 'portrait-primary',
    lang: 'es',
    dir: 'ltr',
    background_color: '#FFFFFF',
    theme_color: brand,
    icons,
    categories: ['business', 'lifestyle'],
    prefer_related_applications: false,
    // Share target is optional but lets the user share e.g. "my friend
    // wants this barber too" later on; placeholder for the v2 referral flow.
    ...(background ? {} : {}),
  }

  return Response.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=300',
    },
  })
}
