import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// POST /api/public-page/upload
//
// Client-upload pattern: the browser POSTs here to get a short-lived
// signed upload token, then PUTs the file directly to Vercel Blob. This
// bypasses the 4.5 MB Vercel Function body limit entirely — a 5 MB cover
// photo goes straight to Blob without ever flowing through our serverless
// function, which also makes uploads faster and cheaper in function-seconds.
//
// Security:
//   · The "before token" callback verifies the tenant session and stamps
//     the pathname with {clientId}/{kind} so a tenant can't write under
//     another tenant's folder.
//   · Max size enforced via `maximumSizeInBytes`.
//   · Allowed content types restricted to images.
// -----------------------------------------------------------------------------

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]

export async function POST(request: Request) {
  // Auth happens inside handleUpload's onBeforeGenerateToken so we can
  // stamp the token with tenant scope. But we still enforce auth here
  // too — if the user isn't in a valid session, short-circuit.
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)

  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // `pathname` is the filename the client suggested. We force it
        // under `public-pages/{clientId}/{kind}-{timestamp}.{ext}` so the
        // tenant scope is in the path and other tenants can't overwrite.
        const m = /(logo-alt|logo|cover)\.([a-z0-9]{2,5})$/i.exec(pathname)
        const kind = m?.[1]?.toLowerCase() ?? 'misc'
        const ext = m?.[2]?.toLowerCase() ?? 'bin'
        const scopedPath = `public-pages/${access.client.id}/${kind}-${Date.now()}.${ext}`
        return {
          allowedContentTypes: ALLOWED_MIME,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ clientId: access.client.id, scopedPath }),
          // Ask the Blob service to store under the scoped path, not the
          // original name the browser sent.
          pathname: scopedPath,
        }
      },
      onUploadCompleted: async () => {
        // No-op: the client PATCHes the resulting URL into clients table
        // via /api/public-page/config after the upload resolves. Keeping
        // the callback defined so the handshake protocol is honoured.
      },
    })

    return Response.json(jsonResponse)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    console.error('[public-page/upload] handleUpload error:', message)
    return Response.json({ error: message }, { status: 400 })
  }
}
