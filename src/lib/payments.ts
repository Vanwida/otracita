// -----------------------------------------------------------------------------
// Payments helpers — shared constants and pure functions used by the
// Stripe Connect + Payment Link flow. Keep this file free of side-effects so
// it can be imported from route handlers, server components, and tests alike.
// -----------------------------------------------------------------------------

/**
 * Application fee percentage applied to every destination charge. Driven by
 * the `OTRACITA_APPLICATION_FEE_PERCENT` env var so the pilot can run at 0%
 * and we can raise it without a redeploy. Value is a string in env (e.g. "0",
 * "2.5") and is parsed to a float. Invalid / negative / >100 values fall
 * back to 0.
 */
export function getApplicationFeePercent(): number {
  const raw = process.env.OTRACITA_APPLICATION_FEE_PERCENT;
  if (!raw) return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return 0;
  return parsed;
}

/** Compute the application fee in cents for a given total in cents. */
export function calcApplicationFeeCents(amountCents: number): number {
  const percent = getApplicationFeePercent();
  if (percent <= 0) return 0;
  return Math.round(amountCents * (percent / 100));
}

/**
 * Validate an amount in cents is inside the range we accept for a manual
 * payment link: €0.50 – €5000. Anything outside is either a UI bug or a
 * deliberate abuse attempt. Returns null when valid, else a human-readable
 * error message suitable for the UI.
 */
export const MIN_PAYMENT_AMOUNT_CENTS = 50;       // Stripe minimum ~€0.50
export const MAX_PAYMENT_AMOUNT_CENTS = 500_000;  // €5 000 cap for MVP

export function validateAmountCents(amountCents: unknown): string | null {
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents)) {
    return 'Importe inválido (debe ser un entero en céntimos).';
  }
  if (amountCents < MIN_PAYMENT_AMOUNT_CENTS) {
    return `Importe mínimo ${MIN_PAYMENT_AMOUNT_CENTS / 100} €.`;
  }
  if (amountCents > MAX_PAYMENT_AMOUNT_CENTS) {
    return `Importe máximo ${MAX_PAYMENT_AMOUNT_CENTS / 100} €.`;
  }
  return null;
}

/** Canonical statuses for the Stripe Connect account, as we persist them. */
export type ConnectStatus = 'none' | 'pending' | 'active' | 'restricted';

/** Canonical statuses for a `payments` row. */
export type PaymentStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'cancelled';

/** Currency we support in MVP. Keep hard-coded until we actually sell abroad. */
export const PAYMENT_CURRENCY = 'eur';

/** URL prefixes — derivadas de `SITE_ORIGIN` (única fuente en `@/lib/site`).
 *  Re-exportado como `SITE_URL` por compatibilidad con callers existentes. */
import { SITE_ORIGIN } from './site';
export const SITE_URL = SITE_ORIGIN;
export const PAYMENT_SUCCESS_URL = `${SITE_URL}/pay/success?session_id={CHECKOUT_SESSION_ID}`;
export const PAYMENT_CANCELLED_URL = `${SITE_URL}/pay/cancelled`;
export const CONNECT_REFRESH_URL = `${SITE_URL}/dashboard/negocio?connect=refresh`;
export const CONNECT_RETURN_URL = `${SITE_URL}/dashboard/negocio?connect=success`;
