import { clearBarberSession } from '@/lib/barber-auth/session'

// POST /api/r/me/logout — borra la cookie de sesión del barbero.
//
// No requiere validación: si no hay cookie, el delete es no-op. Devuelve
// 200 siempre para que el cliente pueda redirigir tranquilamente.
export async function POST() {
  await clearBarberSession()
  return Response.json({ ok: true })
}
