import { db } from '@/db'
import { clients, conversations, waitlist } from '@/db/schema'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { dispatchUserNotification } from '@/lib/notifications/dispatch'
import { sendWhatsAppMessage } from '@/lib/whatsapp/sender'
import { formatDateSpanish } from '@/lib/google-calendar'
import { publicPagePath } from '@/lib/site'
import { BUSINESS_TIMEZONE, MS_IN_MINUTE } from '@/lib/time'
import {
  WAITLIST_NOTIFY_LEAD_MIN_MINUTES,
  WAITLIST_NOTIFICATION_GRACE_MINUTES,
  type WaitlistRow,
} from './types'

// -----------------------------------------------------------------------------
// Lista de espera por slot específico (#88) — matcher al cancelar.
//
// Punto único llamado desde TODOS los flujos de cancelación de booking
// (PWA, dashboard, bot WhatsApp engine). Cuando una cita se cancela, miramos
// si alguien estaba esperando ese slot. Si hay match:
//
//   1. Saltamos si la cancelación llega muy cerca (< WAITLIST_NOTIFY_LEAD_MIN_MINUTES)
//      del slot → avisar a 5 min vista solo frustra.
//   2. Saltamos si alguien ya está "notified" en ese cliente para el mismo día
//      dentro de la ventana de gracia → no spammeamos la cola.
//   3. Avisamos al PRIMERO en orden de llegada (`createdAt asc`) entre los que
//      casan en barberId (o "cualquiera") y cuyo rango deseado
//      [desiredTimeStart, desiredTimeEnd) cubra la hora liberada.
//   4. Marcamos esa entrada como `notified` y persistimos el `time` ofrecido
//      para que cuando el cliente acepte sepamos qué reservar.
//   5. Canal: push si tiene PWA, WhatsApp freeform si no. NUNCA ambos
//      (`dispatchUserNotification`). Sin template aprobada de Meta → si la
//      ventana de 24h de WhatsApp está cerrada y no hay PWA, queda como
//      'pending_template' (status='waiting' + notifiedAt set) para que el
//      admin lo vea en dashboard y avise manualmente.
//
// Esta función NUNCA tira el flujo de cancelación: cualquier error se logea
// y se devuelve `{ ok: false, reason }` — la cancelación sigue su curso.
// -----------------------------------------------------------------------------

export interface CancelledBookingInput {
  /** Tenant cuya agenda emite la cancelación. Resuelto previamente. */
  clientId: string
  /** Booking que se cancela (para descartar avisarse a uno mismo). */
  bookingId: string
  date: string             // YYYY-MM-DD
  time: string             // HH:MM
  duration: number         // minutos — define el rango liberado
  barberId: string | null
  barber: string | null    // nombre snapshot (para WhatsApp legacy)
  service: string | null
  /** Teléfono del cliente cuya cita se canceló — descartado del match
   *  (no nos avisamos a nosotros mismos por si estábamos en lista). */
  customerPhone: string
}

export interface NotifyResult {
  ok: boolean
  reason?:
    | 'too_late'
    | 'already_notified'
    | 'no_match'
    | 'whatsapp_template_required'
    | 'no_channel'
    | 'error'
  entryId?: string
  channel?: 'push' | 'whatsapp' | 'none'
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function toHHMM(minutes: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.floor(minutes)))
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** Minuto del día (Madrid) actual. Comparable con time HH:MM si la fecha
 *  pasada es == hoy en TZ Madrid. */
function nowMinutesInMadrid(): number {
  const now = new Date()
  const hhmm = now.toLocaleTimeString('en-GB', {
    timeZone: BUSINESS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return toMinutes(hhmm)
}

function todayInMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE })
}

/** ¿Hay menos de `lead` minutos entre AHORA y el inicio del slot ofrecido? */
function slotIsTooClose(date: string, time: string, leadMin: number): boolean {
  const today = todayInMadrid()
  if (date < today) return true // ya pasó el día
  if (date > today) return false // es un día futuro → siempre hay margen
  const slotMin = toMinutes(time)
  const nowMin = nowMinutesInMadrid()
  return slotMin - nowMin < leadMin
}

/** ¿La hora liberada [time, time+duration) cae dentro del rango deseado
 *  [desiredTimeStart, desiredTimeEnd) de una entrada? Se considera match si:
 *
 *  - desiredTimeStart/End set → se intersectan los rangos.
 *  - desiredTimeStart/End nulos pero `time` set en la entrada → match exacto
 *    (compat con entradas que solo guardan la hora pivote).
 *  - desiredTimeStart/End nulos y `time` también nulo → match cualquier
 *    hora del día (entrada estilo "bot legacy" en este día). */
function entryMatchesTime(
  entry: WaitlistRow,
  freedStart: string,
  freedEnd: string,
): boolean {
  if (entry.desiredTimeStart && entry.desiredTimeEnd) {
    const dStart = toMinutes(entry.desiredTimeStart)
    const dEnd = toMinutes(entry.desiredTimeEnd)
    const fStart = toMinutes(freedStart)
    const fEnd = toMinutes(freedEnd)
    return fStart < dEnd && fEnd > dStart
  }
  if (entry.time) {
    return entry.time === freedStart
  }
  return true
}

function entryMatchesBarber(
  entry: WaitlistRow,
  freedBarberId: string | null,
  freedBarberName: string | null,
): boolean {
  // Entrada con barberId canónico (flujo nuevo) → comparar uuid.
  if (entry.barberId) return entry.barberId === freedBarberId
  // Entrada legacy con barber TEXT (flujo bot) → comparar nombre por igualdad
  // case-insensitive. Fallback razonable: si la entrada NO especifica barbero,
  // cualquier barbero vale.
  if (entry.barber && freedBarberName) {
    return entry.barber.trim().toLowerCase() === freedBarberName.trim().toLowerCase()
  }
  // Sin filtro de barbero → cualquier match vale.
  return true
}

/**
 * ¿Está la ventana de 24h de WhatsApp abierta para ese par cliente/teléfono?
 *
 * Heurística: usamos `conversations.lastInteraction`. Si el customer
 * intercambió mensaje con el bot en las últimas 24h tenemos ventana abierta
 * → mensaje libre. Si no, Meta exige plantilla aprobada (que aún no
 * tenemos para waitlist) → no debemos enviar nada por WhatsApp.
 */
async function whatsappWindowOpen(clientId: string, phone: string): Promise<boolean> {
  const [row] = await db
    .select({ lastInteraction: conversations.lastInteraction })
    .from(conversations)
    .where(and(eq(conversations.clientId, clientId), eq(conversations.customerPhone, phone)))
    .limit(1)
  if (!row?.lastInteraction) return false
  const ageMs = Date.now() - row.lastInteraction.getTime()
  // 23h55 — margen para no quedarnos justo en el filo.
  return ageMs < 23 * 60 * MS_IN_MINUTE + 55 * MS_IN_MINUTE
}

/**
 * Devuelve la primera entrada de waitlist que casa con el slot liberado.
 * Mantiene orden FIFO (createdAt asc) y prioriza:
 *   1. Entradas con barberId/barber EXACTO al barbero del slot.
 *   2. Entradas con barbero NULL (cualquiera).
 * Dentro de cada bucket, la más antigua gana.
 */
export async function findMatchingEntries(
  cancelled: CancelledBookingInput,
): Promise<WaitlistRow[]> {
  const candidates = await db
    .select()
    .from(waitlist)
    .where(
      and(
        eq(waitlist.clientId, cancelled.clientId),
        eq(waitlist.date, cancelled.date),
        eq(waitlist.status, 'waiting'),
      ),
    )
    .orderBy(asc(waitlist.createdAt))

  if (candidates.length === 0) return []

  const freedStart = cancelled.time
  const freedEnd = toHHMM(toMinutes(cancelled.time) + Math.max(cancelled.duration, 5))

  const valid = candidates.filter((c) => {
    // Descartar al propio cliente cancelando — si una persona se canceló
    // y resulta que también estaba en waitlist (caso raro), no nos
    // mandamos un push a nosotros mismos.
    if (c.customerPhone === cancelled.customerPhone) return false
    // Descartar expiradas (por si el cron aún no ha pasado).
    if (c.expiresAt && c.expiresAt.getTime() < Date.now()) return false
    if (!entryMatchesTime(c, freedStart, freedEnd)) return false
    if (!entryMatchesBarber(c, cancelled.barberId, cancelled.barber)) return false
    return true
  })

  // Prioridad: barbero exacto > cualquiera.
  const exact = valid.filter(
    (c) =>
      (c.barberId && c.barberId === cancelled.barberId) ||
      (c.barber && cancelled.barber && c.barber.trim().toLowerCase() === cancelled.barber.trim().toLowerCase()),
  )
  const any = valid.filter((c) => !c.barberId && !c.barber)
  return [...exact, ...any]
}

/** ¿Hay ya alguien NOTIFIED en este día/cliente dentro de la ventana de gracia?
 *  Si sí, no notificamos a nadie más todavía — el bot legacy ya implementa
 *  exactamente este patrón (`notifyWaitlist` en engine.ts). */
async function someoneAlreadyNotified(clientId: string, date: string): Promise<boolean> {
  const rows = await db
    .select({ notifiedAt: waitlist.notifiedAt })
    .from(waitlist)
    .where(
      and(
        eq(waitlist.clientId, clientId),
        eq(waitlist.date, date),
        eq(waitlist.status, 'notified'),
      ),
    )
    .limit(5)

  if (rows.length === 0) return false
  const cutoff = Date.now() - WAITLIST_NOTIFICATION_GRACE_MINUTES * MS_IN_MINUTE
  return rows.some((r) => r.notifiedAt && r.notifiedAt.getTime() > cutoff)
}

/** Envía la notificación de "se ha liberado tu hora" al cliente.
 *
 *  Push si tiene PWA, WhatsApp freeform (si ventana 24h abierta), o
 *  `pending_template` si nada de eso aplica. Nunca ambos canales. */
async function notifyEntry(
  entry: WaitlistRow,
  cancelled: CancelledBookingInput,
  client: { id: string; businessName: string | null; publicSlug: string | null; whatsappPhoneNumberId: string | null; whatsappAccessToken: string | null },
): Promise<NotifyResult> {
  const dateLabel = formatDateSpanish(cancelled.date)
  const barberLabel = cancelled.barber ? ` con ${cancelled.barber}` : ''
  const serviceLabel = cancelled.service ?? entry.service ?? 'tu servicio'
  const businessName = client.businessName || 'la barbería'

  // Marcamos primero como notified para que carreras concurrentes (dos
  // cancelaciones simultáneas) no avisen a la misma persona dos veces. Si el
  // envío falla, lo revertimos al final.
  const offeredTime = cancelled.time
  await db
    .update(waitlist)
    .set({ status: 'notified', notifiedAt: new Date(), time: offeredTime })
    .where(eq(waitlist.id, entry.id))

  const url = client.publicSlug ? publicPagePath(client.publicSlug) : '/'

  const dispatched = await dispatchUserNotification({
    phone: entry.customerPhone,
    clientId: client.id,
    push: {
      title: `Hueco libre en ${businessName}`,
      body: `${serviceLabel}${barberLabel} · ${dateLabel} a las ${offeredTime}. ¡Reserva antes de que vuele!`,
      url,
      tag: `waitlist-${entry.id}`,
      data: { kind: 'waitlist_slot_available', waitlistId: entry.id, date: cancelled.date, time: offeredTime },
    },
    whatsappFallback:
      client.whatsappPhoneNumberId && client.whatsappAccessToken
        ? async () => {
            // Ventana 24h: si está cerrada, Meta rechaza el freeform — solo
            // mandamos si está abierta. Sin template aprobada → si está
            // cerrada, dejamos la entrada en pending_template.
            const open = await whatsappWindowOpen(client.id, entry.customerPhone)
            if (!open) {
              throw new Error('whatsapp_window_closed')
            }
            const name = entry.customerName ? `${entry.customerName}, ` : ''
            const reserveUrl = client.publicSlug
              ? `https://otracita.es${publicPagePath(client.publicSlug)}`
              : ''
            const reserveLine = reserveUrl ? `\n\nReserva aquí: ${reserveUrl}` : ''
            const body =
              `${name}¡se ha liberado un hueco en ${businessName}!\n\n` +
              `${serviceLabel}${barberLabel}\n${dateLabel} a las ${offeredTime}${reserveLine}`
            await sendWhatsAppMessage(
              client.whatsappPhoneNumberId!,
              entry.customerPhone,
              body,
              client.whatsappAccessToken!,
            )
          }
        : undefined,
  }).catch((err) => {
    console.warn('[waitlist] dispatch failed:', err)
    return null
  })

  if (!dispatched || dispatched.channel === 'none') {
    // Ni push ni WhatsApp pudieron disparar. Si el motivo más probable es la
    // ventana de 24h cerrada (sin push tampoco), dejamos un marcador para que
    // el admin lo vea en el dashboard. Volvemos a status='waiting' con
    // notifiedAt set: el dashboard puede filtrar por "notifiedAt no nulo +
    // status waiting" como "pendientes manuales".
    return {
      ok: false,
      reason: 'whatsapp_template_required',
      entryId: entry.id,
      channel: 'none',
    }
  }

  return { ok: true, entryId: entry.id, channel: dispatched.channel }
}

/**
 * Punto de entrada llamado desde TODOS los flujos de cancelación de booking.
 * No tira el flujo de la cancelación: cualquier error se logea y se devuelve
 * `{ ok: false, reason: 'error' }`.
 */
export async function onBookingCancelled(
  cancelled: CancelledBookingInput,
): Promise<NotifyResult> {
  try {
    // Guard #1: si el slot ya está prácticamente encima, ni intentamos avisar.
    if (slotIsTooClose(cancelled.date, cancelled.time, WAITLIST_NOTIFY_LEAD_MIN_MINUTES)) {
      return { ok: false, reason: 'too_late' }
    }

    // Guard #2: si alguien ya está notified en este día y aún tiene gracia,
    // mantenemos la cola (no avisamos a varios sobre el mismo slot).
    if (await someoneAlreadyNotified(cancelled.clientId, cancelled.date)) {
      return { ok: false, reason: 'already_notified' }
    }

    const matches = await findMatchingEntries(cancelled)
    if (matches.length === 0) return { ok: false, reason: 'no_match' }

    // Cargamos el cliente UNA vez (necesitamos businessName, slug, creds WA).
    const [client] = await db
      .select({
        id: clients.id,
        businessName: clients.businessName,
        publicSlug: clients.publicSlug,
        whatsappPhoneNumberId: clients.whatsappPhoneNumberId,
        whatsappAccessToken: clients.whatsappAccessToken,
      })
      .from(clients)
      .where(eq(clients.id, cancelled.clientId))
    if (!client) return { ok: false, reason: 'error' }

    return await notifyEntry(matches[0], cancelled, client)
  } catch (err) {
    console.error('[waitlist] onBookingCancelled failed:', err)
    return { ok: false, reason: 'error' }
  }
}

/** Helper para tests + endpoints admin: marca como expiradas todas las entries
 *  cuyo expiresAt ya pasó. No usado en runtime (no hay cron #88 todavía); se
 *  puede llamar puntual desde un endpoint admin. */
export async function expirePastWaitlistEntries(clientId?: string): Promise<number> {
  const filter = clientId
    ? and(eq(waitlist.clientId, clientId), inArray(waitlist.status, ['waiting', 'notified']))
    : inArray(waitlist.status, ['waiting', 'notified'])
  const rows = await db.select({ id: waitlist.id, expiresAt: waitlist.expiresAt }).from(waitlist).where(filter)
  const now = Date.now()
  const stale = rows.filter((r) => r.expiresAt && r.expiresAt.getTime() < now)
  if (stale.length === 0) return 0
  await db
    .update(waitlist)
    .set({ status: 'expired' })
    .where(
      inArray(
        waitlist.id,
        stale.map((s) => s.id),
      ),
    )
  return stale.length
}
