import Stripe from 'stripe';
import { auth } from '@/lib/auth/server';

// Post-checkout account creation. The user lands on /gracias with a Stripe
// `session_id` in the URL, types a password, and POSTs it here. We MUST verify
// that:
//   1. the Stripe session actually paid, AND
//   2. the email the user is signing up with matches the email that paid.
// Skipping (2) would let an attacker with someone else's `session_id` create
// an account bound to the real customer's subscription under the attacker's
// email — aka subscription hijack.
export async function POST(request: Request) {
  try {
    const { email, password, sessionId } = await request.json();

    if (!email || !password) {
      return Response.json(
        { error: 'Faltan campos obligatorios' },
        { status: 400 }
      );
    }

    if (sessionId) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (key) {
        const stripe = new Stripe(key, {
          httpClient: Stripe.createFetchHttpClient(),
        });

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status !== 'paid') {
          return Response.json(
            { error: 'El pago no se ha completado' },
            { status: 400 }
          );
        }

        const sessionEmail =
          session.customer_email || session.customer_details?.email || null;

        // Stripe returning no email on a paid session is a configuration
        // smell — we require it to bind the account to a verified payer.
        if (!sessionEmail) {
          console.error(
            `[create-account] paid session ${sessionId} returned no email — rejecting`,
          );
          return Response.json(
            { error: 'No se pudo verificar tu email de pago' },
            { status: 400 }
          );
        }

        if (sessionEmail.toLowerCase() !== String(email).toLowerCase()) {
          return Response.json(
            { error: 'Email no coincide con la sesión de pago' },
            { status: 403 }
          );
        }
      }
    }

    // Try sign up first, then sign in if already exists
    try {
      await auth.api.signUpEmail({
        body: { email, password, name: email.split('@')[0] },
        headers: request.headers,
      });
    } catch (signUpError) {
      // Account might already exist — proceed to sign in
      console.log('Signup note:', signUpError);
    }

    // Sign in to set the session cookie
    try {
      await auth.api.signInEmail({
        body: { email, password },
        headers: request.headers,
      });
    } catch (signInError) {
      console.error('Sign-in error:', signInError);
      return Response.json(
        { error: 'Error al iniciar sesion. Intenta de nuevo.' },
        { status: 500 }
      );
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
