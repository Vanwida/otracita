import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'

// -----------------------------------------------------------------------------
// GET /manifest/[slug]/icon.svg
//
// Fallback PWA icon when the barbería hasn't uploaded a logo yet. Generates
// a square with their brand color + first letter of the business name in
// white. Scales to any size (SVG), satisfies the manifest's 192/512 slots.
// -----------------------------------------------------------------------------

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const [client] = await db.select().from(clients).where(eq(clients.publicSlug, slug))
  if (!client) {
    return new Response('Not found', { status: 404 })
  }

  const brand =
    client.brandColor && /^#[0-9a-f]{6}$/i.test(client.brandColor) ? client.brandColor : '#111111'
  const initial = (client.businessName || '?').trim().slice(0, 1).toUpperCase()

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="96" fill="${brand}" />
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="280" font-weight="700" fill="#FFFFFF">${initial}</text>
</svg>`

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
    },
  })
}
