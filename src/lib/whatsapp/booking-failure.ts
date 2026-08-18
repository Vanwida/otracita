// ---------------------------------------------------------------------------
// Qué le decimos al cliente cuando la reserva NO se ha creado.
//
// `createBooking` devuelve `{ success: false, error, message }` y el bot se lo
// comía con un `console.warn`: el cliente se quedaba sin respuesta y la
// conversación moría en `idle`. Dos móviles pidiendo el mismo hueco → el
// segundo no se enteraba de nada. Ver L-09.
//
// Dos decisiones, ambas por CÓDIGO de error, nunca olfateando el string:
//
// 1. Qué mensaje reenviamos. Los errores de negocio (`overlap`, `lead_time`,
//    `horizon`, `no_barber_available`, `card_required`, `customer_blocked`)
//    ya vienen redactados en castellano y son seguros. Los de `validation`
//    NO: son de programador ("customerPhone is required", "Invalid date
//    format") y describen un bug nuestro, no algo que el cliente pueda
//    arreglar — esos van a mensaje genérico.
//
// 2. Si tiene sentido reintentar. Con `overlap` o `lead_time` otro hueco sí
//    funciona → volvemos al selector. Con `card_required` o
//    `customer_blocked` fallarían TODOS los huecos: reofrecerlos sería un
//    bucle de fracaso, así que se cierra el flujo.
// ---------------------------------------------------------------------------

import type { CreateBookingError } from '../bookings/create.ts';

type Lang = 'es' | 'en';

export interface BookingFailure {
  error: CreateBookingError;
  message: string;
}

export type BookingFailureAction =
  /** Otro hueco puede funcionar → reofrecer la lista de huecos. */
  | 'retry_slots'
  /** Todos los huecos fallarían igual (o es un fallo nuestro) → cerrar. */
  | 'end';

export interface BookingFailureReply {
  message: string;
  action: BookingFailureAction;
}

/** Errores cuyo `message` está redactado para el cliente final. */
const FORWARDABLE_MESSAGE: ReadonlySet<CreateBookingError> = new Set([
  'overlap',
  'lead_time',
  'horizon',
  'no_barber_available',
  'card_required',
  'customer_blocked',
]);

/** Errores en los que reofrecer huecos tiene sentido. */
const RETRYABLE: ReadonlySet<CreateBookingError> = new Set([
  'overlap',
  'lead_time',
  'horizon',
  'no_barber_available',
]);

/** El `message` de `createBooking` es solo castellano; para EN reescribimos
 *  por código. Se pierden los números interpolados (min de antelación, días
 *  de horizonte) pero se gana que el cliente entienda la frase. */
const EN_BY_ERROR: Partial<Record<CreateBookingError, string>> = {
  overlap: 'Sorry, that slot has just been taken.',
  lead_time: "That slot is too soon to book online — it's already within our notice period.",
  horizon: "That date is too far ahead — we're not taking bookings that far out yet.",
  no_barber_available: 'Nobody is free at that time.',
  card_required:
    'To book online you need to save a card and accept the no-show fee. Please contact us directly.',
  customer_blocked: "Online booking isn't available for you. Please contact the barbershop directly.",
};

const GENERIC: Record<Lang, string> = {
  es: 'No he podido crear la reserva. Inténtalo de nuevo en un momento o contacta directamente con la barbería.',
  en: "I couldn't create the booking. Please try again in a moment or contact the barbershop directly.",
};

/**
 * Traduce un fallo de `createBooking` en lo que el bot debe hacer.
 *
 * @param failure `null` cuando el fallo no viene de `createBooking` (excepción,
 *   barbería sin calendario configurado, error de Google Calendar): mensaje
 *   genérico y cerrar.
 */
export function bookingFailureReply(
  failure: BookingFailure | null | undefined,
  lang: Lang = 'es'
): BookingFailureReply {
  if (!failure) {
    return { message: GENERIC[lang], action: 'end' };
  }

  const action: BookingFailureAction = RETRYABLE.has(failure.error) ? 'retry_slots' : 'end';

  if (lang === 'en') {
    return { message: EN_BY_ERROR[failure.error] ?? GENERIC.en, action };
  }

  const message =
    FORWARDABLE_MESSAGE.has(failure.error) && failure.message.trim()
      ? failure.message
      : GENERIC.es;

  return { message, action };
}
