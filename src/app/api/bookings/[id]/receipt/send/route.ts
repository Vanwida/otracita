import { db } from '@/db'
import {
  bookings,
  customers,
  payments,
  invoices,
  clients,
} from '@/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { sendWhatsAppMessage } from '@/lib/whatsapp/sender'
import { sendEmail } from '@/lib/email/notify'
import { PAYMENT_METHOD_LABEL, isPaymentMethod } from '@/lib/payments/methods'
import { formatCents } from '@/lib/format'

// -----------------------------------------------------------------------------
// POST /api/bookings/[id]/receipt/send
//
// Envío del recibo de una venta cobrada por WhatsApp o email (task #103).
// Llamado desde ChargedReceiptStep cuando el barbero pulsa "Enviar por
// WhatsApp" / "Enviar por email".
//
// Body: { channel: 'whatsapp' | 'email' }
//
// Reglas:
//   · Multi-tenant: requireClientAccess + ownership por clientId.
//   · El booking debe estar `completed` (no se envían recibos de citas no
//     cobradas — no es factura legal, es un recibo cortesía).
//   · WhatsApp: usa el sender existente (`sendWhatsAppMessage`) con el token
//     del cliente o el fallback de env. Si falta `customerPhone` o config,
//     devuelve 400 con mensaje legible.
//   · Email: usa el Resend wrapper existente (`sendEmail`). Si no hay email
//     en customers ni configuración Resend, devuelve 400.
//
// Texto del mensaje generado server-side: una única fuente de verdad, los
// dos canales mandan el mismo cuerpo (texto plano).
// -----------------------------------------------------------------------------

interface Body {
  channel?: unknown
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)

  const { client, isAdmin } = access
  const { id: bookingId } = await params

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const channel = body.channel
  if (channel !== 'whatsapp' && channel !== 'email') {
    return Response.json(
      { error: 'channel debe ser "whatsapp" o "email"' },
      { status: 400 },
    )
  }

  // ── Cargar booking + tenant + customer + invoice + payments ───────────
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
  if (!booking) {
    return Response.json({ error: 'Reserva no encontrada' }, { status: 404 })
  }
  if (!isAdmin && booking.clientId !== client.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (booking.status !== 'completed') {
    return Response.json(
      { error: 'Solo se envían recibos de citas ya cobradas.' },
      { status: 409 },
    )
  }

  const [tenant] = await db
    .select({
      businessName: clients.businessName,
      whatsappAccessToken: clients.whatsappAccessToken,
      whatsappPhoneNumberId: clients.whatsappPhoneNumberId,
    })
    .from(clients)
    .where(eq(clients.id, booking.clientId))

  if (!tenant) {
    return Response.json({ error: 'Tenant no encontrado' }, { status: 404 })
  }

  // ── Build cuerpo del mensaje (compartido entre canales) ───────────────
  const paymentRows = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.bookingId, bookingId),
        eq(payments.clientId, booking.clientId),
        eq(payments.status, 'succeeded'),
      ),
    )

  const invoiceRows = await db
    .select({
      number: invoices.number,
      totalCents: invoices.totalCents,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.bookingId, bookingId),
        eq(invoices.clientId, booking.clientId),
      ),
    )
    .orderBy(desc(invoices.createdAt))
  const invoice = invoiceRows[0] ?? null

  const totalCents = invoice
    ? invoice.totalCents
    : (booking.priceCents ?? 0)

  // Método humano-legible. Si hay >1 row con methods distintos → "pago
  // fraccionado". Si todos = mismo método, usamos su label canónico.
  const methodSet = new Set(
    paymentRows.map((p) => p.method).filter((m): m is string => !!m),
  )
  let methodLabel = 'Pagado'
  if (methodSet.size === 1) {
    const m = [...methodSet][0]
    if (isPaymentMethod(m)) {
      methodLabel = `Pagado con ${PAYMENT_METHOD_LABEL[m].toLowerCase()}`
    }
  } else if (methodSet.size > 1) {
    methodLabel = 'Pago fraccionado'
  }

  const firstName = booking.customerName?.trim().split(/\s+/)[0] || 'Hola'
  const businessName = tenant.businessName || 'tu barbería'
  const invoiceLine = invoice ? `Recibo nº ${invoice.number}\n` : ''

  const textBody =
    `Hola ${firstName}, te paso el recibo de tu cita de hoy.\n\n` +
    `Servicio: ${booking.service}\n` +
    `Total: ${formatCents(totalCents)}\n` +
    `${methodLabel}\n` +
    `${invoiceLine}` +
    `\nGracias por venir.\n${businessName}`

  // ── Despacho según canal ──────────────────────────────────────────────
  if (channel === 'whatsapp') {
    const phone = booking.customerPhone
    if (!phone || phone.trim().length === 0) {
      return Response.json(
        { error: 'Este cliente no tiene teléfono registrado.' },
        { status: 400 },
      )
    }
    const token =
      tenant.whatsappAccessToken || process.env.WHATSAPP_ACCESS_TOKEN || ''
    const phoneNumberId = tenant.whatsappPhoneNumberId || ''
    if (!token || !phoneNumberId) {
      return Response.json(
        {
          error:
            'WhatsApp no está configurado para esta barbería. Activa el bot en ajustes.',
        },
        { status: 400 },
      )
    }
    try {
      const r = await sendWhatsAppMessage(phoneNumberId, phone.trim(), textBody, token)
      // sendWhatsAppMessage ya no lanza en fallo de red — señala vía `.error`.
      // Comprobamos para no devolver ok:true cuando Meta rechazó el recibo.
      if (r?.error) {
        console.error('[receipt/send] WhatsApp send failed', r.error)
        return Response.json(
          { error: 'No se pudo enviar el WhatsApp. Inténtalo otra vez.' },
          { status: 502 },
        )
      }
    } catch (err) {
      console.error('[receipt/send] WhatsApp send threw', err)
      return Response.json(
        { error: 'No se pudo enviar el WhatsApp. Inténtalo otra vez.' },
        { status: 502 },
      )
    }
    return Response.json({ ok: true, channel: 'whatsapp' })
  }

  // channel === 'email'
  // Resolver email del customer por phone (mismo patrón que /receipt GET).
  const [customer] = await db
    .select({ email: customers.email })
    .from(customers)
    .where(
      and(
        eq(customers.clientId, booking.clientId),
        eq(customers.phone, booking.customerPhone),
      ),
    )
  const email = customer?.email?.trim() ?? null
  if (!email) {
    return Response.json(
      { error: 'Este cliente no tiene email registrado.' },
      { status: 400 },
    )
  }

  const subject = `Recibo · ${booking.service} · ${formatCents(totalCents)}`
  // HTML mínimo + texto plano. Sin templating ni branding pesado — un email
  // operativo, no marketing. El subject + cuerpo cubren lo importante.
  const html = `<p>Hola ${escapeHtml(firstName)}, te paso el recibo de tu cita de hoy.</p>
<ul>
  <li>Servicio: ${escapeHtml(booking.service)}</li>
  <li>Total: ${formatCents(totalCents)}</li>
  <li>${escapeHtml(methodLabel)}</li>
  ${invoice ? `<li>Recibo nº ${escapeHtml(invoice.number)}</li>` : ''}
</ul>
<p>Gracias por venir.<br/>${escapeHtml(businessName)}</p>`

  const res = await sendEmail({
    to: email,
    subject,
    html,
    text: textBody,
    tag: 'receipt',
  })
  if (!res.sent) {
    return Response.json(
      {
        error:
          res.error ||
          'No se pudo enviar el email. Inténtalo en un momento.',
      },
      { status: res.skipped ? 503 : 502 },
    )
  }
  return Response.json({ ok: true, channel: 'email', messageId: res.messageId })
}

// Pequeño escape de HTML para inyectar nombre/servicio en el cuerpo email
// sin romper el markup ni abrir XSS reflejado (aunque va a un destinatario
// confiable, mejor no acostumbrarse).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
