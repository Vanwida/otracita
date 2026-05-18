import type { ReactNode } from 'react'
import AreaTabs from './AreaTabs'
import { AREA_BY_KEY } from './area-config'

// -----------------------------------------------------------------------------
// AreaShell — contenedor canónico de un ÁREA tabulada (patrón Booksy
// "Estadísticas e informes": rail de iconos + header compacto + BARRA DE
// PESTAÑAS + área de trabajo a altura de pantalla).
//
// LA REGLA (esto es todo): la PÁGINA no scrollea. Nunca. El header y la
// barra de pestañas son chrome fijo (`shrink-0`); el cuerpo es una región
// `flex-1 min-h-0` que ocupa exactamente la altura restante del viewport.
// El scroll vive DENTRO de un panel/tabla/lista hijo (sticky header), no
// en la ventana. Booksy no te hace bajar una página larga: parte cada área
// en pestañas y cada pestaña cabe en pantalla. Lo copiamos literal.
//
// Diferencia con el antiguo PageShell: PageShell daba al cuerpo
// `overflow-y-auto` → la página scrolleaba cuando el contenido desbordaba
// (justo lo que el usuario odia). AreaShell NO scrollea el cuerpo: el hijo
// recibe una región acotada y gestiona su propio scroll interno.
//
// Server component — sin estado. La barra de pestañas (`AreaTabs`, client)
// se renderiza desde la config declarativa por `area` key. El layout del
// área lo monta una vez; cada page.tsx hija solo aporta el contenido de su
// pestaña (estable al cambiar de tab, sin reflow del chrome).
// -----------------------------------------------------------------------------

interface Props {
  /** Key del área en `area-config` (ej. 'ventas', 'equipo', 'informes'). */
  area: string
  /** Override del título (default: label del área en la config). */
  title?: string
  /** Override del subtítulo. NO párrafos largos — esto es un panel. */
  subtitle?: string
  /** Acción primaria a la derecha del header (botón alto contraste / period tabs). */
  action?: ReactNode
  /** Contenido de la pestaña activa. Debe llenar la altura (no listar largo). */
  children: ReactNode
}

export default function AreaShell({
  area,
  title,
  subtitle,
  action,
  children,
}: Props) {
  const def = AREA_BY_KEY[area]
  const heading = title ?? def?.label ?? ''
  const sub = subtitle ?? def?.subtitle
  const hasTabs = (def?.tabs.length ?? 0) > 1

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-canvas">
      {/* Chrome fijo — header compacto + barra de pestañas. shrink-0:
          NUNCA scrollea. Es el chrome del área (Booksy 09.46.25): título
          + período + pestañas siempre visibles. */}
      <header
        className="shrink-0 border-b border-line bg-canvas px-[var(--space-page)]"
        style={{ paddingTop: 'var(--space-card)' }}
      >
        <div className="flex items-start justify-between gap-4 pb-3">
          <div className="min-w-0">
            <h1
              className="truncate font-semibold leading-tight text-ink"
              style={{ fontSize: 'var(--text-page-title)' }}
            >
              {heading}
            </h1>
            {sub && (
              <p
                className="mt-0.5 truncate text-ink-2"
                style={{ fontSize: 'var(--text-meta)' }}
              >
                {sub}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>

        {hasTabs && <AreaTabs area={area} />}
      </header>

      {/* Cuerpo — región de altura ACOTADA. flex-1 min-h-0 ocupa el resto
          del viewport; overflow-hidden: la PÁGINA no scrollea. El hijo
          (panel/tabla/lista) recibe esta caja y hace su scroll interno. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}
