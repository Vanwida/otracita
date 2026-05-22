import type { NextRequest } from 'next/server'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { sendOpsEmailWithWhatsappFallback } from '@/lib/email/notify'
import { SITE_ORIGIN } from '@/lib/site'

// -----------------------------------------------------------------------------
// POST /api/whatsapp/bot-request  (#53)
//
// Solicitud self-service de activación del bot WhatsApp. El barbero rellena
// el form en /dashboard/marketing/whatsapp:
//   · phoneRequested        — número WhatsApp Business que quiere usar (E.164)
//   · businessLegalName     — CIF / razón social legal (Meta Business Manager
//                             pide nombre fiscal, NO el comercial)
//   · fbBusinessId          — opcional, ayuda a Alex a localizarlo rápido en
//                             Meta Business Manager
//
// Flujo:
//   1. Validamos sesión (requireClientAccess — multi-tenant safe).
//   2. Validamos inputs server-side (phone E.164 + businessLegalName no vacío).
//   3. UPDATE clients SET whatsapp_bot_request = $1, whatsapp_bot_requested_at = NOW().
//   4. Email a alex@otracita.es con todos los datos + link admin para activar.
//      Si Postmark no está configurado, fallback a WhatsApp (notifyAlex).
//
// NO marcamos `whatsappPhoneNumberId` aquí — eso lo hace el admin tras
// completar el alta en Meta. Mientras tanto el banner muestra "En cola".
// -----------------------------------------------------------------------------

const OPS_EMAIL = 'alex@otracita.es'

export async function POST(req: NextRequest) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = parseBody(body)
  if ('error' in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 })
  }
  const { phoneRequested, businessLegalName, fbBusinessId } = parsed

  const submittedAt = new Date()
  await db
    .update(clients)
    .set({
      whatsappBotRequest: {
        phoneRequested,
        businessLegalName,
        fbBusinessId: fbBusinessId || null,
        submittedAt: submittedAt.toISOString(),
      },
      whatsappBotRequestedAt: submittedAt,
      updatedAt: submittedAt,
    })
    .where(eq(clients.id, client.id))

  // Ops notification — email primero, WhatsApp como fallback.
  const adminUrl = `${SITE_ORIGIN}/admin/clients/${client.id}`
  const subject = `[otracita] Solicitud bot WhatsApp — ${businessLegalName}`
  const textBody = [
    `Negocio: ${client.businessName}`,
    `Tenant ID: ${client.id}`,
    `Slug: ${client.publicSlug ?? '—'}`,
    `Email contacto: ${client.email}`,
    '',
    `Número WhatsApp solicitado: ${phoneRequested}`,
    `Nombre legal: ${businessLegalName}`,
    `Facebook Business ID: ${fbBusinessId || '—'}`,
    '',
    `Para activarlo: ${adminUrl} → campo whatsappPhoneNumberId`,
  ].join('\n')

  // Fire-and-forget — la solicitud está guardada, no bloqueamos respuesta.
  void sendOpsEmailWithWhatsappFallback({
    to: OPS_EMAIL,
    subject,
    textBody,
    tag: 'bot-activation-request',
  }).catch((err: unknown) => {
    console.error('[bot-request] notificación ops falló (ya guardado en DB):', err)
  })

  return Response.json({ ok: true })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ParsedBody =
  | { phoneRequested: string; businessLegalName: string; fbBusinessId: string }
  | { error: string }

function parseBody(raw: unknown): ParsedBody {
  if (!raw || typeof raw !== 'object') {
    return { error: 'Body inválido' }
  }
  const obj = raw as Record<string, unknown>

  const phoneRaw = typeof obj.phoneRequested === 'string' ? obj.phoneRequested.trim() : ''
  const businessLegalNameRaw =
    typeof obj.businessLegalName === 'string' ? obj.businessLegalName.trim() : ''
  const fbBusinessIdRaw = typeof obj.fbBusinessId === 'string' ? obj.fbBusinessId.trim() : ''

  if (!businessLegalNameRaw) {
    return { error: 'El nombre legal del negocio es obligatorio' }
  }
  if (businessLegalNameRaw.length > 200) {
    return { error: 'El nombre legal es demasiado largo (máx. 200 caracteres)' }
  }

  // Validación E.164 — libphonenumber acepta "+34..." o número nacional con
  // defaultCountry. Forzamos formato internacional para evitar ambigüedad.
  const phone = parsePhoneNumberFromString(phoneRaw, 'ES')
  if (!phone || !phone.isValid()) {
    return { error: 'Número de WhatsApp inválido. Usa formato internacional (+34...).' }
  }
  const phoneE164 = phone.number // E.164 con "+" delante

  // fbBusinessId es opcional. Sólo dígitos (Meta IDs son numéricos largos).
  if (fbBusinessIdRaw && !/^\d{6,30}$/.test(fbBusinessIdRaw)) {
    return { error: 'Facebook Business ID inválido (debe ser numérico).' }
  }

  return {
    phoneRequested: phoneE164,
    businessLegalName: businessLegalNameRaw,
    fbBusinessId: fbBusinessIdRaw,
  }
}
