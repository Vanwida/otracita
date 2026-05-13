import { db } from '@/db'
import { promoPushes } from '@/db/schema'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'
import { dispatchUserNotification } from '@/lib/notifications/dispatch'
import { sendWhatsAppMessage } from '@/lib/whatsapp/sender'
import { findEligibleCustomers } from '@/lib/promos/eligible-customers'
import { resolveWindow, type WindowPreset } from '@/lib/promos/detect-gaps'
import { DISCOUNT_STOPS } from '@/lib/promos/defaults'

// -----------------------------------------------------------------------------
// POST /api/promos/send
//
// Body:
//   {
//     window: WindowPreset | { start, end },
//     discountPct: 5 | 10 | 15 | 20 | 25,
//     message: string,             // texto final (editable por el barbero)
//     customerPhones: string[],    // subset de los elegibles que el barbero confirmó
//   }
//
// Por cada customer phone:
//   1. Verificar que sigue siendo elegible (rate limit + criterios) — en caso
//      de que el barbero haya esperado horas entre preview y send.
//   2. dispatchUserNotification: push si tiene PWA, WhatsApp si no, none si
//      no aplicable.
//   3. INSERT en promo_pushes para auditoría + rate limiting.
//
// Respuesta: contadores agregados (sent, channels usados, skipped por
// rate-limit/inelegible).
// -----------------------------------------------------------------------------

interface SendBody {
  window?: WindowPreset | { start?: string; end?: string }
  discountPct?: number
  message?: string
  customerPhones?: string[]
}

export async function POST(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'promosContextuales')
  if (gate) return gate
  const { client } = access

  if (!client.promosEnabled) {
    return Response.json({ error: 'Promos no activadas' }, { status: 403 })
  }

  let body: SendBody
  try {
    body = (await req.json()) as SendBody
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const discountPct = Number(body.discountPct)
  if (!DISCOUNT_STOPS.includes(discountPct as (typeof DISCOUNT_STOPS)[number])) {
    return Response.json({ error: 'Descuento inválido' }, { status: 400 })
  }
  const message = (body.message ?? '').trim()
  if (message.length < 10 || message.length > 500) {
    return Response.json({ error: 'Mensaje fuera de rango (10-500 chars)' }, { status: 400 })
  }
  const phones = Array.isArray(body.customerPhones) ? body.customerPhones.filter((p) => typeof p === 'string') : []
  if (phones.length === 0) {
    return Response.json({ error: 'Sin destinatarios' }, { status: 400 })
  }

  // Resolver ventana para el snapshot del registro.
  let windowStart: string
  let windowEnd: string
  if (typeof body.window === 'string') {
    const w = resolveWindow(body.window)
    windowStart = w.start
    windowEnd = w.end
  } else if (body.window && typeof body.window === 'object' && body.window.start && body.window.end) {
    windowStart = body.window.start
    windowEnd = body.window.end
  } else {
    return Response.json({ error: 'Ventana inválida' }, { status: 400 })
  }

  // Re-validamos elegibilidad ahora — el barbero podría haber esperado horas
  // entre /preview y /send y otro proceso (otro device, cron) podría haber
  // mandado promos en el ínterim.
  const eligibleNow = await findEligibleCustomers(client.id)
  const eligibleSet = new Map(eligibleNow.map((c) => [c.phone, c]))

  const token = client.whatsappAccessToken || process.env.WHATSAPP_ACCESS_TOKEN || ''
  const phoneNumberId = client.whatsappPhoneNumberId

  let sentPush = 0
  let sentWhatsapp = 0
  let skipped = 0
  let none = 0

  for (const phone of phones) {
    const eligible = eligibleSet.get(phone)
    if (!eligible) {
      skipped++
      continue
    }

    const dispatch = await dispatchUserNotification({
      phone,
      clientId: client.id,
      push: {
        title: `Promo en ${client.businessName}`,
        body: message,
        url: client.publicSlug ? `/b/${client.publicSlug}` : '/',
        tag: `promo-${Date.now()}`,
        data: { kind: 'promo', discountPct },
      },
      whatsappFallback: token && phoneNumberId
        ? async () => {
            await sendWhatsAppMessage(phoneNumberId, phone, message, token)
          }
        : undefined,
    })

    if (dispatch.channel === 'push') sentPush++
    else if (dispatch.channel === 'whatsapp') sentWhatsapp++
    else none++

    if (dispatch.channel !== 'none') {
      await db.insert(promoPushes).values({
        clientId: client.id,
        customerPhone: phone,
        customerName: eligible.name,
        discountPct,
        windowStart,
        windowEnd,
        channel: dispatch.channel,
        message,
      })
    }
  }

  return Response.json({
    sent: sentPush + sentWhatsapp,
    sentPush,
    sentWhatsapp,
    skipped,
    none,
    requested: phones.length,
  })
}
