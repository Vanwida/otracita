import { db } from '@/db'
import { barberBonuses, barberBonusEntries } from '@/db/schema'
import { and, eq, gte, lt, inArray } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'

// -----------------------------------------------------------------------------
// /api/bonuses/entries
//
// GET ?month=YYYY-MM → devuelve TODAS las entries del mes para todos los
//   bonos del tenant (para construir la vista mensual).
//
// POST → crea N entries de golpe (bulk). Pensado para el cierre de caja:
//   el dueño teclea "+3 reseñas, +24€ productos" y mandamos un array.
//   Cada entry valida que su bonus pertenece al tenant.
//
// Body POST:
//   { date: 'YYYY-MM-DD', entries: [{ bonusId, value, note? }, ...] }
// -----------------------------------------------------------------------------

interface PostBody {
  date?: unknown
  entries?: unknown
}

interface EntryInput {
  bonusId?: unknown
  value?: unknown
  note?: unknown
}

function monthBounds(raw: string): { start: string; end: string } | null {
  const m = raw.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const year = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  if (month < 1 || month > 12) return null
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  return { start, end }
}

export async function GET(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'teamBonuses')
  if (gate) return gate

  const { searchParams } = new URL(request.url)
  const rawMonth = searchParams.get('month')
  if (!rawMonth) return Response.json({ error: 'month requerido (YYYY-MM)' }, { status: 400 })
  const bounds = monthBounds(rawMonth)
  if (!bounds) return Response.json({ error: 'Formato de mes inválido' }, { status: 400 })

  const rows = await db
    .select({
      id: barberBonusEntries.id,
      bonusId: barberBonusEntries.bonusId,
      barberId: barberBonusEntries.barberId,
      value: barberBonusEntries.value,
      date: barberBonusEntries.date,
      note: barberBonusEntries.note,
    })
    .from(barberBonusEntries)
    .where(
      and(
        eq(barberBonusEntries.clientId, access.client.id),
        gte(barberBonusEntries.date, bounds.start),
        lt(barberBonusEntries.date, bounds.end),
      ),
    )

  return Response.json({ entries: rows })
}

export async function POST(request: Request) {
  const access = await requireClientAccess(request)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'teamBonuses')
  if (gate) return gate

  let body: PostBody
  try {
    body = (await request.json()) as PostBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null
  if (!date) return Response.json({ error: 'date inválida (YYYY-MM-DD)' }, { status: 400 })

  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return Response.json({ error: 'entries debe ser un array no vacío' }, { status: 400 })
  }
  if (body.entries.length > 100) {
    return Response.json({ error: 'Demasiadas entries (max 100)' }, { status: 400 })
  }

  // Validar todas las entries y resolver el barberId de cada bonus.
  const parsed: Array<{ bonusId: string; value: number; note: string | null }> = []
  for (const raw of body.entries as EntryInput[]) {
    const bonusId = typeof raw.bonusId === 'string' ? raw.bonusId : null
    const value = typeof raw.value === 'number' ? Math.round(raw.value) : NaN
    const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, 200) || null : null
    if (!bonusId) return Response.json({ error: 'entry.bonusId requerido' }, { status: 400 })
    if (!Number.isFinite(value)) return Response.json({ error: 'entry.value debe ser número' }, { status: 400 })
    if (value === 0) continue // saltar entries vacías — útil cuando el form trae todo a 0
    parsed.push({ bonusId, value, note })
  }

  if (parsed.length === 0) {
    return Response.json({ ok: true, inserted: 0 })
  }

  // Verificar que todos los bonuses pertenecen al tenant + obtener barberId.
  const bonusIds = parsed.map((e) => e.bonusId)
  const bonusRows = await db
    .select({ id: barberBonuses.id, barberId: barberBonuses.barberId })
    .from(barberBonuses)
    .where(and(eq(barberBonuses.clientId, access.client.id), inArray(barberBonuses.id, bonusIds)))

  const barberByBonus = new Map(bonusRows.map((b) => [b.id, b.barberId]))
  if (barberByBonus.size !== new Set(bonusIds).size) {
    return Response.json({ error: 'Algún bono no pertenece a tu barbería' }, { status: 403 })
  }

  const inserted = await db
    .insert(barberBonusEntries)
    .values(
      parsed.map((e) => ({
        clientId: access.client.id,
        bonusId: e.bonusId,
        barberId: barberByBonus.get(e.bonusId)!,
        value: e.value,
        date,
        note: e.note,
      })),
    )
    .returning({ id: barberBonusEntries.id })

  return Response.json({ ok: true, inserted: inserted.length })
}
