'use client';

import { Loader2, Plus } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import SlideOver from '../_components/SlideOver';
import CustomerTypeahead from '../_components/CustomerTypeahead';
import ServiceLinePicker, { type ServiceLineValue } from '../_components/ServiceLinePicker';
import { useConfirm } from '../_components/ConfirmDialog';
import BarberAvatar from '../_components/BarberAvatar';
import { computeBookingSnapshot } from '@/lib/bookings/duration';
import { eurosToCents } from '@/lib/format';

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

function addMinutesToTime(timeStr: string, mins: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

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
  const confirm = useConfirm();
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  // Cliente conocido adjuntado vía typeahead (mismo patrón que el TPV).
  // Si está enlazado, la reserva entra en SU ficha (historial / fidelidad
  // / no-show) en vez de crear un cliente huérfano. null = walk-in.
  const [linkedPhone, setLinkedPhone] = useState<string | null>(null);
  // Reputation del cliente enlazado — para avisar si está bloqueado. Solo es
  // un aviso: el barbero SÍ puede agendarlo a mano (source 'dashboard' exento).
  const [linkedReputation, setLinkedReputation] = useState<string | null>(null);
  const [service, setService] = useState(services[0]?.name || '');
  const [barber, setBarber] = useState('');
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [duration, setDuration] = useState<number | null>(services[0]?.duration ?? 30);
  const [price, setPrice] = useState<number | null>(services[0]?.price ?? null);
  // Servicios EXTRA (R7). El principal vive en `service`/`duration`/`price`;
  // estos se mandan como `extraServices` y se guardan en booking_services.
  const [extraServices, setExtraServices] = useState<ServiceLineValue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync initial values when panel opens. Si vino un initialBarberId
  // (columna clicada en agenda), preseleccionamos ese barbero por nombre;
  // si no, "Sin preferencia".
  //
  // RESET CANÓNICO (state-leak guard): el componente NO se desmonta entre
  // aperturas (vive siempre montado bajo CalendarView, controlado por
  // `isOpen`), así que cualquier campo no reseteado aquí arrastraría el
  // valor de la reserva anterior. Reseteamos TODO lo que el usuario puede
  // tocar — cliente, servicio principal, extras, error. Mismo patrón que
  // NewLooseTipSlideOver / NewProductSaleSlideOver / AddProductSaleModal.
  useEffect(() => {
    if (isOpen) {
      setDate(initialDate);
      setTime(initialTime);
      const preset = initialBarberId
        ? barbers.find((b) => b.id === initialBarberId)?.name ?? ''
        : '';
      setBarber(preset);
      setError(null);
      // Cliente — nueva apertura = empezar limpio (no arrastrar cliente
      // enlazado de una reserva anterior).
      setCustomerName('');
      setCustomerPhone('');
      setLinkedPhone(null);
      // Servicio principal + extras — defaults del catálogo. Sin esto, el
      // form aparecía pre-rellenado con el servicio/precio de la reserva
      // anterior (bug #66, state leak entre aperturas).
      setService(services[0]?.name || '');
      setDuration(services[0]?.duration ?? 30);
      setPrice(services[0]?.price ?? null);
      setExtraServices([]);
    }
  }, [isOpen, initialDate, initialTime, initialBarberId, barbers, services]);

  // El autorrelleno duración/precio al elegir servicio vive ahora en
  // <ServiceLinePicker> (fuente única, FIX C).

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

  const updateExtraService = (idx: number, patch: Partial<ServiceLineValue>) => {
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

    const doPost = (allowOverlap: boolean, allowOutOfHours: boolean) =>
      fetch('/api/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim(),
          service,
          barber: barber || undefined,
          date,
          time,
          duration: duration ?? undefined,
          // El formulario habla EUROS; la API y la DB, CÉNTIMOS.
          priceCents: eurosToCents(price) ?? undefined,
          extraServices:
            extraServices.length > 0
              ? extraServices.map((e) => ({
                  name: e.name,
                  durationMin: e.durationMin,
                  priceCents: eurosToCents(e.priceEuros),
                }))
              : undefined,
          ...(allowOverlap ? { allowOverlap: true } : {}),
          ...(allowOutOfHours ? { allowOutOfHours: true } : {}),
        }),
      });

    try {
      let res = await doPost(false, false);

      // 409 = solape. Preguntamos antes de rechazar (Booksy/GCal-style).
      if (res.status === 409) {
        const ok = await confirm({
          title: 'Esta cita se solapa con otra',
          message: 'Ya hay una reserva en ese hueco. ¿La creas igualmente?',
          confirmLabel: 'Crear igual',
          cancelLabel: 'Cancelar',
        });
        if (ok) {
          res = await doPost(true, false);
        } else {
          setLoading(false);
          return;
        }
      }

      // 422 con errorCode no_barber_available = fuera de horario laboral.
      if (res.status === 422) {
        const data = await res.json().catch(() => ({}));
        if (data.errorCode === 'no_barber_available') {
          const ok = await confirm({
            title: 'Fuera del horario habitual',
            message: 'Esta cita está fuera del horario de trabajo. ¿La creas igualmente?',
            confirmLabel: 'Crear igual',
            cancelLabel: 'Cancelar',
          });
          if (ok) {
            res = await doPost(false, true);
          } else {
            setLoading(false);
            return;
          }
        } else {
          const msg = data.error || 'Horario no disponible.';
          setError(msg);
          toast.error(msg);
          setLoading(false);
          return;
        }
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data.error || 'Error al crear la reserva.';
        setError(msg);
        toast.error(msg);
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
      toast.success('Reserva creada');
    } catch {
      const msg = 'Error de red. Inténtalo de nuevo.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SlideOver open={isOpen} onClose={onClose} title="Nueva cita">
            {/* Form — chasis flex-col: el CONTENIDO scrollea y el CTA queda
                anclado al fondo (footer sticky). En móvil el form es largo y
                antes el barbero tenía que bajar hasta el final para confirmar
                (task #109). Ahora "Crear cita" está siempre visible. */}
            <form onSubmit={handleSubmit} className="flex flex-1 flex-col min-h-0">
              {/* Área scrolleable — todo el formulario menos el footer. El
                  `pb-4` separa el último campo del borde del footer; el footer
                  sólido lo tapa al hacer scroll hasta abajo sin solaparse. */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
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
                    setLinkedReputation(c.reputation ?? 'good');
                  }}
                  onUnlink={() => {
                    setLinkedPhone(null);
                    setLinkedReputation(null);
                  }}
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

              {/* Servicio principal — picker compartido (catálogo →
                  autorrellena duración/precio, ambos editables). Misma
                  pieza que el editor de BookingDetailPanel (FIX C, DRY). */}
              <ServiceLinePicker
                services={services}
                value={{
                  name: service,
                  durationMin: duration ?? 0,
                  priceEuros: price,
                }}
                onChange={(v) => {
                  setService(v.name);
                  setDuration(v.durationMin || null);
                  setPrice(v.priceEuros);
                }}
                label="Servicio"
                required
                ariaSuffix="servicio principal"
              />

              {/* Servicios extra (R7) — varias prestaciones en una cita.
                  Se suman a la duración total y cada uno emite su línea. */}
              <div className="space-y-2">
                {extraServices.map((extra, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-line bg-overlay/40 p-3"
                  >
                    <ServiceLinePicker
                      services={services}
                      value={extra}
                      onChange={(v) => updateExtraService(idx, v)}
                      onRemove={() => removeExtraService(idx)}
                      label={`Servicio extra ${idx + 1}`}
                      ariaSuffix={`servicio extra ${idx + 1}`}
                    />
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
                {extraServices.length > 0 && (
                  <p className="text-[11px] text-ink-2">
                    Duración total:{' '}
                    <span className="font-semibold text-ink tabular-nums">
                      {totalDuration} min
                    </span>
                  </p>
                )}
              </div>

              {/* Barber */}
              {barbers.length > 0 && (
                <div>
                  <label className={LABEL_CLASS}>Barbero</label>
                  <div className="flex flex-wrap gap-2">
                    {/* Sin preferencia */}
                    <label
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors text-sm ${
                        barber === ''
                          ? 'border-brand bg-[var(--color-brand-softer)] text-ink font-medium'
                          : 'border-line bg-canvas text-ink-2 hover:bg-surface'
                      }`}
                    >
                      <input
                        type="radio"
                        name="barber"
                        value=""
                        checked={barber === ''}
                        onChange={() => setBarber('')}
                        className="sr-only"
                      />
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface border border-line text-[11px] font-bold text-ink-2 shrink-0">
                        ?
                      </span>
                      Sin preferencia
                    </label>

                    {barbers.map(b => (
                      <label
                        key={b.id}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors text-sm ${
                          barber === b.name
                            ? 'border-brand bg-[var(--color-brand-softer)] text-ink font-medium'
                            : 'border-line bg-canvas text-ink-2 hover:bg-surface'
                        }`}
                      >
                        <input
                          type="radio"
                          name="barber"
                          value={b.name}
                          checked={barber === b.name}
                          onChange={() => setBarber(b.name)}
                          className="sr-only"
                        />
                        <BarberAvatar
                          url={b.photoUrl}
                          name={b.name}
                          className="h-7 w-7 rounded-full overflow-hidden bg-surface border border-line shrink-0"
                          fallbackClassName="text-[11px] font-bold text-ink-2"
                        />
                        {b.name}
                      </label>
                    ))}
                  </div>
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

              {/* Hora inicio / fin */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLASS}>Hora inicio *</label>
                  <input
                    type="time"
                    required
                    value={time}
                    onChange={e => setTime(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Hora fin</label>
                  <input
                    type="time"
                    value={time ? addMinutesToTime(time, totalDuration) : ''}
                    onChange={e => {
                      if (!time || !e.target.value) return;
                      const [sh, sm] = time.split(':').map(Number);
                      const [eh, em] = e.target.value.split(':').map(Number);
                      const diff = (eh * 60 + em) - (sh * 60 + sm);
                      if (diff <= 0) return;
                      const extrasDuration = totalDuration - (duration ?? 0);
                      const newMain = Math.max(1, diff - extrasDuration);
                      setDuration(newMain);
                    }}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>

              {/* Duración/Precio del principal ya viven en el
                  ServiceLinePicker de arriba (FIX C) — sin campos sueltos
                  duplicados. */}
              </div>

              {/* Footer sticky — CTA siempre visible mientras se rellena el
                  form (task #109). Fondo sólido + borde/sombra superior para
                  separarlo del contenido que scrollea por detrás. Safe-area
                  iOS para no quedar bajo la barra del sistema en PWA. El error
                  vive aquí, junto al CTA, para que se vea al intentar enviar
                  sin tener que volver a scrollear. */}
              <div
                className="shrink-0 border-t border-line bg-surface px-5 py-4 space-y-3 shadow-[0_-4px_12px_-6px_var(--color-scrim-light)]"
                style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
              >
                {error && (
                  <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}
                {/* Cliente bloqueado: solo un aviso. El barbero puede agendarlo
                    igualmente a mano (el bloqueo solo frena la auto-reserva). */}
                {linkedReputation === 'blocked' && (
                  <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">
                    Este cliente está bloqueado. No puede reservar solo (bot/web),
                    pero puedes agendarlo tú a mano.
                  </p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[48px] flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-brand hover:bg-brand-strong disabled:opacity-50 disabled:cursor-not-allowed text-brand-ink text-sm font-semibold transition-colors"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {loading ? 'Creando...' : 'Crear cita'}
                </button>
              </div>
            </form>
    </SlideOver>
  );
}
