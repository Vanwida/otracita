// -----------------------------------------------------------------------------
// /api/wallet/v1/devices/[deviceLibraryIdentifier]/registrations/
//   [passTypeIdentifier]?passesUpdatedSince=<tag>
//
// PassKit Web Service Reference — iOS pregunta qué passes han cambiado
// desde el último `lastUpdated` que le dimos. V1: nunca cambia nada
// (responde 204 No Content). En V1.5, devolvemos `{ serialNumbers: [...],
// lastUpdated: "<tag>" }` con los passes que han cambiado.
// -----------------------------------------------------------------------------

import { validateBearerOrLog } from '@/lib/wallet/web-service-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  validateBearerOrLog(req)
  // 204 = no hay updates pendientes. iOS NO vuelve a pedirlos hasta el
  // próximo APNs nudge.
  return new Response(null, { status: 204 })
}
