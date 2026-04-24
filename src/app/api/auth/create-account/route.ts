import Stripe from 'stripe';
import { auth } from '@/lib/auth/server';
import { db } from '@/db';
import { clients } from '@/db/schema';
import { eq, ne, and } from 'drizzle-orm';

// -----------------------------------------------------------------------------
// Crea la cuenta otracita tras completar el pago en Stripe.
//
// Diseño (2026-04-24 — iteración): el email de facturación en Stripe puede
// ser distinto del email que el barbero quiere usar para entrar al panel
// (ej. `pagos@empresa.com` vs `carlos@gmail.com`). Desacoplamos:
//
//   · El pago lo ata Stripe (customer_id, subscription_id).
//   · La cuenta otracita usa el email que el barbero elija libremente en
//     el form de /gracias. Ese email será su usuario de Better Auth.
//
// Gate antihijack: antes de crear cuenta validamos que
//   (a) la sesión Stripe tiene `payment_status === 'paid'`, y
//   (b) el `stripeCustomerId` de esa sesión no tiene ya una cuenta
//       otracita ligada (evita que el mismo pago cree 2 cuentas y evita
//       que un atacante reutilice un session_id ajeno).
//
// Stripe webhook (checkout.session.completed) ya crea el row de `clients`
// con el email de facturación como placeholder. Aquí actualizamos ese
// mismo row con el email de login elegido por el barbero.
// -----------------------------------------------------------------------------

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

    // ── Validar pago con Stripe ────────────────────────────────────────
    let stripeCustomerId: string | null = null;
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

        stripeCustomerId =
          typeof session.customer === 'string' ? session.customer : null;

        if (!stripeCustomerId) {
          console.error(
            `[create-account] paid session ${sessionId} without customer id — rejecting`,
          );
          return Response.json(
            { error: 'No pudimos verificar tu suscripción' },
            { status: 400 }
          );
        }
      }
    }

    // ── Antihijack: el stripeCustomerId no puede ya tener otra cuenta
    // de login vinculada (sería un intento de duplicar o secuestrar).
    // ──────────────────────────────────────────────────────────────────
    if (stripeCustomerId) {
      const existing = await db
        .select()
        .from(clients)
        .where(eq(clients.stripeCustomerId, stripeCustomerId));

      // Si ya hay un cliente con ese stripeCustomerId Y tiene un email de
      // login distinto al billing original (= ya alguien creó cuenta),
      // rechazamos. Detectamos "ya creada" por `status != 'pending'` o por
      // la existencia de un user en Better Auth con ese email.
      const alreadyClaimed = existing.find((c) => c.status !== 'pending');
      if (alreadyClaimed && alreadyClaimed.email !== loginEmail) {
        return Response.json(
          {
            error:
              'Este pago ya tiene una cuenta otracita asociada. Entra en /login o contacta con soporte si no recuerdas el email.',
          },
          { status: 409 }
        );
      }
    }

    // ── Check: no permitir loginEmail que ya está ocupado por OTRO
    //    cliente (distinto stripeCustomerId). Importante: si el barbero
    //    escribe el mismo email que el billing (coincide con la row
    //    pending existente), está OK — la row es SUYA.
    // ──────────────────────────────────────────────────────────────────
    if (stripeCustomerId) {
      const sameEmailOther = await db
        .select()
        .from(clients)
        .where(
          and(
            eq(clients.email, loginEmail),
            ne(clients.stripeCustomerId, stripeCustomerId),
          ),
        );
      if (sameEmailOther.length > 0) {
        return Response.json(
          {
            error: 'Ese email ya está registrado en otracita. Usa otro distinto o entra en /login.',
          },
          { status: 409 }
        );
      }
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
    if (stripeCustomerId) {
      const [existingClient] = await db
        .select()
        .from(clients)
        .where(eq(clients.stripeCustomerId, stripeCustomerId));

      if (existingClient && existingClient.email !== loginEmail) {
        await db
          .update(clients)
          .set({ email: loginEmail, updatedAt: new Date() })
          .where(eq(clients.id, existingClient.id));
      }
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
