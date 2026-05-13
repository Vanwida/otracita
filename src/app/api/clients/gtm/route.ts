import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'

// -----------------------------------------------------------------------------
// PATCH /api/clients/gtm
//
// Setear / actualizar / borrar el GTM container ID del cliente autenticado.
// Feature Pro. Validamos formato GTM-XXXXXXX antes de persistir.
//
// Body: { gtmContainerId: string | null }
// -----------------------------------------------------------------------------

const GTM_REGEX = /^GTM-[A-Z0-9]{6,12}$/i

export async function PATCH(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'gtmContainer')
  if (gate) return gate

  let body: { gtmContainerId?: unknown }
  try {
    body = (await request.json()) as { gtmContainerId?: unknown }
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  let value: string | null = null
  if (typeof body.gtmContainerId === 'string') {
    const trimmed = body.gtmContainerId.trim().toUpperCase()
    if (trimmed.length > 0) {
      if (!GTM_REGEX.test(trimmed)) {
        return Response.json(
          { error: 'Formato no válido. Debe ser GTM- seguido de 6-12 caracteres alfanuméricos.' },
          { status: 400 },
        )
      }
      value = trimmed
    }
  } else if (body.gtmContainerId === null) {
    value = null
  } else {
    return Response.json({ error: 'gtmContainerId requerido (string o null)' }, { status: 400 })
  }

  await db.update(clients).set({ gtmContainerId: value }).where(eq(clients.id, access.client.id))

  return Response.json({ ok: true, gtmContainerId: value })
}
