'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Service {
  name: string;
  duration: number;
  price: number;
}

interface Barber {
  name: string;
}

interface Props {
  isOpen: boolean;
  initialDate: string;
  initialTime: string;
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
  services,
  barbers,
  onClose,
  onCreated,
}: Props) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [service, setService] = useState(services[0]?.name || '');
  const [barber, setBarber] = useState('');
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [duration, setDuration] = useState(services[0]?.duration || 30);
  const [price, setPrice] = useState<string>(String(services[0]?.price || ''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync initial values when panel opens
  useEffect(() => {
    if (isOpen) {
      setDate(initialDate);
      setTime(initialTime);
      setError(null);
    }
  }, [isOpen, initialDate, initialTime]);

  // Auto-fill duration & price when service changes
  const handleServiceChange = (name: string) => {
    setService(name);
    const svc = services.find(s => s.name === name);
    if (svc) {
      setDuration(svc.duration);
      setPrice(String(svc.price));
    }
  };

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
          duration,
          price: price ? Number(price) : undefined,
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
      setError(null);
    } catch {
      setError('Error de red. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop for mobile */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          />

          <motion.div
            key="panel"
            initial={{ x: 320 }}
            animate={{ x: 0 }}
            exit={{ x: 320 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 z-50 h-full w-80 bg-surface border-l border-line flex flex-col shadow-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <span className="text-sm font-semibold text-ink">Nueva Reserva</span>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-overlay text-ink-3 hover:text-ink-2 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Customer name */}
              <div>
                <label className={LABEL_CLASS}>Nombre del cliente</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Nombre (opcional)"
                  className={INPUT_CLASS}
                />
              </div>

              {/* Customer phone */}
              <div>
                <label className={LABEL_CLASS}>Teléfono *</label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="+34 612 345 678"
                  className={INPUT_CLASS}
                />
              </div>

              {/* Service */}
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

              {/* Duration */}
              <div>
                <label className={LABEL_CLASS}>Duración (min)</label>
                <input
                  type="number"
                  min={5}
                  max={480}
                  value={duration}
                  onChange={e => setDuration(Number(e.target.value))}
                  className={INPUT_CLASS}
                />
              </div>

              {/* Price */}
              <div>
                <label className={LABEL_CLASS}>Precio (€)</label>
                <input
                  type="number"
                  min={0}
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="0"
                  className={INPUT_CLASS}
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
                {loading ? 'Creando...' : 'Crear Reserva'}
              </button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
