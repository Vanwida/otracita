import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'
import {
  TRACKING_REGEX,
  TRACKING_FIELDS,
  type TrackingField,
} from '@/lib/tracking/validation'

// -----------------------------------------------------------------------------
// PATCH /api/clients/tracking
//
// Update / clear cualquiera de los 4 IDs de tracking pixel del barbero
// autenticado en una sola request (atomic):
//   - gtmContainerId           (GTM-XXXXXXX)
//   - metaPixelId              (15-16 dígitos)
//   - googleAdsConversionId    (AW-XXXXXXXXXX)
//   - googleAdsConversionLabel (alfanum/-/_)
//   - tiktokPixelId            (20 chars [A-Z0-9])
//
// Feature: gtmContainer (mismo gate que el GTM original — todo lo de
// tracking pixels es Pro).
//
// Body (todos opcionales; los omitidos no se tocan; null = limpiar):
//   { gtmContainerId?: string|null, metaPixelId?: string|null, ... }
//
// Monkey-proof: si DOS campos diferentes recibirían el MISMO valor
// final (después de trim/upper), rechazamos con 400. Pega el mismo
// pixel en dos slots → bloqueamos.
// -----------------------------------------------------------------------------

interface Body {
  gtmContainerId?: string | null
  metaPixelId?: string | null
  googleAdsConversionId?: string | null
  googleAdsConversionLabel?: string | null
  tiktokPixelId?: string | null
}

export async function PATCH(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'gtmContainer')
  if (gate) return gate

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Sanitiza + valida campo a campo. Solo campos presentes en el body
  // se procesan (undefined = no tocar). null o '' = limpiar.
  const updates: Partial<Record<TrackingField, string | null>> = {}
  for (const field of TRACKING_FIELDS) {
    if (!(field in body)) continue
    const raw = (body as Record<string, unknown>)[field]
    if (raw === null || raw === undefined) {
      updates[field] = null
      continue
    }
    if (typeof raw !== 'string') {
      return Response.json(
        { error: `${field} debe ser string o null`, field },
        { status: 400 },
      )
    }
    // Normaliza: trim + upper para los que son case-insensitive (GTM,
    // Meta-no, Google Ads ID sí, label NO, TikTok sí). Para simplificar
    // y porque Meta acepta solo dígitos, hacemos trim+upper a todos
    // EXCEPTO el label de Google Ads (puede ser case-sensitive).
    const trimmed = raw.trim()
    if (trimmed.length === 0) {
      updates[field] = null
      continue
    }
    const normalized =
      field === 'googleAdsConversionLabel' ? trimmed : trimmed.toUpperCase()
    if (!TRACKING_REGEX[field].test(normalized)) {
      return Response.json(
        {
          error: `Formato no válido para ${field}.`,
          field,
        },
        { status: 400 },
      )
    }
    updates[field] = normalized
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  // Monkey-proof: detecta dos slots con el MISMO valor (excluyendo el
  // label, que es un sufijo válido y puede coincidir por accidente).
  // Combina updates entrantes con los persistidos para detectar también
  // "el barbero actualiza un slot y le pone el mismo valor que otro slot
  // ya guardado".
  const persisted = access.client
  const finalValues: Record<TrackingField, string | null> = {
    gtmContainerId:
      updates.gtmContainerId ?? (persisted.gtmContainerId ?? null),
    metaPixelId: updates.metaPixelId ?? (persisted.metaPixelId ?? null),
    googleAdsConversionId:
      updates.googleAdsConversionId ?? (persisted.googleAdsConversionId ?? null),
    googleAdsConversionLabel:
      updates.googleAdsConversionLabel ??
      (persisted.googleAdsConversionLabel ?? null),
    tiktokPixelId: updates.tiktokPixelId ?? (persisted.tiktokPixelId ?? null),
  }
  const seen = new Map<string, TrackingField>()
  for (const field of TRACKING_FIELDS) {
    if (field === 'googleAdsConversionLabel') continue
    const v = finalValues[field]
    if (!v) continue
    if (seen.has(v)) {
      return Response.json(
        {
          error: `Has pegado el mismo ID en dos slots distintos (${seen.get(v)} y ${field}), revisa.`,
          conflict: { a: seen.get(v), b: field },
        },
        { status: 400 },
      )
    }
    seen.set(v, field)
  }

  await db.update(clients).set(updates).where(eq(clients.id, access.client.id))

  return Response.json({ ok: true, values: finalValues })
}
