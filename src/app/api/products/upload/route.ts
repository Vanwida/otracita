import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// POST /api/products/upload
//
// Endpoint client-upload pattern (mismo que /api/public-page/upload pero
// con scope `products/{clientId}/`). El navegador POSTea aquí para obtener
// un token firmado, luego sube el archivo directo a Vercel Blob.
//
// Ventaja: el archivo NO pasa por nuestra serverless function — supera el
// límite de 4.5 MB de body, más rápido + más barato en function-seconds.
//
// Seguridad:
//   · Auth verificada AQUÍ (short-circuit) y de nuevo dentro del callback
//     onBeforeGenerateToken para evitar que un atacante salte la primera.
//   · Pathname forzado bajo `products/{clientId}/{timestamp}.{ext}` para
//     que un tenant no pueda escribir en la carpeta de otro.
//   · Tamaño máx 5 MB; tipos solo imagen.
// -----------------------------------------------------------------------------

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export async function POST(req: Request) {
  // Auth previa (short-circuit). Volvemos a comprobar dentro del callback.
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)

  const body = (await req.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        // Re-verificar auth — el callback recibe el body original, no
        // confiamos en que el cliente no haya cambiado la sesión.
        const access2 = await requireClientAccess(req)
        if (!access2.ok) throw new Error('Unauthorized')

        const ext = (/\.([a-z0-9]{2,5})$/i.exec(pathname)?.[1] ?? 'jpg').toLowerCase()
        const safePath = `products/${access2.client.id}/${Date.now()}.${ext}`
        return {
          allowedContentTypes: ALLOWED_MIME,
          maximumSizeInBytes: MAX_BYTES,
          tokenPayload: JSON.stringify({ clientId: access2.client.id, safePath }),
          addRandomSuffix: false,
          pathname: safePath,
        }
      },
      onUploadCompleted: async () => {
        // No-op: la URL final devuelta al cliente es la que usa el form
        // para guardarla en products.image_url al PATCH/POST.
      },
    })
    return Response.json(jsonResponse)
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? 'Upload failed' },
      { status: 400 },
    )
  }
}
