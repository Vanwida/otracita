import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { loadClientProfile } from '@/lib/clients/profile'

// -----------------------------------------------------------------------------
// GET /api/customers/[id]/profile
//
// Devuelve la ficha COMPLETA del cliente (mismo shape que renderiza la ruta
// /dashboard/clientes/[id]) para abrir <ClientProfile> sin recargar página
// — p.ej. al clicar el nombre del cliente en el detalle de una reserva en
// la agenda. Fuente única de datos: loadClientProfile.
//
// El segmento [id] puede ser:
//   · el id real de la fila customers (uso normal), o
//   · el literal "by-phone" + ?phone=... (la agenda solo tiene el teléfono
//     de la reserva, no el id del customer).
//
// Multi-tenancy: SIEMPRE requireClientAccess; loadClientProfile filtra por
// clientId. Customer de otra barbería → 404 (no revelamos existencia).
// -----------------------------------------------------------------------------

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)

  const { id } = await ctx.params
  const url = new URL(req.url)
  const phone = url.searchParams.get('phone')?.trim() || undefined

  const byPhone = id === 'by-phone'
  if (byPhone && !phone) {
    return Response.json({ error: 'Falta phone.' }, { status: 400 })
  }

  const data = await loadClientProfile(access.client.id, {
    customerId: byPhone ? undefined : id,
    phone: byPhone ? phone : undefined,
    loyaltyEnabled: access.client.loyaltyEnabled,
    loyaltyMode: access.client.loyaltyMode === 'points' ? 'points' : 'stamps',
  })

  if (!data) {
    return Response.json({ error: 'Cliente no encontrado.' }, { status: 404 })
  }

  return Response.json({ profile: data })
}
