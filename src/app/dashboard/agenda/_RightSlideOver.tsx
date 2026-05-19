'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { ReactNode } from 'react';

// -----------------------------------------------------------------------------
// FUENTE ÚNICA del "chrome" del panel deslizante derecho de la agenda.
//
// Antes había DOS paneles con anchos distintos: NewBookingPanel usaba
// `w-80` (320px, estrecho — se perdía info y obligaba a scrollear) y
// BookingDetailPanel `w-[440px] max-w-[90vw]` (Booksy-exact). Mismo gesto
// (slide-over derecho) con dos chasis distintos: incoherente y duplicado.
//
// Este componente es el ÚNICO sitio donde se define:
//   · posición fija a la derecha (`fixed right-0 top-0 h-full`)
//   · ancho (`w-[440px] max-w-[90vw]`) ← única fuente de verdad
//   · scrim móvil (`bg-[var(--color-scrim-light)]`, lg:hidden)
//   · borde/sombra/contenedor flex-col
//   · animación de entrada/salida (slide desde la derecha)
//   · AnimatePresence para montar/desmontar con animación
//
// Cada panel (NewBookingPanel / BookingDetailPanel) renderiza su PROPIO
// header y cuerpo como `children` — la estructura interna y el
// comportamiento de cada uno quedan intactos; solo el chasis es común.
//
// Nota: los modales y overlays SIBLINGS de BookingDetailPanel (AddProduct,
// PaymentPrompt, RectificativaModal, ClientProfile) NO entran aquí — no son
// parte del slide-over, son hermanos suyos y mantienen su propio ciclo.
// -----------------------------------------------------------------------------

interface Props {
  /** Controla montaje/desmontaje animado del panel. */
  isOpen: boolean;
  /** Cierre al pulsar el scrim móvil (la X vive en el header de cada panel). */
  onClose: () => void;
  /** Header + cuerpo + footer propios del panel concreto. */
  children: ReactNode;
  /** aria-label del diálogo (cada panel describe su propósito). */
  ariaLabel: string;
}

export default function RightSlideOver({
  isOpen,
  onClose,
  children,
  ariaLabel,
}: Props) {
  // Nota sobre la animación de salida: algunos consumidores
  // (BookingDetailPanel) condicionan sus children al mismo dato que
  // controla `isOpen` (`booking && (...)`). No hace falta latch: cuando
  // `isOpen`→false, AnimatePresence NO re-renderiza el subárbol — conserva
  // el ÚLTIMO árbol renderizado (con `isOpen` true y children completos)
  // hasta que termina el exit. El panel se desliza fuera CON su contenido,
  // exactamente como cuando AnimatePresence vivía dentro de cada panel.
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Scrim móvil — en desktop el panel coexiste con la agenda. */}
          <motion.div
            key="slideover-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-[var(--color-scrim-light)] lg:hidden"
          />

          <motion.div
            key="slideover-panel"
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            // ÚNICA definición de ancho del slide-over de agenda.
            // x:'100%' hace el desplazamiento independiente del ancho
            // concreto (no hay número mágico duplicado en la animación).
            className="fixed right-0 top-0 z-50 h-full w-[440px] max-w-[90vw] bg-surface border-l border-line flex flex-col shadow-xl"
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
