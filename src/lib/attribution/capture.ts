'use client';

import type { Attribution } from './types';
import { deriveAttribution } from './derive-source';
import { MS_IN_DAY } from '@/lib/time';

// -----------------------------------------------------------------------------
// capture — helpers client-only para guardar/recuperar la atribución en
// localStorage con TTL de 90 días (attribution window estándar).
//
// Estrategia:
//   · Al entrar en /b/[slug]/* → si NO hay attribution previa O ha expirado,
//     derivamos de la URL/referrer actual y guardamos.
//   · Si ya existe una válida (dentro del TTL) → no se sobrescribe. Esto
//     conserva el first-touch durante toda la attribution window aunque el
//     cliente vuelva días después por otro canal.
//
// Diseño: la attribution guardada SIEMPRE refleja el first-touch dentro de
// la ventana. El last-touch (la atribución de ESTA reserva concreta) se
// deriva al momento del booking y se manda como payload separado en la
// request, sin tocar localStorage. Así el backend recibe ambos.
// -----------------------------------------------------------------------------

const STORAGE_KEY = 'otracita_attrib_v1';
const TTL_MS = 90 * MS_IN_DAY; // 90 días

interface StoredAttribution extends Attribution {
  v: 1; // versión del schema; bump si cambiamos el shape
}

function isStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const key = '__otracita_test__';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function readStoredAttribution(): Attribution | null {
  if (!isStorageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAttribution;
    if (parsed.v !== 1) return null;
    if (typeof parsed.capturedAt !== 'number') return null;
    if (Date.now() - parsed.capturedAt > TTL_MS) {
      // Expirada — limpiamos y devolvemos null
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      source: parsed.source,
      medium: parsed.medium,
      campaign: parsed.campaign,
      capturedAt: parsed.capturedAt,
    };
  } catch {
    return null;
  }
}

export function writeStoredAttribution(attribution: Attribution): void {
  if (!isStorageAvailable()) return;
  const toStore: StoredAttribution = { v: 1, ...attribution };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch {
    // QuotaExceeded etc. — silent fail, atribución es nice-to-have, no
    // bloqueante para la reserva.
  }
}

/**
 * Inspecciona la URL actual + document.referrer y guarda atribución si:
 *   · No hay ninguna previa válida, O
 *   · La URL actual tiene UTMs explícitos (override por nueva campaña).
 *
 * Llamar en useEffect al cargar /b/[slug]/*. Idempotente.
 */
export function captureFromCurrentLocation(): Attribution | null {
  if (typeof window === 'undefined') return null;

  const url = window.location.href;
  const referrer = typeof document !== 'undefined' ? document.referrer : '';
  const hasUtm =
    /[?&]utm_source=/.test(url) || /[?&]gclid=/.test(url) || /[?&]fbclid=/.test(url);

  const existing = readStoredAttribution();
  if (existing && !hasUtm) {
    // Ya hay atribución válida y la URL actual no trae UTMs nuevos → no tocar.
    return existing;
  }

  const derived = deriveAttribution({ url, referrer });
  // Solo guardamos si NO es 'direct' (no merece la pena guardar direct;
  // cualquier vista futura con UTM lo reemplazaría igual).
  if (derived.source === 'direct' && !existing) {
    return derived; // devolvemos pero no persistimos
  }
  writeStoredAttribution(derived);
  return derived;
}

/**
 * Para el last-touch de ESTA reserva: deriva sin tocar localStorage.
 */
export function captureLastTouch(): Attribution {
  if (typeof window === 'undefined') {
    return { source: 'direct', medium: 'none', campaign: null, capturedAt: Date.now() };
  }
  return deriveAttribution({
    url: window.location.href,
    referrer: typeof document !== 'undefined' ? document.referrer : '',
  });
}
