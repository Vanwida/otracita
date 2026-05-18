import { db } from '@/db'
import { tips, barbers } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// PATCH /api/tips/[id] — reasignar una propina a un barbero (fix #7).
//
// Las propinas pertenecen al barbero que hizo el servicio. `tips.barberName`
// es un snapshot de texto (sobrevive a renombrados). El bot/flow lo intenta
// rellenar pero a veces queda vacío (propina suelta sin cita, o el cliente
// no eligió barbero) → el barbero lo corrige aquí.
//
// Body: { barberName: string | null }  (null/'' → quitar la asignación)
//
// Multi-tenancy: SIEMPRE requireClientAccess; el UPDATE va guardado por
// client_id. Si se asigna a un nombre, validamos que corresponde a un
// barbero ACTIVO del tenant (no aceptamos texto libre arbitrario — sería
// un agujero de datos). El snapshot guardado es el nombre canónico del
// barbero, no lo que mande el cliente.
// -----------------------------------------------------------------------------

interface Body {
  barberName?: unknown
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

  const raw =
    typeof body.barberName === 'string' ? body.barberName.trim() : ''

  // Con nombre → debe ser un barbero activo del tenant. Guardamos el
  // nombre canónico de la tabla (no el texto crudo del body).
  let barberName: string | null = null
  if (raw.length > 0) {
    const [b] = await db
      .select({ name: barbers.name })
      .from(barbers)
      .where(
        and(
          eq(barbers.clientId, client.id),
          eq(barbers.name, raw),
          eq(barbers.active, true),
        ),
      )
    if (!b) {
      return Response.json(
        { error: 'Ese barbero no existe o no está activo.' },
        { status: 400 },
      )
    }
    barberName = b.name
  }

  // UPDATE guardado por client_id — si la propina es de otra barbería,
  // returning() devuelve [] y respondemos 404 (no revelamos existencia).
  const updated = await db
    .update(tips)
    .set({ barberName, updatedAt: new Date() })
    .where(and(eq(tips.id, id), eq(tips.clientId, client.id)))
    .returning({ id: tips.id })

  if (updated.length === 0) {
    return Response.json({ error: 'Propina no encontrada.' }, { status: 404 })
  }

  return Response.json({ ok: true, barberName })
}
