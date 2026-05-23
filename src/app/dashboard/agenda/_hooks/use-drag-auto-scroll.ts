'use client';

import { useEffect, useRef } from 'react';

/**
 * Auto-scroll vertical de un contenedor mientras hay un drag&drop activo.
 *
 * Bug que resuelve (#67): en la agenda dashboard (Día), si el barbero
 * arrastra una cita de 10:00 a 18:00, la zona destino queda fuera del
 * viewport. Hoy había que soltar, scrollear con la rueda, agarrar otra vez.
 *
 * Con este hook: cuando el cursor entra en las zonas "hot" (top/bottom del
 * contenedor scrollable) durante un drag activo, el contenedor se scrollea
 * solo. Velocidad acelerada cuanto más cerca del borde — patrón Google
 * Calendar / Cal.com / Notion.
 *
 * Detalle técnico — escuchamos `dragover` en `document`, NO `pointermove`.
 * El drag actual de la agenda usa la API HTML5 nativa (`draggable`,
 * `onDragStart`, `onDrop`); durante un drag HTML5 los eventos pointer/mouse
 * NO se disparan en la mayoría de browsers (spec: el browser captura el
 * cursor). El único evento fiable que llega de forma continua es `dragover`.
 *
 * Touch: HTML5 drag&drop no funciona en touch (limitación iOS Safari /
 * Android Chrome). Cuando se implemente drag táctil (PointerEvents +
 * setPointerCapture), se podrá ampliar este hook escuchando `pointermove`
 * adicional con un guard explícito — por ahora sería código muerto. La
 * agenda admin actual ya está pointer-fine-only (ver `pointerFine` en
 * DayGrid) así que esto cubre 100% del uso real hoy.
 *
 * Performance: requestAnimationFrame en bucle mientras estamos en zona hot,
 * cancel al salir / al soltar. Sin throttle manual — rAF ya está sincronizado
 * con el repaint del browser y la mutación de `scrollTop` es barata.
 */

interface UseDragAutoScrollOptions {
  /**
   * Si `false`, el hook no engancha listeners. Úsalo para activar el
   * comportamiento solo mientras hay un drag&drop en curso (por ejemplo,
   * controlado por un `draggingId` state). Cuando vuelve a `false`, el
   * efecto de cleanup limpia listeners + cancela cualquier rAF pendiente.
   */
  enabled: boolean;
  /**
   * Tamaño de la zona "hot" en píxeles, medida desde el borde superior e
   * inferior del contenedor. Cuando el cursor entra en esta franja durante
   * un drag, empieza el auto-scroll. Default 60.
   */
  hotZonePx?: number;
  /**
   * Velocidad máxima de scroll en píxeles por frame (rAF ≈ 60Hz → ~720px/s
   * en el borde). Default 12. Aceleración lineal: en el borde mismo se
   * aplica al 100%, en el extremo interior de la zona hot al 0%.
   */
  maxSpeedPx?: number;
}

export function useDragAutoScroll(
  containerRef: React.RefObject<HTMLElement | null>,
  { enabled, hotZonePx = 60, maxSpeedPx = 12 }: UseDragAutoScrollOptions,
): void {
  // Ref-based state — los handlers se registran una vez y leen el último
  // valor sin re-suscribirse en cada frame. Velocidad signed: <0 sube,
  // >0 baja, 0 detiene el bucle.
  const speedRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const tick = () => {
      const speed = speedRef.current;
      if (speed === 0) {
        rafRef.current = null;
        return;
      }
      // clamp para que el scroll no se pase del rango — el browser lo hace
      // solo pero evitamos pedirle frames extra cuando ya estamos a tope.
      const max = container.scrollHeight - container.clientHeight;
      const next = Math.max(0, Math.min(max, container.scrollTop + speed));
      if (next === container.scrollTop) {
        // Ya estamos pegados al tope/fondo en el sentido del scroll.
        rafRef.current = null;
        speedRef.current = 0;
        return;
      }
      container.scrollTop = next;
      rafRef.current = requestAnimationFrame(tick);
    };

    const updateFromY = (clientY: number) => {
      const rect = container.getBoundingClientRect();
      // Fuera del contenedor (cursor salió por arriba/abajo) → detener.
      if (clientY < rect.top || clientY > rect.bottom) {
        speedRef.current = 0;
        return;
      }
      const distTop = clientY - rect.top;
      const distBottom = rect.bottom - clientY;
      let speed = 0;
      if (distTop < hotZonePx) {
        // Cerca del borde superior → scroll hacia ARRIBA (speed negativo).
        // Aceleración lineal: 0 en el borde interior de la zona, -max en el
        // borde mismo del contenedor.
        const intensity = 1 - distTop / hotZonePx;
        speed = -Math.ceil(maxSpeedPx * intensity);
      } else if (distBottom < hotZonePx) {
        const intensity = 1 - distBottom / hotZonePx;
        speed = Math.ceil(maxSpeedPx * intensity);
      }
      speedRef.current = speed;
      if (speed !== 0 && rafRef.current === null) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    const onDragOver = (e: DragEvent) => {
      // No preventDefault aquí — los drop-targets locales ya lo gestionan
      // (preventDefault es lo que les permite recibir el drop). Este
      // listener es OBSERVATIONAL: solo lee clientY para mover el scroll.
      updateFromY(e.clientY);
    };

    // Cualquier evento que termine el drag → resetear velocidad. dragend
    // dispara en el origen del drag; drop dispara en el destino; ambos
    // antes del cleanup del effect (que también limpia, defensa en
    // profundidad para que un cambio de `enabled` no deje un rAF zombie).
    const stop = () => {
      speedRef.current = 0;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragend', stop);
    document.addEventListener('drop', stop);

    return () => {
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('dragend', stop);
      document.removeEventListener('drop', stop);
      stop();
    };
  }, [enabled, containerRef, hotZonePx, maxSpeedPx]);
}
