// -----------------------------------------------------------------------------
// /api/wallet/v1/log
//
// PassKit Web Service Reference — iOS manda aquí los errores que ha visto
// con nuestros passes ({ logs: ["mensaje 1", "mensaje 2", ...] }). En V1
// hacemos no-op + un console.log mínimo para debugging si algo va mal.
//
// V1.5 (TODO): mandar a Sentry / Logflare con metadata del pass type.
// Apple no provee deviceId aquí — solo el cuerpo de logs.
// -----------------------------------------------------------------------------

export const dynamic = 'force-dynamic'

interface AppleLogBody {
  logs?: unknown
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AppleLogBody
    if (Array.isArray(body.logs) && body.logs.length > 0) {
      // Mínimo console.log para que aparezca en Vercel logs si Apple
      // reporta errores con nuestros passes en producción. NO se persiste.
      console.warn('[wallet][apple-log]', body.logs)
    }
  } catch {
    // Body malformed — ignoramos, Apple sigue sus reintentos.
  }
  return new Response(null, { status: 200 })
}
