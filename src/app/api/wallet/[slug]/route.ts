import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { buildPassForClient, WalletConfigError } from '@/lib/wallet/pass'

// -----------------------------------------------------------------------------
// GET /api/wallet/[slug]
//
// Descarga el .pkpass de la barbería identificada por slug. SIN auth — la
// info que va dentro del pass (nombre, dirección, teléfono, link a la PWA)
// ya es pública en /[slug]. El barbero comparte este link igual que el QR
// de la PWA; al abrirlo desde un iPhone, iOS lo añade a Wallet.
//
// 404 si el slug no existe o `publicEnabled = false` (mismo criterio que la
// PWA). 503 si los certs Wallet no están configurados — el endpoint no se
// rompe, devuelve un JSON legible para que el barbero entienda que está
// pendiente de provisión.
// -----------------------------------------------------------------------------

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  const [client] = await db.select().from(clients).where(eq(clients.publicSlug, slug))
  if (!client || !client.publicEnabled) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const { buffer } = await buildPassForClient(client)
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="${slug}.pkpass"`,
        // No cache: cada descarga regenera authenticationToken. Si en
        // V1.5 persistimos el token, podemos cachear con Vary por slug.
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (err) {
    if (err instanceof WalletConfigError) {
      return Response.json(
        {
          error: 'wallet_not_configured',
          message:
            'El .pkpass requiere certificados de Apple Wallet que aún no están provisionados. Vuelve más tarde.',
        },
        { status: 503 },
      )
    }
    // Loggear con contexto (slug) pero no exponer detalles internos.
    console.error('[wallet] buildPassForClient failed', { slug, err })
    return Response.json(
      { error: 'internal_error', message: 'No se pudo generar el pass.' },
      { status: 500 },
    )
  }
}
