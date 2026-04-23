import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { ensureUniqueSlug, isValidSlug, slugifyName } from '@/lib/slug'

// -----------------------------------------------------------------------------
// PATCH /api/public-page/config
//
// Tenant-authenticated endpoint backing the "Página pública" tab on
// /dashboard/negocio. Updates the slug + branding fields for the public
// /b/[slug] page. Slug conflicts are resolved automatically by appending
// `-N` rather than rejecting — less friction for the barber.
// -----------------------------------------------------------------------------

interface Body {
  slug?: unknown
  publicEnabled?: unknown
  brandLogoUrl?: unknown
  brandLogoAltUrl?: unknown
  brandCoverUrl?: unknown
  brandColor?: unknown
  brandTheme?: unknown
  publicDescription?: unknown
  instagramHandle?: unknown
  tiktokHandle?: unknown
  facebookUrl?: unknown
  websiteUrl?: unknown
}

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

function cleanUrl(value: unknown): string | null {
  const s = cleanString(value, 500)
  if (!s) return null
  try {
    const u = new URL(s)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.toString()
  } catch {
    return null
  }
}

function cleanHandle(value: unknown): string | null {
  const s = cleanString(value, 50)
  if (!s) return null
  return s.replace(/^@+/, '')
}

function cleanHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const s = value.trim()
  if (!/^#[0-9a-f]{6}$/i.test(s)) return null
  return s
}

export async function PATCH(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)

  let body: Body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() }

  // ── Slug (handle carefully) ──────────────────────────────────────────────
  if ('slug' in body) {
    const raw = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
    const normalised = slugifyName(raw)
    if (!normalised) {
      return Response.json({ error: 'Slug vacío.' }, { status: 400 })
    }
    if (!isValidSlug(normalised)) {
      return Response.json(
        { error: 'Slug inválido. Usa letras, números y guiones (mín. 3 chars).' },
        { status: 400 },
      )
    }
    try {
      patch.publicSlug = await ensureUniqueSlug(normalised, access.client.id)
    } catch {
      return Response.json({ error: 'No se pudo generar slug único.' }, { status: 500 })
    }
  }

  if ('publicEnabled' in body) {
    patch.publicEnabled = body.publicEnabled === true
  }
  if ('brandLogoUrl' in body) patch.brandLogoUrl = cleanUrl(body.brandLogoUrl)
  if ('brandLogoAltUrl' in body) patch.brandLogoAltUrl = cleanUrl(body.brandLogoAltUrl)
  if ('brandCoverUrl' in body) patch.brandCoverUrl = cleanUrl(body.brandCoverUrl)
  if ('brandColor' in body) patch.brandColor = cleanHexColor(body.brandColor)
  if ('brandTheme' in body) {
    patch.brandTheme = body.brandTheme === 'dark' ? 'dark' : 'light'
  }
  if ('publicDescription' in body) patch.publicDescription = cleanString(body.publicDescription, 600)
  if ('instagramHandle' in body) patch.instagramHandle = cleanHandle(body.instagramHandle)
  if ('tiktokHandle' in body) patch.tiktokHandle = cleanHandle(body.tiktokHandle)
  if ('facebookUrl' in body) patch.facebookUrl = cleanUrl(body.facebookUrl)
  if ('websiteUrl' in body) patch.websiteUrl = cleanUrl(body.websiteUrl)

  await db.update(clients).set(patch).where(eq(clients.id, access.client.id))
  const [updated] = await db.select().from(clients).where(eq(clients.id, access.client.id))
  return Response.json({
    ok: true,
    slug: updated.publicSlug,
    publicEnabled: updated.publicEnabled,
    brandLogoUrl: updated.brandLogoUrl,
    brandLogoAltUrl: updated.brandLogoAltUrl,
    brandCoverUrl: updated.brandCoverUrl,
    brandColor: updated.brandColor,
    brandTheme: updated.brandTheme,
    publicDescription: updated.publicDescription,
    instagramHandle: updated.instagramHandle,
    tiktokHandle: updated.tiktokHandle,
    facebookUrl: updated.facebookUrl,
    websiteUrl: updated.websiteUrl,
  })
}
