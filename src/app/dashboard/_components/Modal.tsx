'use client';

import { X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

// -----------------------------------------------------------------------------
// Modal — primitivo CANÓNICO del diálogo CENTRADO del dashboard.
//
// Hermano de SlideOver (panel derecho) y de ConfirmDialog (confirm rápido).
// Antes ~15 modales reimplementaban a mano el mismo chasis
// `fixed inset-0 flex items-center justify-center` + scrim + cierre + foco
// + scroll-lock, cada uno divergiendo en ancho/scrim/escape/a11y (la clase
// de inconsistencia que el usuario repetía). Esto es la ÚNICA fuente de ese
// chasis. Mismo nivel de rigor que ConfirmDialog:
//   · portal a <body> (escapa overflow:hidden / transform de ancestros)
//   · role=dialog + aria-modal + aria-labelledby (o aria-label)
//   · ESC cierra (capture en window), clic en scrim cierra
//   · focus-trap básico (Tab/Shift+Tab circula dentro) + autofocus
//   · bloqueo de scroll del body mientras está abierto
//   · scrim de marca (--color-scrim-strong) + animación fade/scale
//     (mismas keyframes que ConfirmDialog: coherencia visual)
//   · header estándar (título + botón cerrar) si se pasa `title`; el
//     consumidor puede omitirlo y pintar el suyo como primer hijo
//   · `footer` opcional fijo (barra de acciones), cuerpo scrollea solo
//   · `closeOnBackdrop=false` para flujos críticos (cobro en curso, etc.)
//
// Sin lógica de negocio: es chrome. Cada modal migrado conserva su
// contenido/props/comportamiento; sólo cambia el chasis.
// -----------------------------------------------------------------------------

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** Header estándar (título + botón cerrar). Omitir para header propio. */
  title?: string;
  /** Subtítulo bajo el título (metadata corta, no párrafos). */
  subtitle?: ReactNode;
  /** aria-label del diálogo. Obligatorio si no hay `title`. */
  ariaLabel?: string;
  /** Ancho máximo. Default 'md'. */
  size?: ModalSize;
  /** Clase z-index. Default z-50. Subir sólo para apilar sobre otro modal
   *  (p. ej. prompt de cobro encima del POS). */
  zClass?: string;
  /** Si false, clic en scrim y ESC NO cierran (acción crítica en curso). */
  closeOnBackdrop?: boolean;
  /** Barra de acciones fija al pie (fuera del scroll del cuerpo). */
  footer?: ReactNode;
  children: ReactNode;
}

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  ariaLabel,
  size = 'md',
  zClass = 'z-50',
  closeOnBackdrop = true,
  footer,
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // ESC cierra (capture en window, gana al navegador) — patrón ConfirmDialog.
  useEffect(() => {
    if (!open || !closeOnBackdrop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, closeOnBackdrop]);

  // Bloqueo de scroll del body + autofocus al primer foco — ConfirmDialog.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => {
      const el = panelRef.current;
      if (!el) return;
      const focusable = el.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? el).focus();
    }, 10);
    return () => {
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
    };
  }, [open]);

  // Focus-trap básico: Tab/Shift+Tab circula dentro (mismo nivel que
  // SlideOver). El foco no escapa al documento de detrás.
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

  // SSR-safe: document sólo existe en cliente; sin `open` no monta nada.
  if (typeof document === 'undefined' || !open) return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${zClass} flex items-center justify-center p-4 bg-[var(--color-scrim-strong)] backdrop-blur-sm animate-[fadeIn_120ms_ease-out]`}
      onClick={() => closeOnBackdrop && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title ? undefined : ariaLabel}
      aria-labelledby={title ? titleId : undefined}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={onKeyDownTrap}
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full ${SIZE_CLASS[size]} max-h-[90vh] flex flex-col rounded-2xl bg-surface shadow-2xl ring-1 ring-line/60 overflow-hidden outline-none animate-[scaleIn_140ms_ease-out]`}
      >
        {title && (
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-line shrink-0">
            <div className="min-w-0">
              <h3
                id={titleId}
                className="text-base font-semibold text-ink leading-tight"
              >
                {title}
              </h3>
              {subtitle && (
                <p className="mt-0.5 text-xs text-ink-2">{subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="shrink-0 p-1 -m-1 rounded-lg text-ink-3 hover:text-ink-2 hover:bg-overlay transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Cuerpo — único que scrollea. */}
        <div className="flex-1 overflow-y-auto">{children}</div>

        {footer && (
          <div className="shrink-0 border-t border-line bg-overlay/40 px-5 py-3">
            {footer}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
