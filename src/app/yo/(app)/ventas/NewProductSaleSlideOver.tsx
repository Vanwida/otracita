'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Loader2, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import SlideOver from '@/app/dashboard/_components/SlideOver';
import { formatEuros } from '../_lib/format';

// -----------------------------------------------------------------------------
// NewProductSaleSlideOver — TPV mínimo para el barbero desde móvil.
//
// Lista los productos activos del tenant, el barbero elige cantidad por
// producto, método de cobro (cash/card_physical/bizum) y POST /api/pos/sale.
// Atribución: el endpoint usa el barberId del actor por defecto.
//
// Reusa el primitivo canónico `SlideOver` (panel lateral derecho — feedback
// 2026-05-22 "todo edición es SlideOver"). NO inventa una vista de carrito
// custom. Para flujos complejos (carrito + servicios + clientes), el admin
// sigue usando /dashboard/ventas; esto es el quick-walkin del barbero.
// -----------------------------------------------------------------------------

interface Product {
  id: string;
  name: string;
  priceCents: number;
  active: boolean;
}

interface ProductsResponse {
  products: Product[];
}

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<ProductsResponse>);

interface Props {
  open: boolean;
  onClose: () => void;
  onSold: () => void;
}

type PayMethod = 'cash' | 'card_physical' | 'bizum';

const PAYMENT_METHODS: { key: PayMethod; label: string }[] = [
  { key: 'cash', label: 'Efectivo' },
  { key: 'card_physical', label: 'Tarjeta' },
  { key: 'bizum', label: 'Bizum' },
];

export default function NewProductSaleSlideOver({ open, onClose, onSold }: Props) {
  const { data, isLoading } = useSWR<ProductsResponse>(
    open ? '/api/products' : null,
    fetcher,
  );

  const [qty, setQty] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<PayMethod>('cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQty({});
      setMethod('cash');
      setError(null);
    }
  }, [open]);

  const inc = (id: string) =>
    setQty((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  const dec = (id: string) =>
    setQty((prev) => {
      const next = Math.max(0, (prev[id] ?? 0) - 1);
      return { ...prev, [id]: next };
    });

  const totalCents = (data?.products ?? []).reduce((sum, p) => {
    const n = qty[p.id] ?? 0;
    return sum + n * p.priceCents;
  }, 0);

  const productLines = Object.entries(qty)
    .filter(([, n]) => n > 0)
    .map(([productId, quantity]) => ({ productId, quantity }));

  const submit = async () => {
    if (productLines.length === 0) {
      setError('Añade al menos un producto.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/pos/sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productLines,
          serviceLines: [],
          paymentMethod: method,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.error || 'No se pudo registrar la venta.';
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success('Venta registrada');
      onSold();
      onClose();
    } catch {
      const msg = 'Error de conexión.';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Nueva venta de producto"
      scrim="always"
    >
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-ink-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando productos…
            </div>
          )}
          {!isLoading && (data?.products?.length ?? 0) === 0 && (
            <div className="rounded-control border border-line bg-overlay/40 p-4 text-center text-sm text-ink-3">
              No hay productos activos. Pídele al jefe que añada el catálogo
              en /dashboard/ventas/productos.
            </div>
          )}
          {(data?.products ?? []).map((p) => {
            const n = qty[p.id] ?? 0;
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-control border border-line bg-surface p-3"
              >
                <ShoppingBag className="h-4 w-4 shrink-0 text-ink-3" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {p.name}
                  </p>
                  <p className="text-xs text-ink-3">
                    {formatEuros(p.priceCents)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => dec(p.id)}
                    disabled={n === 0}
                    className="h-9 w-9 rounded-full border border-line bg-surface text-base font-bold text-ink-2 disabled:opacity-40"
                    aria-label={`Restar ${p.name}`}
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums text-ink">
                    {n}
                  </span>
                  <button
                    type="button"
                    onClick={() => inc(p.id)}
                    className="h-9 w-9 rounded-full bg-brand text-base font-bold text-brand-ink"
                    aria-label={`Sumar ${p.name}`}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}

          {productLines.length > 0 && (
            <div className="rounded-control border border-line bg-overlay/40 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                Total
              </p>
              <p className="mt-1 text-2xl font-bold text-ink">
                {formatEuros(totalCents)}
              </p>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
              Método de cobro
            </p>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMethod(m.key)}
                  className={`rounded-control border py-3 text-xs font-semibold transition-colors ${
                    method === m.key
                      ? 'border-brand bg-brand-softer text-brand'
                      : 'border-line bg-surface text-ink-2'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
        </div>

        <div
          className="border-t border-line bg-surface p-4"
          style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={submit}
            disabled={busy || productLines.length === 0}
            className="w-full rounded-control bg-brand py-3 text-sm font-semibold text-brand-ink shadow-sm transition-colors disabled:opacity-50"
          >
            {busy ? 'Registrando…' : `Cobrar ${formatEuros(totalCents)}`}
          </button>
        </div>
      </div>
    </SlideOver>
  );
}
