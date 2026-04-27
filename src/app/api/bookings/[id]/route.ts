import { db } from '@/db'
import { bookings, barbers, clients } from '@/db/schema'
import { and, eq, ne } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { sendWhatsAppMessage } from '@/lib/whatsapp/sender'
import {
  shouldAutoInvoiceBooking,
  tryAutoInvoiceForCompletedBooking,
} from '@/lib/invoicing'

// -----------------------------------------------------------------------------
// /api/bookings/[id] — PATCH para acciones del dashboard sobre una reserva.
//
// Campos aceptados:
//   · barberId (string | null)   → reasignar a otro barbero (o "cualquiera")
//   · status ('cancelled'        → cancelar
//             | 'completed')     → cerrar cita: dispara auto-facturación
//                                  (servicio + productos vendidos)
//
// Transiciones permitidas para `status`:
//   confirmed → completed   (botón "Marcar como completada" en agenda)
//   confirmed → cancelled   (botón "Cancelar reserva")
//   no_show   → cancelled   (también permitido por simetría con UI)
//   completed → ?           (no — la factura ya se emitió; usar rectificativa)
//
// Tenant-scoped: la reserva debe pertenecer al cliente autenticado.
// Si se reasigna, comprueba que el nuevo barbero (si no es null) no tenga
// otra reserva solapando en ese mismo horario. "Cualquiera" (null) no
// bloquea: el resolver de disponibilidad elegirá barbero al vuelo.
// -----------------------------------------------------------------------------

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { id } = await params

  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, id), eq(bookings.clientId, access.client.id)))
  if (!booking) return Response.json({ error: 'Reserva no encontrada.' }, { status: 404 })

  let body: {
    barberId?: unknown
    status?: unknown
    notify?: unknown
    notifyMessage?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() }

  // ── Cancel / Complete ────────────────────────────────────────────────
  if ('status' in body) {
    if (body.status !== 'cancelled' && body.status !== 'completed') {
      return Response.json(
        { error: "status debe ser 'cancelled' o 'completed'." },
        { status: 400 },
      )
    }
    if (body.status === 'completed') {
      // Solo se completan reservas confirmadas. No-show debe deshacerse
      // primero (botón "Deshacer no-show") y cancelled/completed no se
      // re-completan — para eso existen las rectificativas.
      if (booking.status !== 'confirmed') {
        return Response.json(
          { error: 'Solo se pueden completar reservas confirmadas.' },
          { status: 400 },
        )
      }
    }
    patch.status = body.status
  }

  // ── Reassign barber ──────────────────────────────────────────────────
  if ('barberId' in body) {
    const nextBarberId = body.barberId
    let barberName: string | null = null
    if (nextBarberId === null || nextBarberId === '') {
      patch.barberId = null
      patch.barber = null
    } else if (typeof nextBarberId === 'string') {
      // Verificar que pertenece al mismo cliente y está activo.
      const [newBarber] = await db
        .select()
        .from(barbers)
        .where(
          and(
            eq(barbers.id, nextBarberId),
            eq(barbers.clientId, access.client.id),
            eq(barbers.active, true),
          ),
        )
      if (!newBarber) {
        return Response.json({ error: 'Barbero destino no válido.' }, { status: 400 })
      }
      barberName = newBarber.name

      // Si NO se cancela también en este PATCH, comprobar solape en el
      // horario del destino. Si se cancela, da igual (no hay conflicto).
      if (patch.status !== 'cancelled') {
        const start = parseMinutes(booking.time)
        const end = start + booking.duration
        const sameDay = await db
          .select()
          .from(bookings)
          .where(
            and(
              eq(bookings.clientId, access.client.id),
              eq(bookings.barberId, nextBarberId),
              eq(bookings.date, booking.date),
              ne(bookings.status, 'cancelled'),
              ne(bookings.id, id),
            ),
          )
        const clash = sameDay.some((b) => {
          const bs = parseMinutes(b.time)
          const be = bs + b.duration
          return start < be && end > bs
        })
        if (clash) {
          return Response.json(
            { error: `${newBarber.name} ya tiene otra reserva a esa hora.` },
            { status: 409 },
          )
        }
      }

      patch.barberId = nextBarberId
      patch.barber = barberName
    } else {
      return Response.json({ error: 'barberId debe ser string o null.' }, { status: 400 })
    }
  }

  if (Object.keys(patch).length === 1) {
    // Solo updatedAt — nada que cambiar.
    return Response.json({ error: 'Nada que actualizar.' }, { status: 400 })
  }

  await db.update(bookings).set(patch).where(eq(bookings.id, id))
  const [updated] = await db.select().from(bookings).where(eq(bookings.id, id))

  // ── Auto-facturación al completar ────────────────────────────────────
  // Si el barbero acaba de cerrar la cita (transición confirmed→completed),
  // disparamos la factura en background. Incluye servicio + productos
  // vendidos durante la cita (las ventas con invoiced_at IS NULL).
  // Fire-and-forget — failures no rompen la respuesta del PATCH; el
  // barbero ve la cita como completada y la factura se reintenta vía
  // re-emisión manual desde el admin si algo falla.
  if (
    patch.status === 'completed' &&
    updated &&
    shouldAutoInvoiceBooking(updated) &&
    access.client.invoicingEnabled
  ) {
    tryAutoInvoiceForCompletedBooking(updated.id)
  }

  // ── Aviso opcional por WhatsApp (solo al cancelar) ──────────────────
  // Best-effort: si Meta rechaza (ventana 24h cerrada, etc), devolvemos
  // notifyStatus='failed' sin tumbar la cancelación.
  let notifyStatus: 'sent' | 'failed' | 'skipped' = 'skipped'
  if (patch.status === 'cancelled' && body.notify === true) {
    const rawMsg = typeof body.notifyMessage === 'string' ? body.notifyMessage.trim() : ''
    if (rawMsg && updated.customerPhone) {
      const [clientRow] = await db
        .select()
        .from(clients)
        .where(eq(clients.id, access.client.id))
      const token = clientRow?.whatsappAccessToken || process.env.WHATSAPP_ACCESS_TOKEN || ''
      const phoneNumberId = clientRow?.whatsappPhoneNumberId
      if (token && phoneNumberId) {
        try {
          const r = (await sendWhatsAppMessage(
            phoneNumberId,
            updated.customerPhone,
            rawMsg.slice(0, 400),
            token,
          )) as { error?: unknown }
          notifyStatus = r?.error ? 'failed' : 'sent'
        } catch {
          notifyStatus = 'failed'
        }
      } else {
        notifyStatus = 'failed'
      }
    } else {
      notifyStatus = 'failed'
    }
  }

  return Response.json({ booking: updated, notifyStatus })
}
