'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { CalendarEvent } from './types';

interface Props {
  booking: CalendarEvent | null;
  onClose: () => void;
}

export default function BookingDetailPanel({ booking, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  const copyPhone = () => {
    if (!booking) return;
    navigator.clipboard.writeText(booking.customerPhone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });
    } catch {
      return dateStr;
    }
  };

  const sourceLabel = (source: string) =>
    source === 'booksy' ? 'Booksy' : 'WhatsApp Bot';

  const sourceBadgeClass = (source: string) =>
    source === 'booksy'
      ? 'bg-success/15 text-success'
      : 'bg-brand-softer text-brand';

  const statusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-overlay text-ink-2';
      case 'no_show':
        return 'bg-warning/15 text-warning';
      case 'completed':
        return 'bg-success/15 text-success';
      default:
        return 'bg-overlay text-ink-2';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'Confirmada';
      case 'no_show':
        return 'No Show';
      case 'completed':
        return 'Completada';
      case 'cancelled':
        return 'Cancelada';
      default:
        return status;
    }
  };

  return (
    <AnimatePresence>
      {booking && (
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
              <span className="text-sm font-semibold text-ink">Detalle de Reserva</span>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-overlay text-ink-3 hover:text-ink-2 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Booksy read-only notice */}
              {booking.source === 'booksy' && (
                <div className="bg-canvas border border-line rounded-lg px-3 py-2 text-xs text-ink-2">
                  Esta reserva viene de Booksy (solo lectura)
                </div>
              )}

              {/* Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider ${sourceBadgeClass(booking.source)}`}
                >
                  {sourceLabel(booking.source)}
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider ${statusBadge(booking.status)}`}
                >
                  {statusLabel(booking.status)}
                </span>
              </div>

              {/* Customer */}
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-widest text-ink-2">
                  Cliente
                </p>
                {booking.customerName && (
                  <p className="text-sm font-medium text-ink">{booking.customerName}</p>
                )}
                <div className="flex items-center gap-2">
                  <p className="text-sm text-ink-2">{booking.customerPhone}</p>
                  <button
                    onClick={copyPhone}
                    className="p-1 rounded hover:bg-overlay text-ink-3 hover:text-ink-2 transition-colors"
                    title="Copiar teléfono"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-line" />

              {/* Service */}
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-widest text-ink-2">
                  Servicio
                </p>
                <p className="text-sm font-medium text-ink">{booking.service}</p>
              </div>

              {/* Barber */}
              {booking.barber && (
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-ink-2">
                    Barbero
                  </p>
                  <p className="text-sm font-medium text-ink-2">{booking.barber}</p>
                </div>
              )}

              {/* Divider */}
              <div className="border-t border-line" />

              {/* Date */}
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-widest text-ink-2">
                  Fecha
                </p>
                <p className="text-sm text-ink-2 capitalize">{formatDate(booking.date)}</p>
              </div>

              {/* Time */}
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-widest text-ink-2">
                  Hora
                </p>
                <p className="text-sm text-ink-2">
                  {booking.time}
                  <span className="text-ink-3 mx-1.5">·</span>
                  {booking.duration} min
                </p>
              </div>

              {/* Price */}
              {booking.price !== null && (
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-ink-2">
                    Precio
                  </p>
                  <p className="text-sm font-semibold text-brand">{booking.price} €</p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
