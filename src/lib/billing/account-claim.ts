// -----------------------------------------------------------------------------
// account-claim — reglas puras que deciden si un POST /api/auth/create-account
// puede reclamar (o crear) una cuenta otracita.
//
// Aisladas aquí para testearlas sin Stripe ni DB. El handler hace las dos
// llamadas de red (retrieve de la sesión de Stripe, SELECT de `clients`) y
// delega TODA la decisión en estas funciones.
//
// El invariante que protegen: sin una sesión de Stripe COMPLETADA y suya,
// nadie toca una fila de `clients` ni crea usuario. La fila `clients` que el
// webhook deja en `pending` con el email de facturación es reclamable sólo
// por quien presenta el session_id que la originó.
// -----------------------------------------------------------------------------

/** Subconjunto de `Stripe.Checkout.Session` del que dependen las reglas. */
export interface CheckoutSessionFacts {
  /** `session.status` — 'complete' | 'open' | 'expired' | null. */
  status: string | null;
  /** `session.payment_status` — 'paid' | 'no_payment_required' | 'unpaid'. */
  paymentStatus: string | null;
  /** `session.customer` normalizado a string, o null si vino expandido/vacío. */
  customerId: string | null;
}

/** Fila de `clients` reducida a lo que las reglas necesitan. */
export interface ClientRowFacts {
  id: string;
  email: string;
  status: string;
  stripeCustomerId: string | null;
}

export interface GateFailure {
  ok: false;
  /** HTTP status con el que responde el handler. */
  httpStatus: number;
  /** Mensaje que ve el barbero. */
  error: string;
}

/** Sesión válida → el handler ya tiene el customer con el que seguir. */
export interface SessionGateOk {
  ok: true;
  stripeCustomerId: string;
}

/**
 * Una suscripción en trial cierra el checkout SIN cobrar: Stripe marca
 * `no_payment_required` (Pro lleva 14 días de trial y
 * `payment_method_collection: 'if_required'`). Lo que de verdad certifica que
 * el checkout terminó es `status === 'complete'`, así que ése es el gate duro
 * y `payment_status` sólo descarta el caso `unpaid`.
 */
const ACCEPTED_PAYMENT_STATUS = new Set(['paid', 'no_payment_required']);

/**
 * Devuelve null si la sesión de Stripe habilita crear cuenta. Si no, el fallo
 * con el que responder.
 *
 * `session === null` significa "no se pudo obtener la sesión" (falta
 * `session_id`, Stripe sin configurar, o el id no existe) → 400 siempre. No
 * existe camino sin sesión: es justo el agujero que cerramos.
 */
export function validateCheckoutSession(
  session: CheckoutSessionFacts | null,
): SessionGateOk | GateFailure {
  if (!session) {
    return {
      ok: false,
      httpStatus: 400,
      error:
        'Necesitamos tu sesión de pago para crear la cuenta. Vuelve a /#precios o entra en /login.',
    };
  }

  if (session.status !== 'complete') {
    return { ok: false, httpStatus: 400, error: 'El pago no se ha completado' };
  }

  if (!session.paymentStatus || !ACCEPTED_PAYMENT_STATUS.has(session.paymentStatus)) {
    return { ok: false, httpStatus: 400, error: 'El pago no se ha completado' };
  }

  if (!session.customerId) {
    return { ok: false, httpStatus: 400, error: 'No pudimos verificar tu suscripción' };
  }

  return { ok: true, stripeCustomerId: session.customerId };
}

/**
 * Devuelve null si `loginEmail` puede quedarse con la cuenta del
 * `stripeCustomerId` dado. Si no, el fallo con el que responder.
 *
 * `rows` son TODAS las filas de `clients` que o bien pertenecen a ese
 * `stripeCustomerId` o bien usan ese email — el handler las trae en un solo
 * SELECT con OR.
 *
 * Dos reglas:
 *  1. Antihijack del pago: si el customer ya tiene una cuenta creada
 *     (`status != 'pending'`) con otro email de login, este pago ya se gastó.
 *  2. Antihijack del email: si el email pertenece a OTRO cliente, no se puede
 *     reclamar. La comparación del customer se hace aquí y no en SQL a
 *     propósito: en Postgres `stripe_customer_id != 'cus_x'` es NULL —y por
 *     tanto falso— para las filas con `stripe_customer_id` nulo (tier solo,
 *     altas de admin), que quedaban fuera del filtro y eran reclamables.
 */
export function validateClaim(
  loginEmail: string,
  stripeCustomerId: string,
  rows: ClientRowFacts[],
): GateFailure | null {
  // El webhook guarda el email de Stripe tal cual llega, así que en DB hay
  // mayúsculas. Comparamos normalizado para que `Victima@x.com` no se cuele
  // como email "libre".
  const target = loginEmail.trim().toLowerCase();
  const sameEmail = (r: ClientRowFacts) => r.email.trim().toLowerCase() === target;

  const alreadyClaimed = rows.find(
    (r) => r.stripeCustomerId === stripeCustomerId && r.status !== 'pending' && !sameEmail(r),
  );
  if (alreadyClaimed) {
    return {
      ok: false,
      httpStatus: 409,
      error:
        'Este pago ya tiene una cuenta otracita asociada. Entra en /login o contacta con soporte si no recuerdas el email.',
    };
  }

  const foreignEmailRow = rows.find(
    (r) => sameEmail(r) && r.stripeCustomerId !== stripeCustomerId,
  );
  if (foreignEmailRow) {
    return {
      ok: false,
      httpStatus: 409,
      error: 'Ese email ya está registrado en otracita. Usa otro distinto o entra en /login.',
    };
  }

  return null;
}
