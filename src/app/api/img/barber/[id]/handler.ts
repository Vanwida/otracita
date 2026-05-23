// -----------------------------------------------------------------------------
// resolveBarberPhotoResponse — núcleo testable del proxy de fotos.
//
// Se separa del `route.ts` para poder testearla sin arrancar Neon ni alcanzar
// el blob de Vercel. La fn recibe dos colaboradores (`fetchPhotoUrl` para
// resolver DB y `fetchUpstream` para el GET al blob) y devuelve la Response
// final que se envía al cliente.
//
// Contrato:
//   · id no es UUID                       → 404 (no-store)
//   · barbero no existe / inactivo / null → 404 (no-store)
//   · upstream timeout (>5s) o falla red  → 502 (no-store)
//   · upstream !ok o sin body             → 502 (no-store)
//   · upstream ok                         → 200 con Cache-Control immutable
//                                            y Content-Type pasado tal cual
// -----------------------------------------------------------------------------

export const UPSTREAM_TIMEOUT_MS = 5000

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ResolveBarberPhotoDeps {
  /** UUID validado del barbero (ya pasó por la regex). */
  id: string
  /** Devuelve la URL del blob para un barbero ACTIVO, o null si no procede. */
  fetchPhotoUrl: (id: string) => Promise<string | null>
  /** Fetch del asset upstream; recibe AbortSignal para el timeout. */
  fetchUpstream: (url: string, init: RequestInit) => Promise<Response>
}

export async function resolveBarberPhotoResponse(
  deps: ResolveBarberPhotoDeps,
): Promise<Response> {
  const { id, fetchPhotoUrl, fetchUpstream } = deps

  if (!UUID_RE.test(id)) {
    return notFound()
  }

  const photoUrl = await fetchPhotoUrl(id)
  if (!photoUrl) {
    return notFound()
  }

  // AbortController = forma estándar para cortar un fetch nativo que se
  // eterniza. Vercel mata la lambda tras N segundos; mejor cortar nosotros
  // con un mensaje claro al cliente.
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS)

  let upstream: Response
  try {
    upstream = await fetchUpstream(photoUrl, { signal: ac.signal })
  } catch {
    clearTimeout(timer)
    return badGateway()
  }
  clearTimeout(timer)

  if (!upstream.ok || !upstream.body) {
    return badGateway()
  }

  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg'

  // Las URLs del blob son immutables (cada upload genera key random nueva),
  // así que podemos cachear "para siempre" tanto en browser como en CDN.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Photo-Source': 'vercel-blob-proxy',
    },
  })
}

function notFound() {
  return new Response('Not found', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-store',
    },
  })
}

function badGateway() {
  return new Response('Bad gateway', {
    status: 502,
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-store',
    },
  })
}
