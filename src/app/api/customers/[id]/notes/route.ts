import { db } from '@/db'
import { customers } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// PATCH /api/customers/[id]/notes
//
// Body: { notes: string }
//
// Guarda las notas libres del barbero sobre un cliente. Solo visibles en
// el dashboard — nunca se exponen al cliente vía PWA o WhatsApp.
//
// Multi-tenancy: validamos que el customer.client_id coincide con el
// cliente del barbero autenticado. Sin esto, conociendo el id de un
// cliente de otra barbería podrías editar sus notas.
// -----------------------------------------------------------------------------

const MAX_NOTES_LENGTH = 2000

interface Body {
  notes?: unknown
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access

  const { id } = await ctx.params
  if (!id) return Response.json({ error: 'id requerido' }, { status: 400 })

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const raw = typeof body.notes === 'string' ? body.notes : ''
  const notes = raw.trim().slice(0, MAX_NOTES_LENGTH)

  // Update con guard por client_id — si el customer pertenece a otra
  // barbería, returning() devuelve [] y respondemos 404.
  const updated = await db
    .update(customers)
    .set({ barberNotes: notes.length > 0 ? notes : null })
    .where(and(eq(customers.id, id), eq(customers.clientId, client.id)))
    .returning({ id: customers.id })

  if (updated.length === 0) {
    return Response.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }

  return Response.json({ ok: true })
}
