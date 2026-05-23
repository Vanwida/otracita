import { NextResponse } from 'next/server'
import { resolveBarberByToken } from '@/lib/barber-auth/tenant'
import { setBarberSession } from '@/lib/barber-auth/session'

// -----------------------------------------------------------------------------
// /r/[token]/enter — Route Handler que setea la cookie firmada del barbero
// y redirige a /r/<token>/agenda (#71).
//
// Por qué Route Handler y no Server Component (page.tsx): en Next 16,
// modificar cookies con `cookies().set(...)` SOLO está permitido dentro de
// Server Functions / Server Actions / Route Handlers. Llamarlo desde el
// render de una page.tsx revienta en runtime con 500. Ese era el bug que
// veía el jefe al abrir el link del barbero sin `?install=1`.
//
// Flow:
//   1. WhatsApp link `/r/<token>?install=1` → page.tsx renderiza
//      InstallScreen (RSC, sin tocar cookies).
//   2. "Entrar a mi agenda" → `/r/<token>/enter` (este handler) → setea
//      cookie + 302 → `/r/<token>/agenda`.
//   3. Cookie expira / barbero re-abre PWA → layout redirige a este
//      handler para refrescar la sesión sin pasar por la pantalla install.
//
// Si el token no resuelve → 302 a `/r/<token>` que renderiza la pantalla
// genérica "Enlace no válido". No filtramos por qué.
// -----------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const resolved = await resolveBarberByToken(token)

  const origin = new URL(req.url).origin

  if (!resolved) {
    // Token inválido → manda al page.tsx que muestra "Enlace no válido".
    return NextResponse.redirect(new URL(`/r/${token}`, origin), 302)
  }

  await setBarberSession(resolved.barber.id)
  return NextResponse.redirect(new URL(`/r/${token}/agenda`, origin), 302)
}
