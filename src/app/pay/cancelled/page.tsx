import { XCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

// Page the customer lands on if they abandon the Stripe Checkout. No action
// required on our side — the webhook flips the row to 'cancelled' when the
// session expires. We just tell them nothing was charged.
export default function PayCancelledPage() {
  return (
    <main className="min-h-screen bg-canvas flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[500px] bg-surface border border-line rounded-2xl p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-warning/30 bg-warning/10">
          <XCircle className="h-8 w-8 text-warning" strokeWidth={2} />
        </div>
        <h1 className="font-display mt-6 text-2xl md:text-3xl font-semibold text-ink">
          Pago no completado
        </h1>
        <p className="mt-3 text-sm text-ink-2 leading-relaxed">
          No se ha procesado el pago. No se ha cobrado nada de tu tarjeta.
          Si quieres intentarlo de nuevo, pide a la barbería un nuevo enlace.
        </p>
      </div>
    </main>
  );
}
