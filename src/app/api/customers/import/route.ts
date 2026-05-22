import { db } from '@/db'
import { customers } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import {
  classifyRow,
  resolveDuplicateUpdate,
  IMPORT_ROW_LIMIT,
  type ImportRow,
  type ExistingCustomer,
} from '@/lib/customers/import'

// -----------------------------------------------------------------------------
// POST /api/customers/import
//
// Importa en bulk una base de clientes desde un CSV. Toda la inteligencia
// (normalización de phone, validación, dedupe, update-if-empty) vive en
// `src/lib/customers/import.ts` para que sea testeable sin DB; aquí solo
// orquestamos: SELECT existentes → clasificar → INSERT/UPDATE secuencial.
//
// Body:
//   {
//     rows: Array<{ name?, phone, email?, notas? }>,
//     source: 'csv'   // V1 sólo csv. V2: 'booksy' | 'treatwell' | 'fresha'.
//   }
//
// Response (200):
//   { created, updated, skipped, total, partial?: true }
//
// `partial: true` se incluye si fallamos a mitad — neon-http NO soporta
// `db.transaction`, así que si una insert lanza, devolvemos lo que llevamos
// hecho con `partial: true` para que la UI pueda decirle al barbero "se
// importaron X de Y, vuelve a subir el CSV para reintentar el resto".
//
// Multi-tenancy: requireClientAccess garantiza que clientId viene de la
// sesión, NUNCA del body. Toda customer creada/actualizada lleva el
// clientId del barbero autenticado.
// -----------------------------------------------------------------------------

interface ImportBody {
  rows?: unknown
  source?: unknown
}

interface ImportResponse {
  created: number
  updated: number
  skipped: number
  total: number
  partial?: true
  error?: string
}

export async function POST(req: Request): Promise<Response> {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access

  // ---------------------------------------------------------------------------
  // 1. Parse + validate body shape.
  // ---------------------------------------------------------------------------
  let body: ImportBody
  try {
    body = (await req.json()) as ImportBody
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (body.source !== 'csv') {
    return Response.json({ error: 'Source no soportado. Usa "csv".' }, { status: 400 })
  }

  if (!Array.isArray(body.rows)) {
    return Response.json({ error: 'rows debe ser un array' }, { status: 400 })
  }

  const rawRows = body.rows as unknown[]
  if (rawRows.length === 0) {
    return Response.json({ error: 'No hay filas que importar' }, { status: 400 })
  }
  if (rawRows.length > IMPORT_ROW_LIMIT) {
    return Response.json(
      { error: `Máximo ${IMPORT_ROW_LIMIT} filas por import. Divide el CSV.` },
      { status: 400 },
    )
  }

  // Coerce cada row al shape esperado. No tiramos en este punto — si una
  // fila viene rota, classifyRow la marcará como invalid y se contará en
  // `skipped`. Defensivo a propósito: el cliente puede mandarnos basura
  // si parsea mal el CSV.
  const rows: ImportRow[] = rawRows.map((r) => {
    const o = (typeof r === 'object' && r !== null) ? (r as Record<string, unknown>) : {}
    return {
      name: typeof o.name === 'string' ? o.name : null,
      phone: typeof o.phone === 'string' ? o.phone : '',
      email: typeof o.email === 'string' ? o.email : null,
      notas: typeof o.notas === 'string' ? o.notas : null,
    }
  })

  // ---------------------------------------------------------------------------
  // 2. Cargar TODOS los customers existentes del tenant para hacer dedupe.
  //
  // Trade-off explícito: barberías muy grandes (5k+ clientes) cargan toda
  // la base en memoria. Mide cuanto cueste cuando lleguemos ahí — un
  // import sólo se hace 1 vez en el onboarding, no es un hot path. Si
  // duele, el siguiente paso es WHERE phone IN (canonicalizados) en vez
  // de cargar todo.
  // ---------------------------------------------------------------------------
  const existingRows = await db
    .select({ phone: customers.phone, name: customers.name })
    .from(customers)
    .where(eq(customers.clientId, client.id))

  const existingByPhone = new Map<string, ExistingCustomer>()
  for (const r of existingRows) existingByPhone.set(r.phone, r)

  // ---------------------------------------------------------------------------
  // 3. Persistir secuencialmente. neon-http NO soporta transactions, así
  // que si una operación falla a mitad, devolvemos partial=true con lo
  // hecho hasta el momento.
  // ---------------------------------------------------------------------------
  let created = 0
  let updated = 0
  let skipped = 0
  let partial = false

  // Set para dedupe DENTRO del mismo CSV (el barbero mete dos filas con
  // el mismo teléfono → la segunda cuenta como duplicada, no como insert).
  const insertedThisRunPhones = new Set<string>()

  for (const row of rows) {
    const classified = classifyRow(row, existingByPhone)

    try {
      if (classified.kind === 'invalid_phone') {
        skipped++
        continue
      }

      // Dedupe intra-CSV: si esta misma corrida ya insertó este phone,
      // la segunda fila es duplicada (no nueva).
      if (classified.kind === 'ok' && insertedThisRunPhones.has(classified.phone)) {
        skipped++
        continue
      }

      if (classified.kind === 'duplicate') {
        const existing = existingByPhone.get(classified.phone)
        if (!existing) {
          // No debería ocurrir — defensivo.
          skipped++
          continue
        }
        const newName = resolveDuplicateUpdate(existing, classified.name)
        if (newName === null) {
          skipped++
          continue
        }
        await db
          .update(customers)
          .set({ name: newName })
          .where(and(eq(customers.clientId, client.id), eq(customers.phone, classified.phone)))
        updated++
        // Actualiza el mapa en memoria — si por casualidad llegan 2
        // filas duplicadas del mismo phone, la segunda no debe disparar
        // otro UPDATE.
        existingByPhone.set(classified.phone, { ...existing, name: newName })
        continue
      }

      // INSERT — fila nueva.
      await db.insert(customers).values({
        clientId: client.id,
        phone: classified.phone,
        name: classified.name,
        email: classified.email,
        barberNotes: classified.notas,
      })
      created++
      insertedThisRunPhones.add(classified.phone)
      // Mantén el mapa al día para evitar duplicar dentro del mismo run.
      existingByPhone.set(classified.phone, { phone: classified.phone, name: classified.name })
    } catch (err) {
      // Si falla una INSERT/UPDATE concreta (p.ej. constraint violation
      // de schema futuro), corta el loop y devuelve partial=true. El
      // barbero ve "se importaron X de Y" y puede reintentar con un CSV
      // recortado a las filas que faltan.
      console.error('[customers/import] row failed:', err)
      partial = true
      break
    }
  }

  const res: ImportResponse = {
    created,
    updated,
    skipped,
    total: rows.length,
  }
  if (partial) res.partial = true

  return Response.json(res)
}

// Silencia warnings sobre dynamic import si la ruta se llama desde un
// contexto sin Request body (no debería pasar, pero defensivo).
export const dynamic = 'force-dynamic'
