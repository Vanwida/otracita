import { CheckCircle2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

// Minimal confirmation page the END CUSTOMER lands on after paying via the
// Stripe Checkout QR. We deliberately keep this page hostless — no auth, no
// tenant context, no DB hit — because the actual state transition happens in
// our webhook, not here. Showing the customer a soft "thanks" is enough.
//
// Stripe appends `?session_id={CHECKOUT_SESSION_ID}` but we don't need it to
// render — if for some reason the webhook is delayed, we don't want to
// mislead them by displaying "confirmed" before our DB knows. Generic copy.
export default function PaySuccessPage() {
  return (
    <main className="min-h-screen bg-canvas flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[500px] bg-surface border border-line rounded-2xl p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-success/30 bg-success/10">
          <CheckCircle2 className="h-8 w-8 text-success" strokeWidth={2} />
        </div>
        <h1 className="font-display mt-6 text-2xl md:text-3xl font-semibold text-ink">
          Pago confirmado
        </h1>
        <p className="mt-3 text-sm text-ink-2 leading-relaxed">
          Tu reserva está lista. Tu barbería recibirá la confirmación del pago
          automáticamente. Puedes cerrar esta ventana.
        </p>
      </div>
    </main>
  );
}
