import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'
import { detectGaps, resolveWindow, type WindowPreset } from '@/lib/promos/detect-gaps'
import { findEligibleCustomers } from '@/lib/promos/eligible-customers'
import { defaultPromoMessage } from '@/lib/promos/defaults'
import type { WeeklyHours } from '@/lib/availability'

// -----------------------------------------------------------------------------
// POST /api/promos/preview
//
// Body: { window: WindowPreset | { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' } }
//
// Devuelve un resumen para que el modal "Llenar huecos" muestre:
//   - cuántos huecos detectamos en la ventana
//   - cuántos clientes fieles podríamos notificar
//   - lista paginada (top 25 por última visita)
//   - mensaje plantilla por defecto (con businessName y windowLabel)
//
// El barbero ajusta a partir de aquí (descuento, mensaje, deselecciona
// clientes) antes de confirmar el envío vía /api/promos/send.
// -----------------------------------------------------------------------------

const PREVIEW_LIMIT = 25

export async function POST(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'promosContextuales')
  if (gate) return gate
  const { client } = access

  if (!client.promosEnabled) {
    return Response.json({ error: 'Promos no activadas' }, { status: 403 })
  }

  let body: { window?: WindowPreset | { start?: string; end?: string } }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  let rangeStart: string
  let rangeEnd: string
  let label: string
  if (typeof body.window === 'string') {
    const w = resolveWindow(body.window)
    rangeStart = w.start
    rangeEnd = w.end
    label = w.label
  } else if (body.window && typeof body.window === 'object' && body.window.start && body.window.end) {
    if (body.window.end < body.window.start) {
      return Response.json({ error: 'Rango inválido' }, { status: 400 })
    }
    rangeStart = body.window.start
    rangeEnd = body.window.end
    label = `${rangeStart} → ${rangeEnd}`
  } else {
    const w = resolveWindow('today')
    rangeStart = w.start
    rangeEnd = w.end
    label = w.label
  }

  const shopHours = (client.chatbotHours as WeeklyHours | null) || null
  const shopBlockedDates = (client.blockedDates as string[]) || []

  const [gapsResult, eligible] = await Promise.all([
    detectGaps({
      clientId: client.id,
      shopHours,
      shopBlockedDates,
      rangeStart,
      rangeEnd,
    }),
    findEligibleCustomers(client.id),
  ])

  const message = defaultPromoMessage({
    businessName: client.businessName,
    discountPct: 10,
    windowLabel: label,
  })

  return Response.json({
    window: { start: rangeStart, end: rangeEnd, label },
    gaps: {
      count: gapsResult.gaps.length,
      totalMinutes: gapsResult.totalMinutes,
      totalDays: gapsResult.totalDays,
      list: gapsResult.gaps.slice(0, 50),
    },
    eligibleCustomers: {
      total: eligible.length,
      list: eligible.slice(0, PREVIEW_LIMIT).map((c) => ({
        phone: c.phone,
        name: c.name,
        recentVisits: c.totalRecentVisits,
        lastBookingAt: c.lastBookingAt?.toISOString() ?? null,
      })),
    },
    defaultMessage: message,
  })
}
