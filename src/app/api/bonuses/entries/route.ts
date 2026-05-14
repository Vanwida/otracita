import { db } from '@/db'
import { bonuses, bonusEntries, barbers as barbersTable } from '@/db/schema'
import { and, eq, gte, lt, inArray } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'

// -----------------------------------------------------------------------------
// /api/bonuses/entries
//
// GET ?month=YYYY-MM → todas las entries del mes (todos los bonos, todos
//   los barberos) para construir vistas mensuales.
//
// POST → crea N entries de golpe (bulk) desde el cierre de caja. Cada
//   entry tiene { bonusId, barberId, value } — cualquier barbero puede
//   sumar a cualquier bono activo.
//
// Body POST:
//   { date: 'YYYY-MM-DD',
//     entries: [{ bonusId, barberId, value, note? }, ...] }
// -----------------------------------------------------------------------------

interface PostBody {
  date?: unknown
  entries?: unknown
}

interface EntryInput {
  bonusId?: unknown
  barberId?: unknown
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
      id: bonusEntries.id,
      bonusId: bonusEntries.bonusId,
      barberId: bonusEntries.barberId,
      value: bonusEntries.value,
      date: bonusEntries.date,
      note: bonusEntries.note,
    })
    .from(bonusEntries)
    .where(
      and(
        eq(bonusEntries.clientId, access.client.id),
        gte(bonusEntries.date, bounds.start),
        lt(bonusEntries.date, bounds.end),
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
  if (body.entries.length > 200) {
    return Response.json({ error: 'Demasiadas entries (max 200)' }, { status: 400 })
  }

  const parsed: Array<{ bonusId: string; barberId: string; value: number; note: string | null }> = []
  for (const raw of body.entries as EntryInput[]) {
    const bonusId = typeof raw.bonusId === 'string' ? raw.bonusId : null
    const barberId = typeof raw.barberId === 'string' ? raw.barberId : null
    const value = typeof raw.value === 'number' ? Math.round(raw.value) : NaN
    const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, 200) || null : null
    if (!bonusId) return Response.json({ error: 'entry.bonusId requerido' }, { status: 400 })
    if (!barberId) return Response.json({ error: 'entry.barberId requerido' }, { status: 400 })
    if (!Number.isFinite(value)) return Response.json({ error: 'entry.value debe ser número' }, { status: 400 })
    if (value === 0) continue
    parsed.push({ bonusId, barberId, value, note })
  }

  if (parsed.length === 0) {
    return Response.json({ ok: true, inserted: 0 })
  }

  // Validar bonos del tenant
  const bonusIds = Array.from(new Set(parsed.map((e) => e.bonusId)))
  const bonusRows = await db
    .select({ id: bonuses.id })
    .from(bonuses)
    .where(and(eq(bonuses.clientId, access.client.id), inArray(bonuses.id, bonusIds)))
  if (bonusRows.length !== bonusIds.length) {
    return Response.json({ error: 'Algún bono no pertenece a tu barbería' }, { status: 403 })
  }

  // Validar barberos del tenant
  const barberIds = Array.from(new Set(parsed.map((e) => e.barberId)))
  const barberRows = await db
    .select({ id: barbersTable.id })
    .from(barbersTable)
    .where(and(eq(barbersTable.clientId, access.client.id), inArray(barbersTable.id, barberIds)))
  if (barberRows.length !== barberIds.length) {
    return Response.json({ error: 'Algún barbero no pertenece a tu barbería' }, { status: 403 })
  }

  const inserted = await db
    .insert(bonusEntries)
    .values(
      parsed.map((e) => ({
        clientId: access.client.id,
        bonusId: e.bonusId,
        barberId: e.barberId,
        value: e.value,
        date,
        note: e.note,
      })),
    )
    .returning({ id: bonusEntries.id })

  return Response.json({ ok: true, inserted: inserted.length })
}
