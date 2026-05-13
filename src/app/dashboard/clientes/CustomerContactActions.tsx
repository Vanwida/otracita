'use client'

import { MessageCircle } from 'lucide-react'

// -----------------------------------------------------------------------------
// Acciones rápidas de contacto desde la fila del cliente: WhatsApp + llamar.
//
// El barbero no tiene que entrar a la ficha para mandar mensaje o llamar —
// se hace desde la lista. Es la acción más común tras "buscar a Carlos".
//
// `tel:` ya está implícito en la celda del teléfono (link directo).
// Este componente añade WhatsApp via wa.me — necesita teléfono normalizado
// a solo dígitos (sin espacios, sin +).
// -----------------------------------------------------------------------------

interface Props {
  phone: string
  name: string | null
}

/** Limpia teléfono a solo dígitos para wa.me. Acepta +34 600 123 456 o 600123456. */
function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '')
}

export default function CustomerContactActions({ phone, name }: Props) {
  const digits = digitsOnly(phone)
  if (digits.length === 0) return null
  const greeting = name ? `Hola ${name.split(' ')[0]}!` : 'Hola!'
  const waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(greeting)}`
  return (
    <a
      href={waUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-success hover:bg-success/10 transition-colors"
      aria-label={`WhatsApp a ${name ?? phone}`}
      title="Abrir WhatsApp"
    >
      <MessageCircle className="h-4 w-4" />
    </a>
  )
}
