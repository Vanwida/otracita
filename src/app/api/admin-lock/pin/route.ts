import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { generatePin, hashPin, isValidPinFormat } from '@/lib/admin-lock/pin'

// -----------------------------------------------------------------------------
// PUT /api/admin-lock/pin
//
// Crea o reemplaza el PIN del jefe. Devuelve el PIN EN CLARO una sola
// vez (response body) — el jefe lo apunta / lo memoriza AHORA porque no
// se vuelve a exponer.
//
// Body opciones:
//   { generate: true, length?: 4|5|6 }  → genera PIN aleatorio
//   { pin: "1234" }                      → guarda el PIN escogido por el jefe
//
// El hash se guarda en formato canónico scrypt$N$r$p$saltHex$keyHex (ver
// src/lib/admin-lock/pin.ts).
// -----------------------------------------------------------------------------

interface Body {
  generate?: unknown
  length?: unknown
  pin?: unknown
}

export async function PUT(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  let pin: string
  if (body.generate === true) {
    const lenRaw = typeof body.length === 'number' ? body.length : 6
    const len = lenRaw >= 4 && lenRaw <= 6 ? lenRaw : 6
    pin = generatePin(len)
  } else if (typeof body.pin === 'string') {
    if (!isValidPinFormat(body.pin)) {
      return Response.json({ error: 'PIN debe ser 4-6 dígitos' }, { status: 400 })
    }
    pin = body.pin
  } else {
    return Response.json(
      { error: 'Envía { generate: true } o { pin: "1234" }' },
      { status: 400 },
    )
  }

  const hash = hashPin(pin)

  await db
    .update(clients)
    .set({
      adminPinHash: hash,
      adminPinUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(clients.id, client.id))

  return Response.json({ ok: true, pin })
}
