'use client';

import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import SlideOver from '../_components/SlideOver';
import CustomerTypeahead from '../_components/CustomerTypeahead';
import NumberInput from '../_components/NumberInput';
import { computeBookingSnapshot, type BookingServiceLine } from '@/lib/bookings/duration';

import type { Barber } from './types';

interface Service {
  name: string;
  duration: number;
  price: number;
}

interface Props {
  isOpen: boolean;
  initialDate: string;
  initialTime: string;
  /** Barbero de la columna clicada en agenda — preselecciona el <select>.
   *  Null/undefined → "Sin preferencia". */
  initialBarberId?: string | null;
  services: Service[];
  barbers: Barber[];
  onClose: () => void;
  onCreated: () => void;
}

const INPUT_CLASS =
  'w-full px-3 py-2 text-sm rounded-lg bg-surface border border-line text-ink placeholder-ink-3 focus:outline-none focus:border-brand transition-colors';

const LABEL_CLASS = 'block text-[11px] font-bold uppercase tracking-widest text-ink-2 mb-1.5';

export default function NewBookingPanel({
  isOpen,
  initialDate,
  initialTime,
  initialBarberId,
  services,
  barbers,
  onClose,
  onCreated,
}: Props) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  // Cliente conocido adjuntado vía typeahead (mismo patrón que el TPV).
  // Si está enlazado, la reserva entra en SU ficha (historial / fidelidad
  // / no-show) en vez de crear un cliente huérfano. null = walk-in.
  const [linkedPhone, setLinkedPhone] = useState<string | null>(null);
  const [service, setService] = useState(services[0]?.name || '');
  const [barber, setBarber] = useState('');
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [duration, setDuration] = useState<number | null>(services[0]?.duration ?? 30);
  const [price, setPrice] = useState<number | null>(services[0]?.price ?? null);
  // Servicios EXTRA (R7). El principal vive en `service`/`duration`/`price`;
  // estos se mandan como `extraServices` y se guardan en booking_services.
  const [extraServices, setExtraServices] = useState<BookingServiceLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync initial values when panel opens. Si vino un initialBarberId
  // (columna clicada en agenda), preseleccionamos ese barbero por nombre;
  // si no, "Sin preferencia".
  useEffect(() => {
    if (isOpen) {
      setDate(initialDate);
      setTime(initialTime);
      const preset = initialBarberId
        ? barbers.find((b) => b.id === initialBarberId)?.name ?? ''
        : '';
      setBarber(preset);
      setError(null);
      // Nueva apertura = empezar limpio: sin cliente enlazado arrastrado
      // de una reserva anterior.
      setCustomerName('');
      setCustomerPhone('');
      setLinkedPhone(null);
    }
  }, [isOpen, initialDate, initialTime, initialBarberId, barbers]);

  // Auto-fill duration & price when service changes
  const handleServiceChange = (name: string) => {
    setService(name);
    const svc = services.find(s => s.name === name);
    if (svc) {
      setDuration(svc.duration);
      setPrice(svc.price);
    }
  };

  // ── Servicios extra (R7) ────────────────────────────────────────────────
  const addExtraService = () => {
    const fallback = services.find(s => s.name !== service) ?? services[0];
    setExtraServices(prev => [
      ...prev,
      {
        name: fallback?.name ?? '',
        durationMin: fallback?.duration ?? 30,
        priceEuros: fallback?.price ?? null,
      },
    ]);
  };

  const updateExtraService = (idx: number, patch: Partial<BookingServiceLine>) => {
    setExtraServices(prev =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );
  };

  const removeExtraService = (idx: number) => {
    setExtraServices(prev => prev.filter((_, i) => i !== idx));
  };

  // Duración total = principal + extras (alimenta el snapshot bookings.duration
  // server-side; aquí solo para mostrar el total al barbero).
  const totalDuration = computeBookingSnapshot(
    duration ?? 0,
    extraServices,
  ).durationMin;

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim(),
          service,
          barber: barber || undefined,
          date,
          time,
          // Duración del servicio PRINCIPAL. El backend suma los extras al
          // snapshot bookings.duration vía computeBookingSnapshot.
          duration: duration ?? undefined,
          price: price ?? undefined,
          extraServices: extraServices.length > 0 ? extraServices : undefined,
        }),
      });

      if (res.status === 409) {
        setError('Ya hay una reserva en ese horario.');
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Error al crear la reserva.');
        setLoading(false);
        return;
      }

      onCreated();
      onClose();
      // Reset form
      setCustomerName('');
      setCustomerPhone('');
      setLinkedPhone(null);
      setExtraServices([]);
      setError(null);
    } catch {
      setError('Error de red. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SlideOver open={isOpen} onClose={onClose} title="Nueva cita">
            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Cliente — typeahead compartido con el TPV. Si se adjunta
                  un cliente conocido, fijamos su teléfono y la reserva
                  enlaza con su ficha (historial / fidelidad / no-show). Si
                  es walk-in, el teléfono se escribe a mano abajo. */}
              <div>
                <label className={LABEL_CLASS}>Cliente</label>
                <CustomerTypeahead
                  name={customerName}
                  onNameChange={setCustomerName}
                  linkedPhone={linkedPhone}
                  onLink={c => {
                    setCustomerName(c.name || c.phone);
                    setCustomerPhone(c.phone);
                    setLinkedPhone(c.phone);
                  }}
                  onUnlink={() => setLinkedPhone(null)}
                  placeholder="Nombre o teléfono del cliente"
                  ariaLabel="Buscar cliente conocido o escribir uno nuevo"
                />
              </div>

              {/* Teléfono — prefijado y bloqueado cuando hay cliente
                  enlazado (es el de su ficha); editable para walk-ins. */}
              <div>
                <label className={LABEL_CLASS}>Teléfono *</label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  readOnly={linkedPhone !== null}
                  placeholder="+34 612 345 678"
                  className={`${INPUT_CLASS}${linkedPhone !== null ? ' opacity-70 cursor-not-allowed' : ''}`}
                />
                {linkedPhone !== null && (
                  <p className="mt-1 text-[11px] text-ink-2">
                    Teléfono del cliente enlazado. Quita el cliente para
                    editarlo.
                  </p>
                )}
              </div>

              {/* Service (principal) */}
              {services.length > 0 && (
                <div>
                  <label className={LABEL_CLASS}>Servicio *</label>
                  <select
                    required
                    value={service}
                    onChange={e => handleServiceChange(e.target.value)}
                    className={INPUT_CLASS}
                  >
                    {services.map(s => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Servicios extra (R7) — varios servicios en una misma cita.
                  El principal queda arriba; estos se suman a la duración y
                  cada uno emite su propia línea en la factura. */}
              {services.length > 0 && (
                <div className="space-y-2">
                  {extraServices.map((extra, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-line bg-overlay/40 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold uppercase tracking-widest text-ink-2">
                          Servicio extra {idx + 1}
                        </label>
                        <button
                          type="button"
                          onClick={() => removeExtraService(idx)}
                          aria-label={`Quitar servicio extra ${idx + 1}`}
                          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-ink-3 hover:text-danger hover:bg-danger/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                      <select
                        value={extra.name}
                        onChange={e => {
                          const svc = services.find(s => s.name === e.target.value);
                          updateExtraService(idx, {
                            name: e.target.value,
                            durationMin: svc?.duration ?? extra.durationMin,
                            priceEuros: svc?.price ?? extra.priceEuros,
                          });
                        }}
                        className={INPUT_CLASS}
                      >
                        {services.map(s => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] text-ink-2 mb-1 block">
                            Duración (min)
                          </label>
                          <NumberInput
                            value={extra.durationMin}
                            onValueChange={n =>
                              updateExtraService(idx, { durationMin: n ?? 0 })
                            }
                            min={0}
                            max={480}
                            decimals={0}
                            className={INPUT_CLASS}
                            aria-label={`Duración servicio extra ${idx + 1}`}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-ink-2 mb-1 block">
                            Precio (€)
                          </label>
                          <NumberInput
                            value={extra.priceEuros}
                            onValueChange={n =>
                              updateExtraService(idx, { priceEuros: n })
                            }
                            min={0}
                            decimals={2}
                            step="0.01"
                            placeholder="0"
                            className={INPUT_CLASS}
                            aria-label={`Precio servicio extra ${idx + 1}`}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addExtraService}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-line hover:border-brand hover:text-brand px-3 py-2 text-xs font-semibold text-ink-2 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Añadir otro servicio
                  </button>
                </div>
              )}

              {/* Barber */}
              {barbers.length > 0 && (
                <div>
                  <label className={LABEL_CLASS}>Barbero</label>
                  <select
                    value={barber}
                    onChange={e => setBarber(e.target.value)}
                    className={INPUT_CLASS}
                  >
                    <option value="">Sin preferencia</option>
                    {barbers.map(b => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Date */}
              <div>
                <label className={LABEL_CLASS}>Fecha *</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              {/* Time */}
              <div>
                <label className={LABEL_CLASS}>Hora *</label>
                <input
                  type="time"
                  required
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              {/* Duration (servicio principal) */}
              <div>
                <label className={LABEL_CLASS}>Duración (min)</label>
                <NumberInput
                  value={duration}
                  onValueChange={setDuration}
                  min={5}
                  max={480}
                  decimals={0}
                  className={INPUT_CLASS}
                  aria-label="Duración del servicio principal en minutos"
                />
                {extraServices.length > 0 && (
                  <p className="mt-1 text-[11px] text-ink-2">
                    Total con extras:{' '}
                    <span className="font-semibold text-ink tabular-nums">
                      {totalDuration} min
                    </span>
                  </p>
                )}
              </div>

              {/* Price (servicio principal) */}
              <div>
                <label className={LABEL_CLASS}>Precio (€)</label>
                <NumberInput
                  value={price}
                  onValueChange={setPrice}
                  min={0}
                  decimals={2}
                  step="0.01"
                  placeholder="0"
                  className={INPUT_CLASS}
                  aria-label="Precio del servicio principal en euros"
                />
              </div>

              {/* Error */}
              {error && (
                <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand hover:bg-brand-strong disabled:opacity-50 disabled:cursor-not-allowed text-brand-ink text-sm font-semibold transition-colors"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? 'Creando...' : 'Crear cita'}
              </button>
            </form>
    </SlideOver>
  );
}
