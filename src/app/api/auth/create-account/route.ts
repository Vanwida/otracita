import Stripe from 'stripe';
import { auth } from '@/lib/auth/server';
import { db } from '@/db';
import { clients } from '@/db/schema';
import { eq, or, sql } from 'drizzle-orm';
import {
  validateCheckoutSession,
  validateClaim,
  type CheckoutSessionFacts,
} from '@/lib/billing/account-claim';

// -----------------------------------------------------------------------------
// Crea la cuenta otracita tras completar el checkout en Stripe.
//
// Diseño (2026-04-24 — iteración): el email de facturación en Stripe puede
// ser distinto del email que el barbero quiere usar para entrar al panel
// (ej. `pagos@empresa.com` vs `carlos@gmail.com`). Desacoplamos:
//
//   · El pago lo ata Stripe (customer_id, subscription_id).
//   · La cuenta otracita usa el email que el barbero elija libremente en
//     el form de /gracias. Ese email será su usuario de Better Auth.
//
// Gate antihijack (2026-08-18 — L-06): esta ruta SIEMPRE exige un
// `sessionId` de una sesión de checkout completada. Antes el gate vivía
// dentro de `if (sessionId)`, así que un POST sin sessionId se saltaba la
// verificación entera y podía reclamar por email cualquier tenant que el
// webhook hubiera dejado en `pending`. Las reglas viven en
// `src/lib/billing/account-claim.ts` (puras, testeadas).
//
// El signup de Better Auth de /login NO pasa por aquí — el tier solo es
// gratis y se registra directo. Esta ruta es sólo el post-checkout de pago.
//
// Stripe webhook (checkout.session.completed) ya crea el row de `clients`
// con el email de facturación como placeholder. Aquí actualizamos ese
// mismo row con el email de login elegido por el barbero.
// -----------------------------------------------------------------------------

async function fetchSessionFacts(sessionId: string): Promise<CheckoutSessionFacts | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error('[create-account] STRIPE_SECRET_KEY missing — rejecting');
    return null;
  }

  const stripe = new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return {
      status: session.status,
      paymentStatus: session.payment_status,
      customerId: typeof session.customer === 'string' ? session.customer : null,
    };
  } catch (retrieveError) {
    console.error('[create-account] session retrieve failed:', retrieveError);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const { email, password, sessionId } = await request.json();

    if (!email || !password) {
      return Response.json(
        { error: 'Faltan campos obligatorios' },
        { status: 400 }
      );
    }

    const loginEmail = String(email).trim().toLowerCase();

    // ── Gate 1: sesión de Stripe completada. Sin esto no se toca nada ──
    const facts =
      typeof sessionId === 'string' && sessionId.trim().length > 0
        ? await fetchSessionFacts(sessionId.trim())
        : null;

    const gate = validateCheckoutSession(facts);
    if (!gate.ok) {
      return Response.json({ error: gate.error }, { status: gate.httpStatus });
    }
    const { stripeCustomerId } = gate;

    // ── Gate 2: ni el pago ni el email pueden ser de otro ──────────────
    // `lower(email)`: el webhook guarda el email de Stripe sin normalizar,
    // así que un `Victima@x.com` en DB no puede parecer email libre.
    const candidateRows = await db
      .select()
      .from(clients)
      .where(
        or(
          eq(clients.stripeCustomerId, stripeCustomerId),
          sql`lower(${clients.email}) = ${loginEmail}`,
        ),
      );

    const claimFailure = validateClaim(loginEmail, stripeCustomerId, candidateRows);
    if (claimFailure) {
      return Response.json(
        { error: claimFailure.error },
        { status: claimFailure.httpStatus }
      );
    }

    // ── Crear user Better Auth con el email ELEGIDO ────────────────────
    try {
      await auth.api.signUpEmail({
        body: { email: loginEmail, password, name: loginEmail.split('@')[0] },
        headers: request.headers,
      });
    } catch (signUpError) {
      // Si ya existe (ej. el usuario ya se registró antes y vuelve), seguimos
      // al signIn que valida la password.
      console.log('Signup note:', signUpError);
    }

    // ── Sign in para crear cookie de sesión ────────────────────────────
    try {
      await auth.api.signInEmail({
        body: { email: loginEmail, password },
        headers: request.headers,
      });
    } catch (signInError) {
      console.error('Sign-in error:', signInError);
      return Response.json(
        { error: 'Email o contraseña incorrectos.' },
        { status: 401 }
      );
    }

    // ── Rebind: actualizar el row `clients` creado por el webhook para
    // que su `email` sea el de login. Así, en el dashboard el lookup
    // `SELECT * FROM clients WHERE email = session.user.email` funciona.
    // ──────────────────────────────────────────────────────────────────
    // Re-consultamos en vez de reusar `candidateRows`: el webhook de Stripe
    // puede haber insertado la fila mientras corría el signup.
    const [ownClient] = await db
      .select()
      .from(clients)
      .where(eq(clients.stripeCustomerId, stripeCustomerId));

    if (ownClient && ownClient.email !== loginEmail) {
      await db
        .update(clients)
        .set({ email: loginEmail, updatedAt: new Date() })
        .where(eq(clients.id, ownClient.id));
    }

    return Response.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Create account error:', message);
    return Response.json(
      { error: 'Error al crear la cuenta' },
      { status: 500 }
    );
  }
}
