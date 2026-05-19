import { db } from '@/db'
import { customers } from '@/db/schema'
import { and, desc, eq, or, sql } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// GET /api/pos/customers?q=... — typeahead de clientes para el TPV.
//
// Booksy "Sugiere para este cliente" (10.00.16): al cobrar un walk-in que
// SÍ es cliente conocido, el barbero lo busca por nombre/teléfono y lo
// adjunta. Devuelve como mucho 8 coincidencias {name, phone}.
//
// Misma búsqueda parcial insensible a mayúsculas que usa la lista de
// Clientes (nombre OR teléfono). Multi-tenant: scope por client de la
// sesión, NUNCA por request. Sin q (o < 2 chars) → lista vacía: no se
// vuelca la cartera entera por una tecla.
// -----------------------------------------------------------------------------

export async function GET(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 60)
  if (q.length < 2) return Response.json({ customers: [] })

  const like = `%${q.toLowerCase()}%`

  const rows = await db
    .select({
      name: customers.name,
      phone: customers.phone,
    })
    .from(customers)
    .where(
      and(
        eq(customers.clientId, client.id),
        or(
          sql`LOWER(COALESCE(${customers.name}, '')) LIKE ${like}`,
          sql`${customers.phone} LIKE ${like}`,
        ),
      ),
    )
    .orderBy(desc(customers.lastBookingAt))
    .limit(8)

  return Response.json({
    customers: rows.map((r) => ({
      name: r.name ?? '',
      phone: r.phone,
    })),
  })
}
