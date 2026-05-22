import { db } from '@/db'
import { customers } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// DELETE /api/customers/[id]
//
// Derecho de SUPRESIÓN (art. 17 RGPD) — anonimiza la ficha del cliente.
// NO borramos la fila porque las bookings/invoices asociadas siguen
// vinculadas por customerPhone (snapshot histórico necesario por
// obligaciones fiscales: art. 29 LGT + RD 1007/2023). Borrar la fila
// rompería el histórico de la barbería sin necesidad.
//
// Anonimización:
//   · name  → '(borrado)'
//   · phone → '+00000000000<tail6>'  (mantiene unicidad por tenant)
//   · email → null
//   · barberNotes → null
//   · firstSource* → se MANTIENE (es métrica de captación de la barbería,
//     no es dato personal directo — anónimo agregado).
//
// El campo phone es NOT NULL en schema. Construimos un placeholder con
// los últimos 6 chars del id del customer para mantener unicidad si el
// barbero anonimiza varios clientes consecutivos.
//
// Multi-tenancy: requireClientAccess + filtro explícito por client.id.
// El customer debe pertenecer a la barbería autenticada o devolvemos 404
// (no revelamos existencia).
// -----------------------------------------------------------------------------

const ANON_NAME = '(borrado)'
const ANON_PHONE_PREFIX = '+00000000000'

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access

  const { id } = await ctx.params
  if (!id) return Response.json({ error: 'id requerido' }, { status: 400 })

  // Tail de unicidad: últimos 6 chars del UUID (hex). Probabilidad de
  // colisión dentro del mismo tenant es despreciable para anonimizaciones
  // puntuales — y si colisionara, el constraint UNIQUE (clientId, phone)
  // si existe simplemente lo dejaríamos con tail-extendido (no es el caso
  // hoy, phone no es UNIQUE per-tenant).
  const tail = id.replace(/-/g, '').slice(-6)
  const anonymizedPhone = `${ANON_PHONE_PREFIX}${tail}`
  const deletedAt = new Date().toISOString()

  const updated = await db
    .update(customers)
    .set({
      name: ANON_NAME,
      phone: anonymizedPhone,
      email: null,
      barberNotes: null,
      // El consentimiento de tarjeta queda invalidado: ningún cobro
      // off-session futuro tiene sentido sobre un cliente anonimizado.
      stripeCustomerId: null,
      defaultPaymentMethodId: null,
      cardConsentAt: null,
      cardConsentSource: null,
    })
    .where(and(eq(customers.id, id), eq(customers.clientId, client.id)))
    .returning({ id: customers.id })

  if (updated.length === 0) {
    return Response.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }

  return Response.json({ anonymized: true, deletedAt })
}
