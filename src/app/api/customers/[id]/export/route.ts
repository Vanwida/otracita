import { db } from '@/db'
import { bookings, customers, invoices, ratings, tips } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// GET /api/customers/[id]/export
//
// Derecho de PORTABILIDAD (art. 20 RGPD) — devuelve un JSON con toda la
// información personal y operativa que la barbería tiene sobre el cliente
// dentro de otracita. Lo descarga el barbero desde la ficha del cliente
// (perfil) para entregárselo si el cliente lo solicita por escrito.
//
// Contiene:
//   · customer: la fila de customers (datos personales, atribución).
//   · bookings: histórico de reservas con el barbero (servicio, fecha, precio).
//   · tips: propinas y reseñas dejadas vía Stripe/efectivo.
//   · ratings: reseñas independientes (post-cita).
//   · invoices: facturas/tickets emitidos al cliente (no se purgan nunca
//     por obligación tributaria — incluidas para portabilidad).
//
// Multi-tenancy: requireClientAccess + filtros explícitos por client.id.
// El customer debe pertenecer a la barbería autenticada o devolvemos 404.
// -----------------------------------------------------------------------------

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access

  const { id } = await ctx.params
  if (!id) return Response.json({ error: 'id requerido' }, { status: 400 })

  // Verifica que el customer existe Y pertenece a este tenant.
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.clientId, client.id)))
    .limit(1)

  if (!customer) {
    return Response.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }

  // Las relaciones se enlazan por customerPhone (no hay FK directa: el
  // shape histórico de bookings/tips/ratings copia el teléfono como
  // snapshot). Filtramos siempre por clientId para no filtrar datos de
  // otra barbería con el mismo número.
  const [bookingsRows, tipsRows, ratingsRows, invoicesRows] = await Promise.all([
    db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.clientId, client.id),
          eq(bookings.customerPhone, customer.phone),
        ),
      ),
    db
      .select()
      .from(tips)
      .where(
        and(
          eq(tips.clientId, client.id),
          eq(tips.customerPhone, customer.phone),
        ),
      ),
    db
      .select()
      .from(ratings)
      .where(
        and(
          eq(ratings.clientId, client.id),
          eq(ratings.customerPhone, customer.phone),
        ),
      ),
    db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.clientId, client.id),
          eq(invoices.customerPhone, customer.phone),
        ),
      ),
  ])

  const payload = {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    barbershopId: client.id,
    customer,
    bookings: bookingsRows,
    tips: tipsRows,
    ratings: ratingsRows,
    invoices: invoicesRows,
  }

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="cliente-${customer.id}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}
