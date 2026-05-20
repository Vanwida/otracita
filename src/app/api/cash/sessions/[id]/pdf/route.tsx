import type { NextRequest } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { db } from '@/db'
import { cashSessions, cashMovements } from '@/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import {
  CierreCajaDocument,
  type CierreCajaMovementRow,
} from '@/lib/pdf/cierre-caja'
import {
  signedAmount,
  MOVEMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  type MovementKind,
  type PaymentMethod,
} from '@/lib/cash/compute'
import { BUSINESS_TIMEZONE } from '@/lib/time'

// -----------------------------------------------------------------------------
// GET /api/cash/sessions/[id]/pdf
//
// Devuelve un PDF "Cierre de caja" para una sesión cerrada del cliente
// autenticado. Si la sesión está abierta o no pertenece al tenant, 404.
//
// Runtime Node por @react-pdf/renderer (fontkit + pdfkit).
// -----------------------------------------------------------------------------

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function formatTime(date: Date): string {
  return date.toLocaleTimeString('es-ES', {
    timeZone: BUSINESS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatLongDate(date: Date): string {
  const formatted = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: BUSINESS_TIMEZONE,
  }).format(date)
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

function formatShortDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)

  const { id } = await params

  // Sesión scoped al tenant
  const [session] = await db
    .select()
    .from(cashSessions)
    .where(and(eq(cashSessions.id, id), eq(cashSessions.clientId, access.client.id)))

  if (!session) {
    return Response.json({ error: 'Sesión no encontrada' }, { status: 404 })
  }
  if (!session.closedAt) {
    return Response.json(
      { error: 'La sesión todavía está abierta — ciérrala primero.' },
      { status: 400 },
    )
  }

  // Movimientos de la sesión, en orden cronológico
  const movements = await db
    .select()
    .from(cashMovements)
    .where(eq(cashMovements.sessionId, session.id))
    .orderBy(asc(cashMovements.createdAt))

  const movementRows: CierreCajaMovementRow[] = movements.map((m) => {
    const kind = m.kind as MovementKind
    const method = m.method as PaymentMethod
    return {
      time: formatTime(m.createdAt),
      kindLabel: MOVEMENT_KIND_LABELS[kind] ?? m.kind,
      methodLabel: PAYMENT_METHOD_LABELS[method] ?? m.method,
      notes: m.notes,
      signedAmountCents: signedAmount({ kind, amountCents: m.amountCents }),
    }
  })

  const client = access.client
  const closedAt = session.closedAt!
  const onlineExpectedCents = movements
    .filter((m) => m.method === 'online')
    .reduce((acc, m) => acc + signedAmount({ kind: m.kind as MovementKind, amountCents: m.amountCents }), 0)

  const element = (
    <CierreCajaDocument
      emisor={{
        fiscalName: client.fiscalName || client.businessName,
        fiscalNif: client.fiscalNif,
        fiscalAddress: client.fiscalAddress,
        fiscalPostalCode: client.fiscalPostalCode,
        fiscalCity: client.fiscalCity,
      }}
      closingDateLabel={formatLongDate(session.openedAt)}
      generatedAtLabel={formatShortDate(new Date())}
      openedAtLabel={formatTime(session.openedAt)}
      openedByLabel={session.openedByEmail}
      closedAtLabel={formatTime(closedAt)}
      closedByLabel={session.closedByEmail ?? '—'}
      openingCents={session.openingCents}
      cashExpectedCents={session.closingCentsExpected ?? 0}
      cashCountedCents={session.closingCentsCounted}
      cashDescuadreCents={session.cashDescuadreCents}
      cardExpectedCents={session.cardTerminalExpectedCents ?? 0}
      cardCountedCents={session.cardTerminalCountedCents}
      cardDescuadreCents={session.cardDescuadreCents}
      onlineExpectedCents={onlineExpectedCents}
      movements={movementRows}
      notes={session.notes}
    />
  )

  const buffer = await renderToBuffer(element)
  const body = new Uint8Array(buffer)

  // Filename con fecha del cierre para que el barbero lo archive limpio.
  const dateForFilename = new Date(session.openedAt)
    .toISOString()
    .slice(0, 10)

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="cierre-caja-${dateForFilename}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
