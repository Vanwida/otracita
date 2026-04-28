import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// POST /api/sumup/readers/select
//
// Body: { readerId: string, readerName: string }
//
// Persiste qué Reader concreto usar para los cobros. Lo elige el barbero
// desde la UI tras conectar OAuth y ver la lista (puede tener varios
// datáfonos). Sin esto guardado, no se puede iniciar checkout.
// -----------------------------------------------------------------------------

interface Body {
  readerId?: unknown
  readerName?: unknown
}

export async function POST(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const readerId = typeof body.readerId === 'string' ? body.readerId.trim() : ''
  const readerName = typeof body.readerName === 'string' ? body.readerName.trim() : ''

  if (!readerId) return Response.json({ error: 'readerId requerido' }, { status: 400 })

  await db
    .update(clients)
    .set({
      sumupReaderId: readerId,
      sumupReaderName: readerName || readerId,
    })
    .where(eq(clients.id, access.client.id))

  return Response.json({ ok: true })
}
