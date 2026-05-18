import { Banknote, CreditCard, Globe, Scale, AlertTriangle } from 'lucide-react'
import { db } from '@/db'
import { cashSessions, cashMovements } from '@/db/schema'
import { sql } from 'drizzle-orm'
import { isIncoming, type MovementKind } from '@/lib/cash/compute'

// -----------------------------------------------------------------------------
// CajaRollup — resumen del periodo sobre el histórico de cierres de caja.
//
// Vive encima del master-detail de `CajaRegisters` (lista de sesiones +
// detalle). Responde de un vistazo: en este periodo, ¿cuánto cobré por cada
// método?, ¿se me descuadró la caja?, ¿en cuántos cierres?
//
// REUTILIZA `cash/compute.ts` como única fuente de verdad del SIGNO: qué
// kinds suman (incoming) lo decide `isIncoming` ahí; aquí solo derivamos la
// lista para el filtro SQL — si mañana cambia el set en compute.ts, este
// rollup lo hereda sin tocar. El descuadre acumulado sale de los campos ya
// persistidos en cash_sessions (cash_descuadre_cents / card_descuadre_cents),
// que el cierre calcula con ese mismo módulo — no se re-deriva.
//
// Scoped al tenant (clientId resuelto de la sesión por el caller) + periodo
// (closed_at >= periodStart; null = lifetime). Pura agregación, cero schema.
// -----------------------------------------------------------------------------

interface Props {
  clientId: string
  /** YYYY-MM-DD inclusive · null = lifetime (sin filtro de fecha). */
  periodStartIso: string | null
  /** Etiqueta legible del periodo en minúsculas (ej. "mes"). */
  periodLabel: string
}

// Kinds que SUMAN al cobro, derivados de cash/compute.ts (single source of
// truth del signo). El set completo de kinds del schema:
const ALL_KINDS: MovementKind[] = [
  'booking',
  'product_sale',
  'tip_cash',
  'expense',
  'withdrawal',
  'deposit',
  'adjustment',
]
const INCOMING_KINDS = ALL_KINDS.filter((k) => isIncoming(k))

function formatCents(cents: number): string {
  const euros = cents / 100
  if (Number.isInteger(euros)) return `${euros.toLocaleString('es-ES')} €`
  return `${euros.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

function descuadreLabel(cents: number): string {
  const sign = cents > 0 ? '+' : ''
  return `${sign}${formatCents(cents)}`
}

export default async function CajaRollup({
  clientId,
  periodStartIso,
  periodLabel,
}: Props) {
  const periodWhere = periodStartIso
    ? sql`AND closed_at >= ${periodStartIso}::date`
    : sql``

  // Cierres del periodo + descuadre acumulado (campos persistidos por el
  // cierre, que ya usa cash/compute.ts). |descuadre| > 0 = cuadre fallido.
  const [sessRow] =
    (await db
      .execute(sql`
    SELECT
      COUNT(*)::int AS cierres,
      COALESCE(SUM(COALESCE(cash_descuadre_cents, 0)), 0)::bigint AS cash_desc,
      COALESCE(SUM(COALESCE(card_descuadre_cents, 0)), 0)::bigint AS card_desc,
      COUNT(*) FILTER (
        WHERE COALESCE(cash_descuadre_cents, 0) <> 0
           OR COALESCE(card_descuadre_cents, 0) <> 0
      )::int AS cierres_descuadre
    FROM ${cashSessions}
    WHERE client_id = ${clientId}
      AND closed_at IS NOT NULL
      ${periodWhere}
  `)
      .then(
        (r) =>
          (
            r as unknown as {
              rows: {
                cierres: number
                cash_desc: string | number
                card_desc: string | number
                cierres_descuadre: number
              }[]
            }
          ).rows,
      )) ?? []

  const cierres = Number(sessRow?.cierres ?? 0)

  if (cierres === 0) {
    return (
      <div className="mb-4 rounded-control border border-line bg-surface px-[var(--space-card)] py-4">
        <p className="text-[0.8125rem] text-ink-2">
          Sin cierres de caja en este {periodLabel}. El resumen del periodo
          aparece aquí en cuanto cierres la primera caja.
        </p>
      </div>
    )
  }

  const cashDescAcum = Number(sessRow?.cash_desc ?? 0)
  const cardDescAcum = Number(sessRow?.card_desc ?? 0)
  const descuadreTotal = cashDescAcum + cardDescAcum
  const cierresDescuadre = Number(sessRow?.cierres_descuadre ?? 0)

  // Total cobrado por método: movimientos "incoming" (signo de
  // cash/compute.ts) de las sesiones cerradas en el periodo.
  const methodRows =
    (await db
      .execute(sql`
    SELECT m.method AS method,
           COALESCE(SUM(m.amount_cents), 0)::bigint AS cents
    FROM ${cashMovements} m
    JOIN ${cashSessions} s ON s.id = m.session_id
    WHERE m.client_id = ${clientId}
      AND s.closed_at IS NOT NULL
      ${periodStartIso ? sql`AND s.closed_at >= ${periodStartIso}::date` : sql``}
      AND m.kind IN (${sql.join(
        INCOMING_KINDS.map((k) => sql`${k}`),
        sql`, `,
      )})
    GROUP BY m.method
  `)
      .then(
        (r) =>
          (
            r as unknown as {
              rows: { method: string; cents: string | number }[]
            }
          ).rows,
      )) ?? []

  const byMethod: Record<string, number> = {
    cash: 0,
    card: 0,
    online: 0,
  }
  for (const r of methodRows) {
    byMethod[r.method] = Number(r.cents)
  }
  const totalCobrado = byMethod.cash + byMethod.card + byMethod.online

  const methods = [
    { key: 'cash', label: 'Efectivo', icon: Banknote, cents: byMethod.cash },
    { key: 'card', label: 'Tarjeta', icon: CreditCard, cents: byMethod.card },
    { key: 'online', label: 'Online', icon: Globe, cents: byMethod.online },
  ]

  const descuadreOk = descuadreTotal === 0 && cierresDescuadre === 0

  return (
    <section className="mb-4 rounded-control border border-line bg-surface overflow-hidden">
      <header
        className="flex items-baseline justify-between gap-3 border-b border-line px-[var(--space-card)] py-3"
        style={{ background: 'var(--table-head-bg)' }}
      >
        <h2 className="text-[0.8125rem] font-semibold text-ink">
          Resumen del periodo · {periodLabel}
        </h2>
        <p className="text-[0.75rem] text-ink-2">
          {cierres} {cierres === 1 ? 'cierre' : 'cierres'} · cobrado{' '}
          {formatCents(totalCobrado)}
        </p>
      </header>

      <div className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-4 sm:divide-y-0">
        {methods.map((m) => {
          const Icon = m.icon
          return (
            <div key={m.key} className="px-[var(--space-card)] py-3">
              <div className="flex items-center gap-1.5">
                <Icon
                  className="h-3.5 w-3.5 shrink-0 text-ink-2"
                  aria-hidden="true"
                />
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-ink-2">
                  {m.label}
                </p>
              </div>
              <p
                className="mt-1 font-bold text-ink tabular-nums leading-none"
                style={{ fontSize: 'var(--text-figure)' }}
              >
                {m.cents > 0 ? formatCents(m.cents) : '—'}
              </p>
            </div>
          )
        })}

        {/* Descuadre acumulado — color + icono + texto (nunca solo color). */}
        <div className="px-[var(--space-card)] py-3">
          <div className="flex items-center gap-1.5">
            {descuadreOk ? (
              <Scale
                className="h-3.5 w-3.5 shrink-0 text-success"
                aria-hidden="true"
              />
            ) : (
              <AlertTriangle
                className="h-3.5 w-3.5 shrink-0 text-danger"
                aria-hidden="true"
              />
            )}
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-ink-2">
              Descuadre
            </p>
          </div>
          <p
            className={`mt-1 font-bold tabular-nums leading-none ${
              descuadreOk ? 'text-success' : 'text-danger'
            }`}
            style={{ fontSize: 'var(--text-figure)' }}
          >
            {descuadreOk ? 'Cuadra' : descuadreLabel(descuadreTotal)}
          </p>
          {!descuadreOk && (
            <p className="mt-1 text-[0.75rem] text-ink-2">
              {cierresDescuadre} de {cierres}{' '}
              {cierres === 1 ? 'cierre' : 'cierres'} con descuadre
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
