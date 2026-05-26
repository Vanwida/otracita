import { PackageMinus, User } from 'lucide-react'

// -----------------------------------------------------------------------------
// BarberConsumptionSummary (task #89) — mini-tabla "consumo interno por
// barbero" del mes en curso, embedida en /dashboard/ventas/productos.
//
// Propósito (según task):
//   1. Control de gasto — detectar si un barbero gasta MUCHO más que otros
//      (mal uso / despilfarro). Por eso ordenamos por unidades desc y
//      mostramos el % del total — el outlier salta a la vista.
//   2. Comisiones futuras — si un día se descuenta coste de producto del
//      comisionable, este reporte ya tiene la base (qty + coste estimado).
//
// Coste estimado: usa `products.cost_price_cents` si está configurado, si no
// `products.price_cents` (fallback conservador idéntico al motor de P&L —
// ver comentario en schema products). La query del page.tsx ya lo hace.
//
// Casos edge:
//  · Sin consumos este mes → NO renderizamos nada (cero ruido visual).
//  · Filas con barberId IS NULL (pre-existentes al task #89) → etiqueta
//    "Sin asignar". Histórico intacto, no se borra.
//  · Tenant sin barberos pero con consumo legacy NULL → muestra "Sin
//    asignar" con su importe. El dueño verá que existe y entenderá que
//    para futuros consumos tendrá que dar de alta barberos.
// -----------------------------------------------------------------------------

export interface ConsumptionSummaryRow {
  barberId: string | null
  barberName: string | null
  qty: number
  costCents: number
  pct: number | null
}

interface Props {
  rows: ConsumptionSummaryRow[]
}

function fmtEur(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`
}

function fmtPct(pct: number | null): string {
  if (pct === null) return '—'
  return `${(pct * 100).toFixed(0)}%`
}

export default function BarberConsumptionSummary({ rows }: Props) {
  // Sin datos del mes: no metemos sección vacía. La UI debe respetar el
  // principio de "menos es más" — si no hay nada que decir, callamos.
  if (rows.length === 0) return null

  const totalCostCents = rows.reduce((acc, r) => acc + r.costCents, 0)
  const totalQty = rows.reduce((acc, r) => acc + r.qty, 0)

  return (
    <section
      aria-labelledby="consumo-barbero-heading"
      className="mb-5 rounded-2xl border border-line bg-surface"
    >
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <PackageMinus className="h-4 w-4 text-ink-3 shrink-0" aria-hidden />
          <h2
            id="consumo-barbero-heading"
            className="font-semibold text-ink truncate"
            style={{ fontSize: 'var(--text-meta)' }}
          >
            Consumo interno por barbero · este mes
          </h2>
        </div>
        <div className="text-right shrink-0">
          <p
            className="font-bold tabular-nums text-ink"
            style={{ fontSize: 'var(--text-meta)' }}
          >
            {fmtEur(totalCostCents)}
          </p>
          <p className="text-[0.6875rem] uppercase tracking-widest text-ink-3">
            {totalQty} {totalQty === 1 ? 'unidad' : 'uds'}
          </p>
        </div>
      </header>

      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const isUnassigned = r.barberId === null
          return (
            <li
              key={r.barberId ?? '__unassigned__'}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <div className="h-7 w-7 rounded-full bg-overlay border border-line shrink-0 flex items-center justify-center">
                <User
                  className={`h-3.5 w-3.5 ${isUnassigned ? 'text-ink-3' : 'text-ink-2'}`}
                  aria-hidden
                />
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={`font-medium truncate ${isUnassigned ? 'text-ink-3 italic' : 'text-ink'}`}
                  style={{ fontSize: 'var(--text-meta)' }}
                >
                  {isUnassigned ? 'Sin asignar' : (r.barberName ?? 'Barbero')}
                </p>
                <p className="text-[0.6875rem] text-ink-3 tabular-nums">
                  {r.qty} {r.qty === 1 ? 'ud' : 'uds'} · {fmtPct(r.pct)} del
                  total
                </p>
              </div>
              <p
                className="font-bold tabular-nums text-ink shrink-0"
                style={{ fontSize: 'var(--text-meta)' }}
              >
                {fmtEur(r.costCents)}
              </p>
            </li>
          )
        })}
      </ul>

      <p className="border-t border-line px-4 py-2.5 text-[0.6875rem] text-ink-3">
        Coste estimado: usa el coste de compra si lo has configurado en cada
        producto, si no el precio de venta como aproximación.
      </p>
    </section>
  )
}
