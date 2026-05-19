import { db } from '@/db'
import { bookings, barbers, clients } from '@/db/schema'
import { and, eq, ne } from 'drizzle-orm'
import { hasBookingOverlap, hhmmToMinutes } from '@/lib/bookings/duration'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { sendWhatsAppMessage } from '@/lib/whatsapp/sender'
// La facturación VeriFactu ya NO se dispara al cerrar la cita — es una
// acción explícita por venta (POST /api/invoices/from-booking). Por eso
// este endpoint ya no importa los helpers de invoicing.
import { recordMovementInBackground } from '@/lib/cash/record-movement'
import { bookingTotalCents } from '@/lib/bookings/total'
import { tryRatingFollowupForCompletedBooking } from '@/lib/whatsapp/followup'

// -----------------------------------------------------------------------------
// /api/bookings/[id] — PATCH para acciones del dashboard sobre una reserva.
//
// Campos aceptados:
//   · barberId (string | null)   → reasignar a otro barbero (o "cualquiera")
//   · date (YYYY-MM-DD)          → mover la cita de día (drag&drop / manual)
//   · time (HH:MM)               → mover la cita de hora (drag&drop / manual)
//   · status ('cancelled'        → cancelar
//             | 'completed')     → cerrar cita: dispara auto-facturación
//                                  (servicio + productos vendidos)
//
// date/time/barberId se pueden combinar libremente (mover hora, barbero,
// o ambos). La re-validación de solape corre UNA vez contra los valores
// FINALES (destino), usando el predicado puro compartido
// `hasBookingOverlap` (mismo buffer + match barberId|nombre que create.ts).
// R1/R3: snap a 5 min lo hace el cliente; el servidor acepta cualquier HH:MM.
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
    date?: unknown
    time?: unknown
    status?: unknown
    notify?: unknown
    notifyMessage?: unknown
    paymentMethod?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() }

  // ── Cancel / Complete ────────────────────────────────────────────────
  // `paymentMethod` solo se persiste cuando se transiciona a 'completed'
  // y el tenant tiene caja efectivo activa. En cualquier otro caso lo
  // ignoramos silenciosamente (defensa en profundidad: aunque la UI no
  // lo envíe, blindamos el endpoint).
  let paymentMethodToRecord: 'cash' | 'card' | 'online' | null = null

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

      // Si la caja efectivo está activa Y el caller envió paymentMethod,
      // lo guardamos en bookings.payment_method y disparamos
      // cash_movement enlazado en background. Si el método es inválido o
      // falta, completamos sin método (legacy/manual reconcile).
      if (
        access.client.cashRegisterEnabled &&
        typeof body.paymentMethod === 'string' &&
        ['cash', 'card', 'online'].includes(body.paymentMethod)
      ) {
        paymentMethodToRecord = body.paymentMethod as 'cash' | 'card' | 'online'
        patch.paymentMethod = paymentMethodToRecord
      }
    }
    patch.status = body.status
  }

  // ── Mover (date/time) + reasignar barbero ────────────────────────────
  // Drag&drop en la agenda y "mover manual" desde el panel detalle
  // entran por aquí. Calculamos primero los valores DESTINO (date, time,
  // barberId) combinando lo que venga en el body con lo actual de la
  // reserva, y luego corremos UNA sola re-validación de solape contra
  // esos valores finales. R1/R3.
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
  const TIME_RE = /^\d{2}:\d{2}$/

  let targetDate = booking.date
  let targetTime = booking.time
  // barberId destino: undefined = no se toca; null = "cualquiera";
  // string = barbero concreto (validado contra el tenant).
  let targetBarberId: string | null | undefined = undefined
  let targetBarberLabel = booking.barber ?? 'El profesional'

  if ('date' in body) {
    if (typeof body.date !== 'string' || !DATE_RE.test(body.date)) {
      return Response.json({ error: 'date debe ser YYYY-MM-DD.' }, { status: 400 })
    }
    targetDate = body.date
    patch.date = body.date
  }

  if ('time' in body) {
    if (typeof body.time !== 'string' || !TIME_RE.test(body.time)) {
      return Response.json({ error: 'time debe ser HH:MM.' }, { status: 400 })
    }
    const mins = parseMinutes(body.time)
    if (Number.isNaN(mins) || mins < 0 || mins >= 24 * 60) {
      return Response.json({ error: 'time fuera de rango.' }, { status: 400 })
    }
    targetTime = body.time
    patch.time = body.time
  }

  if ('barberId' in body) {
    const nextBarberId = body.barberId
    if (nextBarberId === null || nextBarberId === '') {
      targetBarberId = null
      targetBarberLabel = 'El profesional'
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
      targetBarberId = nextBarberId
      targetBarberLabel = newBarber.name
      patch.barberId = nextBarberId
      patch.barber = newBarber.name
    } else {
      return Response.json({ error: 'barberId debe ser string o null.' }, { status: 400 })
    }
  }

  // ── Re-validación de solape (destino) ────────────────────────────────
  // Corre cuando se mueve hora/día y/o se reasigna a un barbero concreto,
  // y SOLO si la reserva no se está cancelando en el mismo PATCH (una
  // cita cancelada no puede chocar con nada). "Cualquiera" (barberId
  // null) no se valida: el resolver de disponibilidad elegirá al vuelo.
  const movedTime = 'date' in body || 'time' in body
  const reassignedToConcrete = targetBarberId !== undefined && targetBarberId !== null
  // El barbero efectivo contra el que validar: el destino si se reasignó,
  // si no el actual de la reserva.
  const effectiveBarberId =
    targetBarberId !== undefined ? targetBarberId : booking.barberId

  if (
    patch.status !== 'cancelled' &&
    effectiveBarberId &&
    (movedTime || reassignedToConcrete)
  ) {
    // Nombre del barbero efectivo: el del destino si se reasignó, si no el
    // de la reserva actual. `targetBarberLabel` ya lo resuelve así arriba
    // ('El profesional' es el placeholder de "cualquiera", que aquí no
    // llega porque effectiveBarberId es truthy).
    const effectiveBarberName =
      targetBarberId !== undefined ? targetBarberLabel : booking.barber
    // FIX (#9): este check antes NO aplicaba el buffer del cliente y casaba
    // solo por barberId — divergía de create.ts/services y dejaba pasar
    // solapes que la creación rechaza (p.ej. citas legacy con barberId NULL
    // pero mismo nombre, o dentro del buffer). Ahora usa el predicado puro
    // compartido `hasBookingOverlap` (buffer + match id|nombre, fuente
    // única). El SELECT ya no filtra por barbero — el predicado lo hace
    // (así también ve las filas legacy de barberId NULL).
    const sameDay = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.clientId, access.client.id),
          eq(bookings.date, targetDate),
          ne(bookings.status, 'cancelled'),
          ne(bookings.id, id),
        ),
      )
    const clash = hasBookingOverlap(
      {
        selfId: id,
        startMinutes: hhmmToMinutes(targetTime),
        durationMin: booking.duration,
        barberId: effectiveBarberId,
        barber: effectiveBarberName,
      },
      sameDay,
      access.client.serviceBufferMinutes,
    )
    if (clash) {
      return Response.json(
        { error: `${targetBarberLabel} ya tiene otra reserva a esa hora.` },
        { status: 409 },
      )
    }
  }

  if (Object.keys(patch).length === 1) {
    // Solo updatedAt — nada que cambiar.
    return Response.json({ error: 'Nada que actualizar.' }, { status: 400 })
  }

  await db.update(bookings).set(patch).where(eq(bookings.id, id))
  const [updated] = await db.select().from(bookings).where(eq(bookings.id, id))

  // ── Facturación VeriFactu: NUNCA automática ──────────────────────────
  // Decisión de producto: cerrar la cita registra la venta para gestión
  // (cash_movement, ingresos, caja, BI) pero NO declara a Hacienda. El
  // barbero no factura el 100% de su negocio — emitir factura VeriFactu
  // es una acción EXPLÍCITA por venta ("Generar factura", patrón Booksy
  // recibo 10.01.18) vía POST /api/invoices/from-booking. Aquí ya no se
  // dispara nada fiscal; `generateInvoiceFromBooking` sigue siendo la
  // única fuente VeriFactu (hash encadenado + QR intactos), solo que
  // on-demand. La venta queda como TICKET interno hasta que se factura.

  // ── Push solicitud de reseña al cliente ──────────────────────────────
  // Solo cuando se transiciona a 'completed' (no en cancel ni en barber
  // reassign). Fire-and-forget: si el barbero olvida marcar completed, el
  // sweep diario del cron de reminders también dispara este helper. NO
  // hay un cron dedicado de followup desde este commit — cierre = trigger.
  if (patch.status === 'completed' && updated && access.client.ratingsEnabled) {
    tryRatingFollowupForCompletedBooking(updated.id)
  }

  // ── Cash movement enlazado al booking completado ─────────────────────
  // Si el barbero eligió método de pago y hay sesión de caja abierta,
  // alimentamos el cuadre del día. Suma principal + servicios EXTRA (R7)
  // vía bookingTotalCents — cita simple ⇒ idéntico al price*100 de antes.
  if (patch.status === 'completed' && paymentMethodToRecord && updated) {
    const serviceTotalCents = await bookingTotalCents(updated.id)
    if (serviceTotalCents > 0) {
      recordMovementInBackground({
        clientId: access.client.id,
        referenceType: 'booking',
        referenceId: updated.id,
        method: paymentMethodToRecord,
        amountCents: serviceTotalCents,
        createdByEmail: access.user.email,
      })
    }
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
