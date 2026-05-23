import { db } from '@/db'
import {
  tips,
  barbers,
  cashSessions,
  cashMovements,
} from '@/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import {
  requireTenantActor,
  tenantActorErrorResponse,
  actorHasManagerPermission,
} from '@/lib/auth/require-tenant-actor'

// -----------------------------------------------------------------------------
// POST /api/tips/cash — registra una propina en efectivo (Reni V1).
//
// Una propina en cash es DOBLE evento contable:
//   1) Fila en `tips` con payment_method='cash' + barber_id (atribución al
//      barbero, 100% suya, fuera del motor de comisión).
//   2) Fila en `cash_movements` con kind='tip_cash' + barber_id (afecta al
//      cuadre del día — el dinero está físicamente en el cajón).
//
// Si NO hay caja activa (cashRegisterEnabled = false o ninguna sesión abierta),
// solo creamos (1) — la propina se atribuye igual al barbero pero NO impacta
// cuadre. Esto evita perder atribución cuando el barbero usa /caja para
// gestionar propinas sin tener cuadre diario activo.
//
// Ambos inserts van en la MISMA transacción (atomicidad: o las dos o ninguna).
//
// Body:
//   {
//     amountCents: number (> 0),
//     barberId: string (uuid),
//     bookingId?: string (uuid, opcional — propina suelta sin servicio asociado),
//     notes?: string,
//   }
//
// El customerPhone se rellena con '—' como sentinela porque la columna es
// NOT NULL y una propina en mano puede no tener cliente identificado.
// -----------------------------------------------------------------------------

interface Body {
  amountCents?: unknown
  barberId?: unknown
  bookingId?: unknown
  notes?: unknown
}

export async function POST(req: Request) {
  // Admin + role='barber' caen aquí. Barbero solo puede atribuirse propinas
  // a SÍ MISMO. Manager con `edit_others_bookings` puede atribuir a otro
  // (caso "el dueño manager registra una propina cash del equipo").
  const access = await requireTenantActor(req)
  if (!access.ok) return tenantActorErrorResponse(access)
  const { client, user } = access

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  // Validación: importe.
  const amountCents =
    typeof body.amountCents === 'number'
      ? body.amountCents
      : Number.parseInt(String(body.amountCents ?? ''), 10)
  if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > 1_000_000_000) {
    return Response.json({ error: 'Importe inválido' }, { status: 400 })
  }

  // Validación: barbero — obligatorio, debe pertenecer al tenant + activo.
  const barberId = typeof body.barberId === 'string' ? body.barberId.trim() : ''
  if (!barberId) {
    return Response.json({ error: 'Barbero obligatorio' }, { status: 400 })
  }
  const [barber] = await db
    .select({ id: barbers.id, name: barbers.name })
    .from(barbers)
    .where(
      and(
        eq(barbers.clientId, client.id),
        eq(barbers.id, barberId),
        eq(barbers.active, true),
      ),
    )
  if (!barber) {
    return Response.json(
      { error: 'Ese barbero no existe o no está activo.' },
      { status: 400 },
    )
  }

  // Ownership: barbero operator solo se atribuye propinas a sí mismo.
  // Manager con `edit_others_bookings` puede registrar a nombre de otro.
  if (!access.isAdmin && access.barberId) {
    const canAttributeOther = actorHasManagerPermission(access, 'edit_others_bookings')
    if (!canAttributeOther && barberId !== access.barberId) {
      return Response.json(
        { error: 'Solo puedes registrar tus propias propinas.' },
        { status: 403 },
      )
    }
  }

  // Validación opcional: bookingId — si viene, no validamos a fondo (sólo
  // que sea string), porque las propinas espontáneas no necesitan booking.
  const bookingId =
    typeof body.bookingId === 'string' && body.bookingId.trim().length > 0
      ? body.bookingId.trim()
      : null

  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 500) : null

  // ¿Hay sesión de caja abierta? Sólo si cashRegisterEnabled está activo —
  // el chequeo es defensivo (si llega request sin caja activa creamos sólo
  // la propina, sin error: la UI nueva no debería llegar aquí sin caja, pero
  // el endpoint queda robusto para llamadas desde la app móvil futura).
  const session = client.cashRegisterEnabled
    ? (
        await db
          .select()
          .from(cashSessions)
          .where(
            and(eq(cashSessions.clientId, client.id), isNull(cashSessions.closedAt)),
          )
      )[0]
    : undefined

  const now = new Date()

  const result = await db.transaction(async (tx) => {
    const [tipRow] = await tx
      .insert(tips)
      .values({
        clientId: client.id,
        bookingId,
        amountCents,
        status: 'paid',
        paymentMethod: 'cash',
        barberId: barber.id,
        barberName: barber.name,
        customerPhone: '—', // sentinela: propina en mano sin cliente identificado
        paidAt: now,
      })
      .returning({ id: tips.id })

    let movementId: string | null = null
    if (session) {
      const [mov] = await tx
        .insert(cashMovements)
        .values({
          clientId: client.id,
          sessionId: session.id,
          kind: 'tip_cash',
          method: 'cash',
          amountCents,
          barberId: barber.id,
          referenceType: bookingId ? 'booking' : null,
          referenceId: bookingId,
          notes,
          createdByEmail: user.email,
        })
        .returning({ id: cashMovements.id })
      movementId = mov.id
    }

    return { tipId: tipRow.id, movementId }
  })

  return Response.json(
    {
      tipId: result.tipId,
      movementId: result.movementId,
      cashRegistered: result.movementId !== null,
    },
    { status: 201 },
  )
}
