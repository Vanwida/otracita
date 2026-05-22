'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// -----------------------------------------------------------------------------
// SlideOver — primitivo CANÓNICO del panel deslizante derecho del dashboard.
//
// Contexto (CTO): hay ~19 paneles `fixed` repartidos por el dashboard, cada
// uno reimplementando posición / ancho / scrim / cierre / accesibilidad. Este
// componente es la ÚNICA fuente de verdad de ese chasis para que esos paneles
// puedan migrar aquí (la migración masiva es un refactor aparte; este archivo
// solo tiene que ser lo bastante bueno para que PUEDAN migrar).
//
// Define una sola vez:
//   · portal a <body> (escapa de overflow:hidden / transform de ancestros —
//     el bug clásico de los slide-over metidos en el árbol de layout)
//   · posición fija a la derecha + alto completo
//   · ANCHO canónico (única definición; consumidores no lo hardcodean)
//   · scrim (clic = cerrar) — opacidad de marca, no negro
//   · animación de entrada/salida (slide independiente del ancho concreto)
//   · accesibilidad como ConfirmDialog: role=dialog + aria-modal +
//     aria-label(ledby), ESC cierra, focus-trap básico, autofocus,
//     bloqueo de scroll del body
//   · header estándar (título + botón cerrar) cuando se pasa `title`;
//     si el consumidor necesita un header a medida (p. ej. la banda de
//     estado de color del detalle de cita) omite `title` y lo renderiza
//     como primer hijo — el chasis sigue siendo común.
//
// Mantener este componente sin lógica específica de ningún panel: es un
// primitivo, no "el panel de agenda".
// -----------------------------------------------------------------------------

/** Ancho canónico del slide-over del dashboard. ÚNICA definición — antes
 *  divergía (w-80 / w-[440px] / w-[480px]). Cualquier panel que no pase
 *  `width` hereda esto; cambiarlo aquí lo cambia en todos. */
export const SLIDEOVER_WIDTH = 'w-[440px] max-w-[90vw]';

interface Props {
  /** Controla montaje/desmontaje animado. */
  open: boolean;
  onClose: () => void;
  /** Header estándar (título en mayúsculas + botón cerrar). Omitir si el
   *  consumidor pinta su propio header como primer hijo. */
  title?: string;
  /** aria-label del diálogo. Obligatorio si no hay `title` (accesibilidad). */
  ariaLabel?: string;
  /** Override de ancho (clases Tailwind). Default = ancho canónico. Pensado
   *  para casos futuros, NO para volver a divergir sin razón. */
  width?: string;
  /** Fondo del panel. `canvas` para superficies tipo lista (ClientProfile);
   *  `surface` (default) para formularios/detalle. */
  surface?: 'surface' | 'canvas';
  /** Clase z-index. Default canónico (z-50). Subir SOLO para apilar un
   *  slide-over sobre otro (p. ej. ficha de cliente encima del detalle). */
  zClass?: string;
  /**
   * Comportamiento del scrim/fondo:
   *   · 'mobile' (default) → el panel ACOMPAÑA a la página en tablet/desktop
   *     (scrim solo en móvil <md, `md:hidden`; sin bloqueo de scroll del body
   *     — la página de detrás sigue usable, p. ej. la agenda con el panel
   *     de detalle acoplado a un lado). En iPad portrait (768+) ya hay
   *     espacio para que el panel coexista con el contenido.
   *   · 'always' → modal real: scrim siempre + bloqueo de scroll del body
   *     (p. ej. la ficha de cliente apilada SOBRE el panel de detalle).
   * ESC y la gestión de foco aplican en ambos modos.
   */
  scrim?: 'mobile' | 'always';
  children: ReactNode;
}

export default function SlideOver({
  open,
  onClose,
  title,
  ariaLabel,
  width = SLIDEOVER_WIDTH,
  surface = 'surface',
  zClass = 'z-50',
  scrim = 'mobile',
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // ESC cierra. Capture en window para ganar al navegador (igual que
  // ConfirmDialog). Solo activo mientras está abierto.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Autofocus al primer foco del panel mientras está abierto (patrón
  // ConfirmDialog). El bloqueo de scroll del body SOLO en modo 'always'
  // (modal real): en 'mobile' el panel acompaña a la página en desktop y
  // bloquear el scroll dejaría la agenda detrás congelada e inusable.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    if (scrim === 'always') document.body.style.overflow = 'hidden';
    const t = setTimeout(() => {
      const el = panelRef.current;
      if (!el) return;
      const focusable = el.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? el).focus();
    }, 10);
    return () => {
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
    };
  }, [open, scrim]);

  // Focus-trap básico: Tab/Shift+Tab circula dentro del panel (no se escapa
  // al documento detrás). Mismo nivel de rigor que ConfirmDialog.
  const onKeyDownTrap = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const el = panelRef.current;
    if (!el) return;
    const nodes = el.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  // Portal a <body>: el slide-over debe vivir fuera del árbol de layout
  // (ancestros con overflow:hidden/transform romperían fixed). SSR-safe:
  // document solo existe en cliente, AnimatePresence no monta nada hasta
  // que open=true en cliente.
  if (typeof document === 'undefined') return null;

  const bgClass = surface === 'canvas' ? 'bg-canvas' : 'bg-surface';

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Scrim — clic cierra. Opacidad de marca (no negro). En modo
              'mobile' es `md:hidden` (consistente con el nuevo shell:
              iPad+desktop empiezan en md=768px); en 'always' tapa siempre
              (modal). Antes era `lg:hidden` — iPad portrait quedaba con
              scrim cuando ya tenía espacio para el panel acompañando. */}
          <motion.div
            key="slideover-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className={`fixed inset-0 ${zClass} bg-[var(--color-scrim-light)]${
              scrim === 'mobile' ? ' md:hidden' : ''
            }`}
          />

          <motion.div
            key="slideover-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title ? undefined : ariaLabel}
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            onKeyDown={onKeyDownTrap}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            // ÚNICA definición de ancho del slide-over (vía `width`,
            // default SLIDEOVER_WIDTH). x:'100%' hace el slide
            // independiente del ancho concreto.
            //
            // `overflow-hidden` es CRÍTICO: el chasis es flex-col con
            // header `shrink-0` + children. Sin overflow-hidden aquí, si
            // los children declaran `h-full` (patrón heredado en
            // ServicesManager/HoursSlideOver/etc), reclaman 100% del panel
            // y desbordan el viewport hacia abajo, ocultando el footer
            // sticky y dejando al usuario sin poder llegar a "Guardar".
            // Con overflow-hidden el panel clipea al viewport y el
            // overflow-y-auto interno del consumidor funciona como debe.
            className={`fixed right-0 top-0 ${zClass} h-full ${width} ${bgClass} border-l border-line flex flex-col overflow-hidden shadow-xl outline-none`}
          >
            {title && (
              <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
                <span
                  id={titleId}
                  className="text-sm font-semibold text-ink"
                >
                  {title}
                </span>
                {/* WCAG 2.2 SC 2.5.8/2.5.5: hit area 44×44 (h-11 w-11),
                    glyph 16px. -mr-2 recupera espacio óptico del header. */}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-overlay text-ink-3 hover:text-ink-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
