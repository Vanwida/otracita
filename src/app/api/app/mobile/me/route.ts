import { requireMobileAuth, mobileAuthErrorResponse } from '@/lib/auth/mobile-session'

// -----------------------------------------------------------------------------
// GET /api/app/mobile/me
//
// Devuelve info del barbero logueado en la app móvil. Lo primero que llama
// la app al abrir para validar que el token sigue activo + obtener flags
// que condicionan la UI (caja activa, sumup pareado, etc).
// -----------------------------------------------------------------------------

export async function GET(req: Request) {
  const auth = await requireMobileAuth(req)
  if (!auth.ok) return mobileAuthErrorResponse(auth)
  const { client } = auth

  return Response.json({
    business: {
      id: client.id,
      name: client.businessName,
    },
    capabilities: {
      cashRegisterEnabled: client.cashRegisterEnabled,
      sumupConnected: !!client.sumupAccessToken && !!client.sumupMerchantCode,
      sumupReaderPaired: !!client.sumupReaderId,
      sumupReaderName: client.sumupReaderName,
    },
  })
}
