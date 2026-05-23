import { db } from '@/db'
import { customers, bookings } from '@/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import {
  requireTenantActor,
  tenantActorErrorResponse,
} from '@/lib/auth/require-tenant-actor'
import { canonicalPhone } from '@/lib/phone'

// -----------------------------------------------------------------------------
// GET /api/customers/by-phone/visits?phone=...
//
// Devuelve un payload ULTRA-LIGERO para el badge "Nuevo / Habitual" del
// detalle de reserva en la agenda (F5 Reni). Antes la única ruta para saber
// si un cliente era nuevo era `/api/customers/by-phone/profile`, que carga
// la ficha COMPLETA (bookings + ratings + recentAttribution…) — overkill
// para pintar un chip de 2 estados.
//
// Convención de "Nuevo":
//   - Si no existe fila en `customers` (cliente que reserva por primera
//     vez y aún no se ha persistido) → Nuevo (visitNumber=1).
//   - Si totalBookings ≤ 1 → Nuevo. La cita actual es la primera.
//   - Si totalBookings ≥ 2 → Habitual. visitNumber es totalBookings tal cual.
//
// Multi-tenancy: SIEMPRE requireTenantActor (admin + barber-role); el lookup
// va guardado por clientId + phone canónico. Es un read agregado de la
// agenda — no requiere ownership por cita (un barbero ve a su cliente
// repetido aunque la cita en cuestión sea suya o no).
// -----------------------------------------------------------------------------

export async function GET(req: Request) {
  const access = await requireTenantActor(req)
  if (!access.ok) return tenantActorErrorResponse(access)
  const { client } = access

  const url = new URL(req.url)
  const phoneRaw = url.searchParams.get('phone')?.trim()
  if (!phoneRaw) {
    return Response.json({ error: 'Falta phone.' }, { status: 400 })
  }

  const phone = canonicalPhone(phoneRaw)

  const [row] = await db
    .select({
      totalBookings: customers.totalBookings,
    })
    .from(customers)
    .where(and(eq(customers.clientId, client.id), eq(customers.phone, phone)))

  let totalBookings = Number(row?.totalBookings ?? 0)

  // Fallback defensivo: si la fila customers todavía no se ha creado pero
  // SÍ hay bookings con ese phone (debería ser raro: la creación de booking
  // upsertea customers en create.ts), contamos los bookings directamente.
  // No completa→pero existen → tratamos como "primera vez".
  if (!row) {
    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(bookings)
      .where(
        and(eq(bookings.clientId, client.id), eq(bookings.customerPhone, phone)),
      )
    totalBookings = Number(count ?? 0)
  }

  const isNew = totalBookings <= 1
  const visitNumber = Math.max(1, totalBookings)

  return Response.json({ isNew, visitNumber, totalBookings })
}
