// -----------------------------------------------------------------------------
// /api/wallet/v1/devices/[deviceLibraryIdentifier]/registrations/
//   [passTypeIdentifier]/[serialNumber]
//
// PassKit Web Service Reference — endpoints de registro / desregistro de un
// device para un pass concreto. iOS los llama cuando el usuario añade o
// elimina un pass de Wallet.
//
// V1: STUB. No persistimos nada. Devolvemos 201/200 para que iOS considere
// la operación OK y los passes futuros V1.5 puedan registrarse en este
// mismo endpoint sin que iOS re-pregunte (los registros son idempotentes
// del lado Apple).
//
// V1.5 (TODO): persistir en tabla `wallet_passes`/`wallet_registrations`
// + verificar Authorization estricta + cuando algo cambie, enviar APNs
// "empty notification" → iOS llama GET /passes/[type]/[serial] que devuelve
// la nueva versión.
// -----------------------------------------------------------------------------

import { validateBearerOrLog } from '@/lib/wallet/web-service-auth'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // V1: aceptamos sin validar payload (push token). V1.5 guardará
  // pushToken en wallet_registrations para mandar APNs notifications.
  validateBearerOrLog(req)
  return new Response(null, { status: 201 })
}

export async function DELETE(req: Request) {
  validateBearerOrLog(req)
  return new Response(null, { status: 200 })
}
