import { resolveBarberByToken } from '@/lib/barber-auth/tenant'

// PWA manifest dinámico por barbero. El icono usa la foto del barbero
// (si tiene), si no, un placeholder. El name combina su nombre +
// "otracita" para que en la home del móvil quede claro qué app es.
//
// scope=/r/<token> deja la PWA encerrada en su propio sub-árbol — si el
// barbero abre otra URL del proyecto fuera del scope, no se queda atrapado
// en la app.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const resolved = await resolveBarberByToken(token)

  const name = resolved
    ? `${resolved.barber.name} · otracita`
    : 'otracita'
  const shortName = resolved
    ? resolved.barber.name.split(' ')[0].slice(0, 12)
    : 'otracita'

  const photoUrl = resolved?.barber.photoUrl ?? null

  const icons = photoUrl
    ? [
        {
          src: photoUrl,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
      ]
    : [
        // Fallback al icono general del proyecto.
        {
          src: '/icon.svg',
          sizes: 'any',
          type: 'image/svg+xml',
          purpose: 'any',
        },
      ]

  const body = {
    name,
    short_name: shortName,
    start_url: `/r/${token}/agenda`,
    scope: `/r/${token}`,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fff8ee',
    theme_color: '#8a5a2b',
    icons,
  }

  return Response.json(body, {
    headers: {
      'Cache-Control': 'public, max-age=300, must-revalidate',
    },
  })
}
