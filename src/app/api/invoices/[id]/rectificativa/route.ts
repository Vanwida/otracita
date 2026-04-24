import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { createRectificativa, type RectificationMotivo } from '@/lib/invoicing'

// -----------------------------------------------------------------------------
// POST /api/invoices/[id]/rectificativa
//
// Emite una factura rectificativa (R1-R5) que referencia a la original.
// Tenant-scoped via sesión del barbero. Auditoría: la original queda marcada
// como status='rectified' y apunta a la nueva vía rectifiesInvoiceId.
//
// Body (JSON):
//   motivo: 'R1'|'R2'|'R3'|'R4'|'R5'
//   newSubtotalCents: number
//   newIvaAmountCents: number
//   newTotalCents: number
//   notes?: string
// -----------------------------------------------------------------------------

function isMotivo(m: unknown): m is RectificationMotivo {
  return typeof m === 'string' && ['R1', 'R2', 'R3', 'R4', 'R5'].includes(m)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) return Response.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const { id: originalInvoiceId } = await params

  let body: {
    motivo?: unknown
    newSubtotalCents?: unknown
    newIvaAmountCents?: unknown
    newTotalCents?: unknown
    notes?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (!isMotivo(body.motivo)) {
    return Response.json({ error: 'Motivo inválido. Debe ser R1, R2, R3, R4 o R5.' }, { status: 400 })
  }

  const newSubtotalCents = Number(body.newSubtotalCents)
  const newIvaAmountCents = Number(body.newIvaAmountCents)
  const newTotalCents = Number(body.newTotalCents)
  if (
    !Number.isInteger(newSubtotalCents) ||
    !Number.isInteger(newIvaAmountCents) ||
    !Number.isInteger(newTotalCents) ||
    newSubtotalCents < 0 ||
    newIvaAmountCents < 0 ||
    newTotalCents < 0
  ) {
    return Response.json(
      { error: 'Importes deben ser enteros en céntimos >= 0.' },
      { status: 400 },
    )
  }

  // Sanity check: total debe ser base + iva (tolerancia 1 céntimo por
  // redondeo). Si no cuadra, el barbero se ha equivocado al rellenar.
  const expectedTotal = newSubtotalCents + newIvaAmountCents
  if (Math.abs(expectedTotal - newTotalCents) > 1) {
    return Response.json(
      { error: `El total (${newTotalCents}c) no coincide con base+IVA (${expectedTotal}c).` },
      { status: 400 },
    )
  }

  try {
    const result = await createRectificativa(client.id, {
      originalInvoiceId,
      motivo: body.motivo,
      newSubtotalCents,
      newIvaAmountCents,
      newTotalCents,
      notes: typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : undefined,
    })
    return Response.json(result, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al crear rectificativa'
    return Response.json({ error: msg }, { status: 400 })
  }
}
