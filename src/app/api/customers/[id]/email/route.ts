import { db } from '@/db'
import { customers } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { isValidEmail } from '@/lib/bookings/create'

// -----------------------------------------------------------------------------
// PATCH /api/customers/[id]/email
//
// Body: { email: string }  (vacío → borra el email, lo deja NULL)
//
// El barbero edita/borra el email del cliente desde la ficha en
// /dashboard/clientes/[id]. Espejo de la ruta de notas: mismo guard de
// multi-tenancy, mismo patrón returning()→404.
//
// Multi-tenancy: validamos que customer.client_id coincide con el cliente
// del barbero autenticado. Sin esto, conociendo el id de un cliente de
// otra barbería podrías editar su email.
//
// Validación: email opcional. Vacío → NULL (borrar). Con contenido →
// debe tener forma plausible (isValidEmail, fuente única compartida con
// el pipeline de reservas).
// -----------------------------------------------------------------------------

interface Body {
  email?: unknown
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

  const raw = typeof body.email === 'string' ? body.email.trim() : ''
  // Vacío = el barbero quiere quitar el email → NULL. Con contenido,
  // exigimos forma válida (un email roto es peor que ninguno).
  if (raw.length > 0 && (raw.length > 254 || !isValidEmail(raw))) {
    return Response.json({ error: 'Email inválido' }, { status: 400 })
  }
  const email = raw.length > 0 ? raw.toLowerCase() : null

  // Update con guard por client_id — si el customer pertenece a otra
  // barbería, returning() devuelve [] y respondemos 404.
  const updated = await db
    .update(customers)
    .set({ email })
    .where(and(eq(customers.id, id), eq(customers.clientId, client.id)))
    .returning({ id: customers.id })

  if (updated.length === 0) {
    return Response.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }

  return Response.json({ ok: true, email })
}
