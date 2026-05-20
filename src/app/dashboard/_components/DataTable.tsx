import type { ReactNode } from 'react'

// -----------------------------------------------------------------------------
// DataTable — tabla densa multi-columna del panel de control (UI0 / Booksy).
//
// Es el caballo de batalla de las superficies operativas: listado de
// movimientos, desglose por barbero, reportes. Reemplaza al patrón
// editorial "una card por fila con whitespace de revista" por una rejilla
// densa que el barbero lee de un vistazo en 30-60s.
//
// Convenciones (DESIGN.md / spatial-design.md / typography.md):
//   - Cabecera sticky con tono `--table-head-bg`, label uppercase de utilidad.
//   - Zebra + hover vía tokens (`--row-zebra`, `--row-hover`) — sin
//     bg-overlay/40 disperso.
//   - Columnas numéricas → tabular-nums + alineadas a la derecha.
//   - Scroll horizontal contenido (overflow-x-auto) sin romper el shell.
//   - AAA: header `text-ink-2` (≈6.4:1), no `text-ink-3`.
//
// Genérico por filas: el consumidor declara columnas (key, header, align,
// render, clases responsive de ocultado) y pasa las filas ya resueltas.
// Server-component-safe — sin estado, sin 'use client'.
//
// Patrón responsive (canónico — ver clientes/page.tsx):
//   1. Columnas secundarias declaran `className: 'hidden md:table-cell'` o
//      `'hidden sm:table-cell'` según prioridad. En <md desaparecen del thead
//      y de cada fila — sin estilos rotos, simplemente menos columnas.
//   2. La columna PRIMARIA renderiza, dentro de su `cell()`, un sub-bloque
//      `<div className="md:hidden">` que vuelca los datos contextuales que
//      desaparecieron arriba: importe, fecha, rating, lo que cuente. Así
//      el barbero en 375px ve la misma info en menos espacio, no info
//      mutilada.
//   3. Si la matriz es inherentemente ancha (timegrid, semanal de turnos),
//      no escondas columnas — envuelve en `<ScrollFade>` y deja al barbero
//      scrollear con feedback visual.
// -----------------------------------------------------------------------------

export interface Column<Row> {
  /** Clave estable (key de React + identidad de columna). */
  key: string
  /** Texto de cabecera. Se renderiza uppercase tracking de utilidad. */
  header: ReactNode
  /** Alineación de la celda. Numéricas → 'right'. Default 'left'. */
  align?: 'left' | 'center' | 'right'
  /** Render de la celda para una fila. */
  cell: (row: Row) => ReactNode
  /** ¿Es columna numérica? Aplica `tabular-nums`. */
  numeric?: boolean
  /** Clases extra de visibilidad responsive (ej. 'hidden md:table-cell'). */
  className?: string
}

interface Props<Row> {
  columns: Column<Row>[]
  rows: Row[]
  /** Clave única por fila para el key de React. */
  rowKey: (row: Row, index: number) => string
  /** Opcional: clase extra por fila (ej. resaltar la sesión abierta). */
  rowClassName?: (row: Row, index: number) => string | undefined
  /** Texto cuando no hay filas. Explícito, no simpático (DESIGN.md). */
  emptyLabel?: string
  /** aria-label de la tabla para lectores de pantalla. */
  ariaLabel: string
}

const ALIGN: Record<NonNullable<Column<unknown>['align']>, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

export default function DataTable<Row>({
  columns,
  rows,
  rowKey,
  rowClassName,
  emptyLabel = 'Sin datos',
  ariaLabel,
}: Props<Row>) {
  if (rows.length === 0) {
    return (
      <div className="px-[var(--space-cell-x)] py-8 text-center">
        <p className="text-data text-ink-2">{emptyLabel}</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" aria-label={ariaLabel}>
        <thead>
          <tr
            className="border-b border-line"
            style={{ background: 'var(--table-head-bg)' }}
          >
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`sticky top-0 z-10 px-[var(--space-cell-x)] py-[var(--space-tight)] text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-ink-2 whitespace-nowrap ${
                  ALIGN[col.align ?? 'left']
                } ${col.className ?? ''}`}
                style={{ background: 'var(--table-head-bg)' }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              data-zebra={i % 2 === 1}
              className={`dtable-row group border-b border-line/70 transition-colors last:border-b-0 ${
                rowClassName?.(row, i) ?? ''
              }`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-[var(--space-cell-x)] py-[var(--space-tight)] text-[length:var(--text-data)] text-ink align-middle ${
                    ALIGN[col.align ?? 'left']
                  } ${col.numeric ? 'tabular-nums' : ''} ${col.className ?? ''}`}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
