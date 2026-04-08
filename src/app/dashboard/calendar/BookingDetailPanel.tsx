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
      ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';

  const statusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-neutral-700/40 text-neutral-300 border border-neutral-600/30';
      case 'no_show':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'completed':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      default:
        return 'bg-neutral-700/40 text-neutral-300 border border-neutral-600/30';
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
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          />

          <motion.div
            key="panel"
            initial={{ x: 320 }}
            animate={{ x: 0 }}
            exit={{ x: 320 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed right-0 top-0 z-50 h-full w-80 bg-[#0f0f0f] border-l border-[#1f1f1f] flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f1f1f]">
              <span className="text-sm font-semibold text-white">Detalle de Reserva</span>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-[#1a1a1a] text-neutral-500 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
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
                <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-600">
                  Cliente
                </p>
                {booking.customerName && (
                  <p className="text-sm font-medium text-white">{booking.customerName}</p>
                )}
                <div className="flex items-center gap-2">
                  <p className="text-sm text-neutral-400">{booking.customerPhone}</p>
                  <button
                    onClick={copyPhone}
                    className="p-1 rounded hover:bg-[#1a1a1a] text-neutral-600 hover:text-neutral-300 transition-colors"
                    title="Copiar teléfono"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-[#1f1f1f]" />

              {/* Service */}
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-600">
                  Servicio
                </p>
                <p className="text-sm font-medium text-white">{booking.service}</p>
              </div>

              {/* Barber */}
              {booking.barber && (
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-600">
                    Barbero
                  </p>
                  <p className="text-sm font-medium text-white">{booking.barber}</p>
                </div>
              )}

              {/* Divider */}
              <div className="border-t border-[#1f1f1f]" />

              {/* Date */}
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-600">
                  Fecha
                </p>
                <p className="text-sm text-neutral-300 capitalize">{formatDate(booking.date)}</p>
              </div>

              {/* Time */}
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-600">
                  Hora
                </p>
                <p className="text-sm text-neutral-300">
                  {booking.time}
                  <span className="text-neutral-600 mx-1.5">·</span>
                  {booking.duration} min
                </p>
              </div>

              {/* Price */}
              {booking.price !== null && (
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-600">
                    Precio
                  </p>
                  <p className="text-sm font-semibold text-emerald-400">{booking.price} €</p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
