import { db } from '@/db'
import { customers, loyaltyLedger } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// POST /api/loyalty/adjust
//
// Ajuste manual del saldo de un cliente por parte del barbero. Úsalo para:
//   · Regalar sellos/puntos (delta > 0, note="cortesía navidad")
//   · Restar por error / mala conducta (delta < 0, note="no-show retroactivo")
//
// NO se usa para canjes — para eso está /api/loyalty/redeem, que guarda el
// rewardSnapshot y valida que el saldo alcanza. Este endpoint es la puerta
// de escape para situaciones raras.
//
// Body: { customerId: uuid, delta: integer, note?: string }
//
// Reglas:
//   · delta debe ser distinto de 0 y en rango [-1000, +1000]
//   · customerId debe pertenecer al mismo tenant (seguridad multi-tenant)
//   · note opcional, se guarda como free text (truncado a 500 chars)
// -----------------------------------------------------------------------------

interface AdjustBody {
  customerId?: unknown
  delta?: unknown
  note?: unknown
}

const MAX_ADJUSTMENT = 1000

export async function POST(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)

  let body: AdjustBody
  try {
    body = (await request.json()) as AdjustBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const customerId = typeof body.customerId === 'string' ? body.customerId : ''
  if (!customerId) {
    return Response.json({ error: 'customerId required' }, { status: 400 })
  }

  const deltaRaw =
    typeof body.delta === 'number' ? body.delta : Number.parseInt(String(body.delta ?? ''), 10)
  if (!Number.isInteger(deltaRaw) || deltaRaw === 0) {
    return Response.json({ error: 'delta debe ser un entero distinto de 0' }, { status: 400 })
  }
  const delta = Math.max(-MAX_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, deltaRaw))

  const note =
    typeof body.note === 'string' ? body.note.trim().slice(0, 500) : null

  // Verificar que el customer pertenece a este tenant.
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.clientId, access.client.id)))

  if (!customer) {
    return Response.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }

  const [inserted] = await db
    .insert(loyaltyLedger)
    .values({
      clientId: access.client.id,
      customerId: customer.id,
      bookingId: null,
      delta,
      reason: 'adjustment_manual',
      note,
      rewardSnapshot: null,
      createdBy: `barber:${access.client.id}`,
    })
    .returning()

  return Response.json({ ok: true, ledgerId: inserted.id, delta })
}
