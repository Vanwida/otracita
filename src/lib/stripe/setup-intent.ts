import { stripe } from '@/lib/stripe'
import type Stripe from 'stripe'

// -----------------------------------------------------------------------------
// SetupIntent para guardar la tarjeta del cliente final (tarifa no-show).
//
// ARQUITECTURA (investigada contra docs Stripe vigentes): el Customer y el
// PaymentMethod viven en la cuenta PLATAFORMA, NO en la Connect del barbero.
// El cobro posterior de la tarifa es un destination charge desde la
// plataforma (igual que el resto de pagos y que `no-show-fee.ts`, que ya
// espera customer+PM de plataforma). `on_behalf_of` NO se necesita en
// España/EU (misma región) — no se añade para no sobre-ingeniar.
//
// Customer por (clientId, phone): la misma persona en 2 barberías son 2
// Customers distintos en Stripe, igual que son 2 filas en `customers`
// (multi-tenancy: nunca se mezcla tarjeta entre negocios). Buscamos por
// metadata para no recrear un Customer si el cliente reserva otra vez.
//
// `usage:'off_session'` en el SetupIntent = el mandato MIT que Stripe exige
// para luego cobrar sin el cliente presente (lo consume `no-show-fee.ts`).
// -----------------------------------------------------------------------------

const CUSTOMER_METADATA_TENANT = 'otracita_client_id'
const CUSTOMER_METADATA_PHONE = 'otracita_customer_phone'

export interface EnsureSetupIntentInput {
  /** Tenant (barbería) — del slug resuelto en el server, nunca del cliente. */
  clientId: string
  /** Teléfono canónico del cliente (E.164). Clave junto a clientId. */
  customerPhone: string
  customerName?: string | null
  customerEmail?: string | null
  /** Customer de Stripe ya guardado en `customers.stripe_customer_id`, si lo
   *  hay — lo reutilizamos en vez de buscar/crear. */
  existingStripeCustomerId?: string | null
}

export interface EnsureSetupIntentResult {
  setupIntentId: string
  clientSecret: string
  stripeCustomerId: string
}

/**
 * Resuelve (reutiliza o crea) el Customer de plataforma para este
 * (tenant, teléfono) y abre un SetupIntent off_session. Idempotente en la
 * práctica: reutiliza Customer por id guardado o por búsqueda de metadata,
 * y un SetupIntent sin confirmar caduca solo en Stripe (no ensucia datos).
 */
export async function ensureCustomerSetupIntent(
  input: EnsureSetupIntentInput,
): Promise<EnsureSetupIntentResult> {
  let customerId = input.existingStripeCustomerId ?? null

  // Si no tenemos id guardado, buscamos por metadata para no duplicar el
  // Customer cuando el cliente vuelve a reservar antes de que se haya
  // persistido (o reservó y abandonó el paso de tarjeta).
  if (!customerId) {
    const query = `metadata['${CUSTOMER_METADATA_TENANT}']:'${input.clientId}' AND metadata['${CUSTOMER_METADATA_PHONE}']:'${input.customerPhone}'`
    try {
      const found = await stripe.customers.search({ query, limit: 1 })
      customerId = found.data[0]?.id ?? null
    } catch (err) {
      // search puede no estar habilitado en cuentas muy nuevas — no es
      // fatal, creamos Customer abajo.
      console.error('[setup-intent] customer search failed:', err)
    }
  }

  if (!customerId) {
    const created = await stripe.customers.create({
      name: input.customerName ?? undefined,
      email: input.customerEmail ?? undefined,
      phone: input.customerPhone,
      metadata: {
        [CUSTOMER_METADATA_TENANT]: input.clientId,
        [CUSTOMER_METADATA_PHONE]: input.customerPhone,
      },
    })
    customerId = created.id
  }

  const setupIntent: Stripe.SetupIntent = await stripe.setupIntents.create({
    customer: customerId,
    usage: 'off_session',
    payment_method_types: ['card'],
    metadata: {
      [CUSTOMER_METADATA_TENANT]: input.clientId,
      [CUSTOMER_METADATA_PHONE]: input.customerPhone,
    },
  })

  if (!setupIntent.client_secret) {
    throw new Error('Stripe no devolvió client_secret del SetupIntent.')
  }

  return {
    setupIntentId: setupIntent.id,
    clientSecret: setupIntent.client_secret,
    stripeCustomerId: customerId,
  }
}

export interface VerifiedSavedCard {
  stripeCustomerId: string
  paymentMethodId: string
}

/**
 * Valida que un SetupIntent (id que el cliente confirmó en el navegador)
 * pertenece a ESTE tenant+teléfono y quedó `succeeded` con un PaymentMethod.
 * NUNCA se confía en el cliente: re-leemos el objeto del servidor y
 * comprobamos status + metadata. Devuelve null si no es válido/consentible.
 */
export async function verifyConfirmedSetupIntent(args: {
  setupIntentId: string
  clientId: string
  customerPhone: string
}): Promise<VerifiedSavedCard | null> {
  let si: Stripe.SetupIntent
  try {
    si = await stripe.setupIntents.retrieve(args.setupIntentId)
  } catch (err) {
    console.error('[setup-intent] retrieve failed:', err)
    return null
  }

  if (si.status !== 'succeeded') return null
  if (si.metadata?.[CUSTOMER_METADATA_TENANT] !== args.clientId) return null
  if (si.metadata?.[CUSTOMER_METADATA_PHONE] !== args.customerPhone) return null

  const customerId =
    typeof si.customer === 'string' ? si.customer : si.customer?.id ?? null
  const paymentMethodId =
    typeof si.payment_method === 'string'
      ? si.payment_method
      : si.payment_method?.id ?? null

  if (!customerId || !paymentMethodId) return null
  return { stripeCustomerId: customerId, paymentMethodId }
}
