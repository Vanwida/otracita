import type { ReactNode } from 'react'

// -----------------------------------------------------------------------------
// DataPanel — panel de acción acoplado del panel de control (Booksy: la
// columna derecha que muestra el detalle del registro seleccionado: TOTAL,
// estado, acciones, lista, y una barra de acción inferior fija).
//
// No es un modal. El brief: "panel de acción acoplado donde aplica, las
// acciones sobre contexto, no ruta nueva". DataPanel es el contenedor
// reutilizable de esa columna: header (título + slot de estado/acciones),
// cuerpo scrolleable, y footer opcional pegado abajo para la acción
// primaria sticky (oscura, alto contraste).
//
// Plano con borde (elevation.md: tono+borde antes que sombra). Sin sombra
// base; la jerarquía la da el borde `line` y el header tintado.
// -----------------------------------------------------------------------------

interface Props {
  /** Título del panel (sans compacto, NUNCA Fraunces). */
  title: ReactNode
  /** Slot a la derecha del título: badge de estado, menú, etc. */
  headerAside?: ReactNode
  /** Subtítulo/meta corto bajo el título (ej. "Apertura 101,00 € · 15 may"). */
  meta?: ReactNode
  /** Contenido principal (lista de transacciones, resumen, tabs). */
  children: ReactNode
  /** Barra de acción inferior fija (botones). Oscura/alto contraste. */
  footer?: ReactNode
  /** Clase extra del contenedor (ej. control de altura/sticky en desktop). */
  className?: string
}

export default function DataPanel({
  title,
  headerAside,
  meta,
  children,
  footer,
  className = '',
}: Props) {
  return (
    <section
      className={`flex flex-col rounded-control border border-line bg-surface overflow-hidden ${className}`}
    >
      <header
        className="flex items-start justify-between gap-3 border-b border-line px-[var(--space-card)] py-3"
        style={{ background: 'var(--table-head-bg)' }}
      >
        <div className="min-w-0">
          <h2
            className="font-semibold text-ink leading-tight"
            style={{ fontSize: 'var(--text-section-title)' }}
          >
            {title}
          </h2>
          {meta && (
            <p className="mt-0.5 text-[0.75rem] text-ink-2 truncate">{meta}</p>
          )}
        </div>
        {headerAside && <div className="shrink-0">{headerAside}</div>}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>

      {footer && (
        <div className="border-t border-line px-[var(--space-card)] py-3 bg-surface">
          {footer}
        </div>
      )}
    </section>
  )
}
