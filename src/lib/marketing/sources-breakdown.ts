import 'server-only'

import { db } from '@/db'
import { customers } from '@/db/schema'
import { sql, type SQL } from 'drizzle-orm'

// -----------------------------------------------------------------------------
// getClientSourceBreakdown — agregado canónico de "de dónde llegan los
// clientes" para una barbería.
//
// DRY: la misma query estaba copiada 3 veces (clientes/atribucion,
// informes/clientes, chips de clientes/page con extraWhere). Aquí va el único
// sitio que toca `customers.first_source` para breakdowns. Cualquier
// renderer (SourceBreakdown, SourceFilterChips, panel del informe de
// Marketing) consume estas filas.
//
// Multi-tenancy: el caller resuelve `clientId` vía `requireClientAccess` o
// `loadReportContext` ANTES de invocarnos. Aquí solo añadimos
// `client_id = $1` al WHERE — nunca aceptamos input del request directamente.
//
// Time window:
//   · `since` (Date) → filtra por `first_source_captured_at >= since`. Solo
//      cuenta clientes cuyo first-touch cae en la ventana → mide "cómo
//      llegan AHORA", no histórico (mismo criterio que tenía la query
//      original de /clientes/atribucion).
//   · `since` omitido → lifetime, sin filtro de fecha (lo que necesita el
//      chip de filtro multi-select en /dashboard/clientes — el contador
//      es sobre toda la cartera, no una ventana).
//
// `extraWhere` permite a /clientes/page intersectar con su statusWhere +
// searchWhere para que el contador del chip refleje "cuántos habría con ESE
// canal aplicado al resto del filtro actual" (patrón Linear/GitHub). Es un
// SQL fragment confiable construido en el callsite — no input del usuario.
// -----------------------------------------------------------------------------

export interface SourceBreakdownRow {
  /** Valor canónico de `customers.first_source` (matchea catálogo en `src/lib/sources.ts`). */
  source: string
  /** Clientes cuyo first-touch fue este canal en la ventana. */
  count: number
  /** Porcentaje sobre el total de la ventana, redondeado a entero (0-100). */
  pct: number
}

export interface SourceBreakdownOptions {
  /** Si se pasa, solo cuenta clientes con `first_source_captured_at >= since`. */
  since?: Date
  /** Fragmentos SQL adicionales (AND ...) — el caller los compone con `sql\`AND ...\``.
   *  Se concatenan en orden. NO inyectar input del usuario sin parametrizar. */
  extraWhere?: SQL[]
}

/**
 * Devuelve el breakdown de canales de captación para una barbería.
 * Ordenado descendente por `count`. `pct` está pre-calculado sobre el total
 * de la ventana — los renderers no necesitan recalcular.
 *
 * Multi-tenant: el `clientId` lo resuelve el caller (sesión / cron / webhook
 * firmado). Esta función nunca lee del request.
 */
export async function getClientSourceBreakdown(
  clientId: string,
  opts: SourceBreakdownOptions = {},
): Promise<SourceBreakdownRow[]> {
  const { since, extraWhere = [] } = opts

  // Fragmento de ventana temporal. Si `since` no se pasa, queda vacío
  // (lifetime). Parametrizado vía drizzle — `since.toISOString()` no se
  // interpola crudo en el SQL.
  const sinceWhere = since
    ? sql`AND c.first_source_captured_at IS NOT NULL
          AND c.first_source_captured_at >= ${since.toISOString()}::timestamptz`
    : sql``

  // Compone extraWhere — array de SQL fragments. Cada uno debería empezar por
  // `AND ...` y referir a la tabla como `c.<col>` (ver alias debajo).
  // Si está vacío, no añade nada.
  const extra = extraWhere.length > 0 ? sql.join(extraWhere, sql` `) : sql``

  // Aliasamos `customers` como `c` para que los callers (p.ej. clientes/page
  // chips) puedan pasar fragments `AND c.reputation = 'blocked'` etc. sin
  // tener que refactorizar.
  const result = await db.execute(sql`
    SELECT c.first_source AS source, COUNT(*)::int AS count
    FROM ${customers} c
    WHERE c.client_id = ${clientId}
      AND c.first_source IS NOT NULL
    ${sinceWhere}
    ${extra}
    GROUP BY c.first_source
    ORDER BY COUNT(*) DESC
  `)

  const rows = (result as unknown as {
    rows: Array<{ source: string; count: number }>
  }).rows.map((r) => ({ source: r.source, count: Number(r.count) }))

  const total = rows.reduce((acc, r) => acc + r.count, 0)

  return rows.map((r) => ({
    source: r.source,
    count: r.count,
    pct: total > 0 ? Math.round((r.count / total) * 100) : 0,
  }))
}

/** Suma total de `count` en un breakdown — atajo común para los renderers. */
export function sumSourceBreakdown(rows: SourceBreakdownRow[]): number {
  return rows.reduce((acc, r) => acc + r.count, 0)
}
