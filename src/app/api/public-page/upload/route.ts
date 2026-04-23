import { put } from '@vercel/blob'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// POST /api/public-page/upload?kind=logo|cover
//
// Accepts a multipart/form-data file (or a raw body), stores it in Vercel
// Blob under a tenant-scoped path, and returns the public URL. The caller
// (PublicPageSettings) then PATCHes the URL into clients.brand_logo_url or
// brand_cover_url with the regular /api/public-page/config endpoint.
//
// Constraints (keep costs + abuse under control):
//   · Max 3 MB per file — enough for a logo/cover at reasonable resolution.
//   · Only image mime types.
//   · Tenant-scoped key: `public-pages/<clientId>/<kind>-<timestamp>.<ext>`.
//     Older uploads for the same kind are orphaned — Vercel Blob has no
//     cleanup built-in; acceptable at our volume (cents/month).
// -----------------------------------------------------------------------------

const MAX_BYTES = 3 * 1024 * 1024 // 3 MB
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
])
const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

export async function POST(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)

  const url = new URL(req.url)
  const kind = url.searchParams.get('kind')
  if (kind !== 'logo' && kind !== 'cover') {
    return Response.json({ error: 'kind debe ser "logo" o "cover"' }, { status: 400 })
  }

  // Accept both multipart (<input type=file>) and raw body (fetch PUT).
  const contentType = req.headers.get('content-type') || ''
  let file: File | null = null

  if (contentType.startsWith('multipart/form-data')) {
    const form = await req.formData()
    const entry = form.get('file')
    if (entry instanceof File) file = entry
  } else if (contentType.startsWith('image/')) {
    const buf = await req.arrayBuffer()
    file = new File([buf], `upload.${MIME_EXT[contentType] ?? 'bin'}`, { type: contentType })
  }

  if (!file) {
    return Response.json({ error: 'No se ha enviado ningún archivo.' }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return Response.json({ error: 'Formato no admitido. Usa PNG, JPG, WEBP, GIF o SVG.' }, { status: 415 })
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `Máximo ${Math.floor(MAX_BYTES / 1024 / 1024)} MB.` },
      { status: 413 },
    )
  }

  const ext = MIME_EXT[file.type] ?? 'bin'
  const key = `public-pages/${access.client.id}/${kind}-${Date.now()}.${ext}`

  const blob = await put(key, file, {
    access: 'public',
    contentType: file.type,
    // Let Vercel Blob add a random suffix — prevents cache collisions when a
    // barber re-uploads with the same filename.
    addRandomSuffix: true,
  })

  return Response.json({ url: blob.url })
}
