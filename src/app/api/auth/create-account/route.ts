import Stripe from 'stripe';
import { auth } from '@/lib/auth/server';

export async function POST(request: Request) {
  try {
    const { email, password, sessionId } = await request.json();

    if (!email || !password) {
      return Response.json(
        { error: 'Faltan campos obligatorios' },
        { status: 400 }
      );
    }

    // If sessionId provided, verify Stripe payment
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
          session.customer_email || session.customer_details?.email;
        if (sessionEmail && sessionEmail.toLowerCase() !== email.toLowerCase()) {
          return Response.json(
            { error: 'El email no coincide con la sesion de pago' },
            { status: 400 }
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
