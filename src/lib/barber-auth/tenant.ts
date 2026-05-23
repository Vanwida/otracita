import { db } from '@/db'
import { barbers, clients } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { readBarberSessionFromRequest, type BarberSession } from './session'

// -----------------------------------------------------------------------------
// Barber-auth — tenant guard scope-limited (#71).
//
// La sesión del barbero NO da acceso al dashboard ni a endpoints
// administrativos. Solo a un conjunto reducido de operaciones sobre
// recursos SUYOS:
//   · ver/marcar SUS citas
//   · cobrar SUS citas
//   · registrar propinas en SUS citas
//   · editar notas privadas de clientes que él atiende
//
// Cualquier ruta que extienda `requireTenantAccess` para aceptar al
// barbero debe gatear cada operación por `booking.barberId === barber.id`
// (o el campo equivalente). Este helper NO hace esa comprobación — solo
// resuelve la identidad. La autorización por recurso es responsabilidad
// del endpoint (como con admin-lock).
// -----------------------------------------------------------------------------

export type BarberRow = typeof barbers.$inferSelect
export type ClientRow = typeof clients.$inferSelect

export type BarberAccess =
  | {
      ok: true
      barber: BarberRow
      client: ClientRow
      session: BarberSession
    }
  | {
      ok: false
      status: 401 | 403 | 404
      error: string
    }

/**
 * Resuelve la identidad del barbero desde la cookie firmada del request.
 * Devuelve también el tenant (client) al que pertenece. Si la cookie es
 * inválida, el barbero está inactivo, o ya no existe → fallo.
 *
 * Contract:
 *   · Sin cookie / firma rota / expirada → 401
 *   · Barbero borrado / desactivado    → 403 ("acceso revocado")
 *   · Barbero existe pero tenant no    → 404 (consistencia DB rara)
 */
export async function requireBarberAccess(req: Request): Promise<BarberAccess> {
  const session = readBarberSessionFromRequest(req)
  if (!session) {
    return { ok: false, status: 401, error: 'Sin sesión.' }
  }

  const [barber] = await db
    .select()
    .from(barbers)
    .where(eq(barbers.id, session.barberId))

  if (!barber) {
    return { ok: false, status: 403, error: 'Acceso revocado.' }
  }
  if (!barber.active) {
    return { ok: false, status: 403, error: 'Acceso revocado.' }
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, barber.clientId))

  if (!client) {
    return { ok: false, status: 404, error: 'Negocio no encontrado.' }
  }

  return { ok: true, barber, client, session }
}

/**
 * Helper para convertir un fallo de acceso en una Response JSON. Mismo
 * patrón que `accessErrorResponse` de require-client-access.
 */
export function barberAccessErrorResponse(
  access: Extract<BarberAccess, { ok: false }>,
): Response {
  return Response.json({ error: access.error }, { status: access.status })
}

/**
 * Resuelve un barbero por su personalAccessToken. Lo usa el endpoint de
 * sign-in `/r/[token]` antes de setear la cookie. Devuelve null si el
 * token no existe, el barbero está inactivo o el tenant no existe.
 */
export async function resolveBarberByToken(
  token: string,
): Promise<{ barber: BarberRow; client: ClientRow } | null> {
  if (!token || typeof token !== 'string') return null
  // El token guardado es hex 32 bytes (64 chars). Validamos forma para
  // evitar consultas con basura.
  if (!/^[0-9a-f]{64}$/.test(token)) return null

  const [barber] = await db
    .select()
    .from(barbers)
    .where(
      and(
        eq(barbers.personalAccessToken, token),
        eq(barbers.active, true),
      ),
    )
  if (!barber) return null

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, barber.clientId))
  if (!client) return null

  return { barber, client }
}
