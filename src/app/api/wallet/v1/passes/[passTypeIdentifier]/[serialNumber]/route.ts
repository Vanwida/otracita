// -----------------------------------------------------------------------------
// /api/wallet/v1/passes/[passTypeIdentifier]/[serialNumber]
//
// PassKit Web Service Reference — iOS llama aquí cuando necesita la última
// versión de un pass (tras recibir un APNs push o periódicamente). En V1
// devolvemos siempre 304 Not Modified, lo que le dice a iOS "tu copia
// sigue siendo válida, no re-descargues nada".
//
// V1.5: comparar If-Modified-Since del request con el updatedAt del pass
// en DB. Si cambió, regenerar .pkpass y devolverlo 200 con Last-Modified.
// -----------------------------------------------------------------------------

import { validateBearerOrLog } from '@/lib/wallet/web-service-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  validateBearerOrLog(req)
  return new Response(null, { status: 304 })
}
