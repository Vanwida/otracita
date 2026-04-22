// -----------------------------------------------------------------------------
// Help content — single source of truth.
// Used by:
//   · /dashboard/ayuda (renders the sections visually, parses [text](url)
//     markdown links into <Link>)
//   · /api/dashboard-chat (concatenates all Q/A into the Grok system prompt
//     so the support chat widget can answer from the exact same material)
//
// Add new FAQs here and both surfaces update simultaneously. Keep answers
// tight (1-3 sentences) and avoid technical jargon — the audience is a
// Spanish barber, not a developer.
// -----------------------------------------------------------------------------

export interface HelpFaq {
  q: string
  a: string // plain text, may include [label](/path) markdown links
}

export interface HelpSection {
  title: string
  items: HelpFaq[]
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    title: 'Empezar con otracita',
    items: [
      {
        q: '¿Cuánto tarda en estar activo el bot?',
        a: 'Menos de 48 horas desde que completas [Mi negocio](/dashboard/negocio). Nuestro equipo conecta el WhatsApp y hace el primer test contigo. Tú solo tienes que dar los datos del negocio.',
      },
      {
        q: '¿Tengo que dejar mi app de reservas actual?',
        a: 'No. Puedes seguir con la que tengas — el bot se sincroniza con ella por email. O puedes pasarte entero a otracita y dejar la otra: agenda, facturación y cobros lo cubren todo.',
      },
      {
        q: '¿Necesito saber de tecnología?',
        a: 'Cero. La configuración inicial la hacemos nosotros. Después solo tocas el panel si quieres cambiar servicios, horarios, precios o equipo.',
      },
      {
        q: '¿Puedo probar antes de pagar?',
        a: 'Escríbenos por WhatsApp al +34 644 288 663 y te hacemos demo en directo. También puedes reservar 15 días de prueba — si no ahorras tiempo, no pagas.',
      },
    ],
  },

  {
    title: 'Agenda y reservas',
    items: [
      {
        q: '¿Dónde veo las reservas?',
        a: 'En [Agenda](/dashboard/agenda). Vista día/semana/mes, filtro por barbero. Se refresca sola cada 10 segundos, cuando el bot mete una reserva aparece sin que recargues.',
      },
      {
        q: '¿Cómo sabe el bot qué huecos ofrecer?',
        a: 'Mira el horario + días bloqueados de cada barbero y cruza con las reservas existentes. Si un barbero tiene horario propio (en Mi negocio → Equipo), usa ese; si no, hereda el del shop.',
      },
      {
        q: '¿Qué pasa si un cliente elige "sin preferencia" de barbero?',
        a: 'El bot asigna al último barbero que atendió a ese cliente (si está libre). Si es cliente nuevo, al primer barbero libre por orden de tu lista de Equipo. Nunca guarda reservas sin barbero asignado.',
      },
      {
        q: '¿Puede reservar un cliente para dentro de 5 minutos?',
        a: 'No por defecto. Hay un margen mínimo de 15 minutos entre ahora y la hora de la cita — para que te dé tiempo a verla. Configurable por barbería.',
      },
      {
        q: '¿Hasta cuándo pueden reservar en el futuro?',
        a: '45 días por defecto. Si alguien pide 3 meses el bot dice que no hay disponibilidad. Previene citas fantasma y acapara huecos innecesariamente.',
      },
      {
        q: '¿Cómo creo yo manualmente una reserva?',
        a: 'En [Agenda](/dashboard/agenda) clica en un hueco libre o pulsa "Nueva reserva" arriba a la derecha. Útil para walk-ins o reservas por teléfono.',
      },
      {
        q: '¿Cómo marco que un cliente no vino?',
        a: 'Abre la reserva en la agenda y pulsa "Marcar no-show". Si tenía factura se anula automáticamente. El contador de no-shows del cliente sube en 1.',
      },
      {
        q: 'Me olvidé marcar un no-show de ayer. ¿Lo puedo hacer ahora?',
        a: 'Sí. Las reservas pasadas siguen editables. Entra en la reserva de ayer desde el calendario y márcala. No hay límite de tiempo.',
      },
      {
        q: 'Un cliente me canceló por WhatsApp. ¿Se actualiza?',
        a: 'Sí, automáticamente. El bot le permite cancelar desde el mismo chat, la reserva pasa a "cancelada", se anula la factura si había, y el hueco queda libre para otro cliente.',
      },
      {
        q: '¿El bot avisa al cliente el día antes?',
        a: 'Sí. Envía recordatorio WhatsApp a las 10:00 del día anterior con botones "Confirmo" / "Cancelar". Menos no-shows sin esfuerzo.',
      },
      {
        q: '¿Hay lista de espera?',
        a: 'Sí. Si el cliente pide un día lleno, el bot le ofrece unirse a la lista. Cuando se libera un hueco, le avisa automáticamente al primero en espera.',
      },
    ],
  },

  {
    title: 'Equipo y horarios',
    items: [
      {
        q: '¿Cada barbero puede tener su propio horario?',
        a: 'Sí. En [Mi negocio → Equipo](/dashboard/negocio?tab=team), abre la ficha del barbero y activa "Horario personalizado". Ej: Juan L-V 10-20, Reni M-S 12-20. Si no activas nada, todos heredan el horario del negocio.',
      },
      {
        q: '¿Y vacaciones o días libres de un barbero concreto?',
        a: 'En la misma ficha, abajo, "Días bloqueados personales". Añade fechas y el bot deja de ofrecer citas con ese barbero esos días.',
      },
      {
        q: '¿Y si toda la barbería cierra un día?',
        a: 'Esos son días bloqueados del shop. En [Mi negocio → Días bloqueados](/dashboard/negocio?tab=blocked). Aplican a todo el equipo.',
      },
      {
        q: '¿Cómo reordeno los barberos en la agenda?',
        a: 'En [Mi negocio → Equipo](/dashboard/negocio?tab=team), usa las flechas ↑↓ en cada ficha. El orden aparece igual en la agenda y en las opciones que ofrece el bot.',
      },
      {
        q: '¿Puedo eliminar a un barbero?',
        a: 'Sí, con el botón de papelera en su ficha. Si tiene reservas futuras confirmadas te lo bloqueará — tienes que reasignar esas citas primero. Las reservas pasadas se conservan para el histórico.',
      },
      {
        q: 'Añadí un barbero nuevo, ¿el bot ya lo ofrece?',
        a: 'Al instante. En cuanto guardes, el bot lo tiene en cuenta en las próximas reservas.',
      },
      {
        q: 'Cambié el nombre de un barbero, ¿se actualizan las reservas viejas?',
        a: 'Las reservas guardan el nombre tal cual estaba en ese momento (snapshot). Las futuras ya usan el nombre nuevo. Así las facturas de meses anteriores no cambian retroactivamente.',
      },
    ],
  },

  {
    title: 'Clientes y reputación',
    items: [
      {
        q: '¿Dónde veo el histórico de un cliente?',
        a: 'En [Clientes](/dashboard/clientes) tienes la lista con total de reservas, no-shows y reputación (buena, aviso, bloqueado). Al clicar en uno ves su historial.',
      },
      {
        q: 'Un cliente con no-shows volvió y se portó bien, ¿le doy segunda oportunidad?',
        a: 'Dos formas: (1) Automático — cada cita completada baja el contador en 1. (2) Manual — en Clientes pulsa "Perdonar" para reiniciar a 0.',
      },
      {
        q: '¿Qué hace el bot con un cliente que acumula no-shows?',
        a: 'A partir de cierto umbral le marca "aviso". En el futuro podrás configurar que el bot pida depósito a clientes con X no-shows antes de confirmar — aún no está, es roadmap.',
      },
      {
        q: '¿Puedo bloquear a un cliente?',
        a: 'El bot bloquea automáticamente si acumula muchas cancelaciones o no-shows. En [Clientes](/dashboard/clientes) puedes ver quién está bloqueado y desbloquear con 1 click.',
      },
      {
        q: '¿Cliente nuevo, cómo aprende el bot su nombre?',
        a: 'Primera conversación: le pregunta el nombre. Se guarda y no vuelve a preguntar. El bot también le pregunta si prefiere español o inglés.',
      },
    ],
  },

  {
    title: 'Facturación y gestor',
    items: [
      {
        q: '¿Cómo activo las facturas?',
        a: '[Mi negocio → Facturación](/dashboard/negocio?tab=facturacion). Rellena nombre fiscal, NIF, dirección, CP y ciudad. Sin estos 5 datos no podemos emitir por ley (Real Decreto 1619/2012).',
      },
      {
        q: '¿Ticket o factura?',
        a: 'Automático: si el cliente da NIF, factura completa. Si no, ticket simplificado. Se emite solo con cada reserva confirmada con precio.',
      },
      {
        q: '¿Qué le mando al gestor cada mes?',
        a: 'En [Facturación](/dashboard/facturas) descarga 3 cosas: Libro PDF (legal), XLSX (Excel con Resumen + Facturas + Propinas separadas) y CSV. Adjunta al email del gestor, listo para el Modelo 303.',
      },
      {
        q: '¿Y si anulo una reserva?',
        a: 'La factura se marca "anulada" automáticamente. No cuenta en los totales ni en el libro del mes. Si ya cobraste, emite factura rectificativa manualmente (tu gestor te orientará).',
      },
      {
        q: 'Me equivoqué al poner un precio de servicio, ¿afecta reservas viejas?',
        a: 'No. Al editar el servicio solo cambian las reservas FUTURAS. Las ya emitidas se quedan como estaban para no distorsionar las facturas del mes anterior.',
      },
      {
        q: '¿Qué número tendrá mi próxima factura?',
        a: 'En [Mi negocio → Facturación](/dashboard/negocio?tab=facturacion) ves y editas el prefijo + número siguiente. Si ya emitiste alguna, el número se bloquea (no se puede ir hacia atrás, es requisito legal).',
      },
      {
        q: 'Un walk-in que no reservó, ¿cómo le emito factura?',
        a: 'En [Facturación](/dashboard/facturas) pulsa "Nueva factura / walk-in". En 30 segundos emites ticket o factura sin pasar por agenda.',
      },
      {
        q: '¿El IVA lo calcula solo?',
        a: 'Sí. Configuras el % una vez (0, 4, 10 o 21 — en España peluquería suele ser 21%). Cada ticket/factura calcula base y cuota automáticamente.',
      },
      {
        q: '¿Qué pasa si un cliente pide que le anule una factura emitida?',
        a: 'Anulas la reserva asociada y la factura queda marcada como "anulada". No le puedes "borrar" una factura sin dejar rastro — sería ilegal. Si ya pagó, emite una rectificativa manualmente.',
      },
    ],
  },

  {
    title: 'Cobros online (opcional)',
    items: [
      {
        q: '¿Qué son los cobros online?',
        a: 'Cobrar con tarjeta sin comprar datáfono. Activas Stripe (10 min, DNI + IBAN online) y desde cualquier reserva generas un QR. El cliente paga con tarjeta/Apple Pay y el dinero va directo a tu banco.',
      },
      {
        q: '¿Cómo activo los cobros?',
        a: '[Mi negocio → Cobros online](/dashboard/negocio?tab=cobros). Pulsa "Activar cobros online" y sigue el formulario de Stripe (DNI, IBAN, selfie). En pocos minutos está listo.',
      },
      {
        q: '¿Cuánto cobra Stripe?',
        a: '1,5% + 0,25€ por transacción (tarjetas europeas estándar). otracita no añade ni un céntimo. Importante: con ticket medio bajo puede salir más caro que un datáfono tradicional — úsalo para casos concretos (cliente sin efectivo, pago a distancia), no como reemplazo del datáfono si ya tienes.',
      },
      {
        q: '¿Cuándo llega el dinero a mi banco?',
        a: '1-2 días hábiles. Los primeros cobros pueden tardar hasta una semana (rolling reserve inicial de Stripe), después se estabiliza en diario.',
      },
      {
        q: 'Cliente pagó y no veo el dinero, ¿qué hago?',
        a: 'Respira: 1-2 días hábiles es normal. Si pasan más de 3 días, entra en tu panel de Stripe (botón "Gestionar cuenta en Stripe" en Mi negocio → Cobros) para ver el payout. Si no lo ves, avísanos.',
      },
      {
        q: '¿Cómo devuelvo un pago?',
        a: 'Desde tu panel de Stripe: "Gestionar cuenta" → Payments → el pago concreto → Refund. otracita detecta la devolución y actualiza el estado automáticamente.',
      },
      {
        q: 'Cambié de banco, ¿cómo actualizo el IBAN?',
        a: 'Panel de Stripe (botón "Gestionar cuenta en Stripe" en Mi negocio → Cobros) → Configuración → Cuentas bancarias. Los próximos payouts van al nuevo IBAN.',
      },
      {
        q: '¿Cliente me dice que no puede pagar el QR?',
        a: 'Causas típicas: tarjeta no tiene 3DS activado (banco del cliente la rechaza), tarjeta prepago que no acepta comercio online, o cliente fuera de zona SEPA. Que pruebe con otra tarjeta o pague en efectivo.',
      },
    ],
  },

  {
    title: 'Propinas y valoraciones',
    items: [
      {
        q: '¿Cómo activo propinas?',
        a: 'Primero Stripe activo. Luego en [Mi negocio → Cobros](/dashboard/negocio?tab=cobros) abajo encontrarás "Propinas y rating". Activa el toggle y define importes sugeridos (ej. 2€/3€/5€).',
      },
      {
        q: '¿Cómo funciona?',
        a: '30 minutos después del corte, el bot escribe al cliente: "¿Qué tal con Carlos? ⭐⭐⭐⭐⭐ + propina opcional". Si valora ≥4 estrellas, le ofrece dejar propina. Si valora ≤3, solo agradece sin pedir propina.',
      },
      {
        q: '¿Dónde veo las propinas?',
        a: 'En el XLSX mensual hay una hoja aparte "Propinas recibidas" con fecha, barbero e importe. Fiscalmente son renta del negocio — el gestor las incluye en IRPF (no en IVA).',
      },
      {
        q: '¿Cuál es la propina mínima?',
        a: '1€. Por debajo de 3€ avisamos al cliente que Stripe descuenta 0,25€ de comisión bancaria, para que decida informado.',
      },
      {
        q: '¿otracita se queda con algo de las propinas?',
        a: '0%. Todo para ti. Solo se descuenta la comisión normal de Stripe (1,5% + 0,25€ como cualquier pago).',
      },
      {
        q: '¿Puedo activar propinas sin activar cobros online?',
        a: 'No. Las propinas se cobran también por Stripe, así que es el mismo Stripe. Una verificación cubre las dos cosas.',
      },
    ],
  },

  {
    title: 'Mi bot de WhatsApp',
    items: [
      {
        q: '¿En qué idiomas responde?',
        a: 'Español e inglés, con auto-detección. Si tu clientela es turística, funciona sin que tengas que hacer nada. El cliente puede pedirle cambiar de idioma en cualquier momento.',
      },
      {
        q: 'El bot respondió algo raro, ¿qué hago?',
        a: 'Envíanos captura del chat por WhatsApp (+34 644 288 663). Lo revisamos y ajustamos el prompt del bot si hace falta.',
      },
      {
        q: '¿El bot aprende con el tiempo?',
        a: 'No automáticamente. Es GPT con instrucciones fijas que le damos. Si ves que se equivoca, nos avisas y mejoramos la instrucción para todos.',
      },
      {
        q: '¿Puedo ver las conversaciones del bot?',
        a: 'Sí, en [Mensajes](/dashboard/mensajes). Ves cada hilo, con quién habló, qué le preguntó, qué respondió el bot.',
      },
      {
        q: 'Un cliente me llama por teléfono, no por WhatsApp. ¿Pierdo esa reserva?',
        a: 'El bot no contesta llamadas (por ahora). Para esos casos tú mismo creas la reserva manual en [Agenda](/dashboard/agenda). Estamos trabajando en bot telefónico — roadmap.',
      },
      {
        q: '¿El bot funciona 24h?',
        a: 'Sí, siempre. Cliente escribe a las 3am y le reserva. Cuando tú llegues ya está en la agenda.',
      },
      {
        q: '¿Qué hace el bot cuando no entiende?',
        a: 'Pide aclarar con opciones concretas. Si tras varios intentos no le queda claro, deriva al WhatsApp humano (tu número) con resumen de la conversación.',
      },
    ],
  },

  {
    title: 'Problemas comunes',
    items: [
      {
        q: 'No me llega ningún mensaje al WhatsApp del negocio',
        a: 'Puede ser config de Meta. Contacta soporte por WhatsApp (+34 644 288 663) con tu número de negocio. Es lo más rápido — revisamos tokens y webhooks desde nuestro lado.',
      },
      {
        q: 'Meta me bloqueó el número de WhatsApp',
        a: 'Meta puede limitar temporalmente. Contacta soporte por WhatsApp con captura. No es algo que tú puedas resolver desde el panel — lo vemos con Meta.',
      },
      {
        q: 'Me fui de vacaciones y el bot sigue ofreciendo citas',
        a: 'Bloquea esos días en [Mi negocio → Días bloqueados](/dashboard/negocio?tab=blocked) o pon "Cerrado" en el horario del rango. El bot deja de ofrecerlos al instante.',
      },
      {
        q: 'Cambié el horario y el bot ofrece horas viejas',
        a: 'Refresca el dashboard (el bot sí que tiene los datos frescos). Si un cliente reservó antes de tu cambio, esa reserva se queda, pero las nuevas ya van con el horario nuevo.',
      },
      {
        q: 'Un cliente dice que no recibió la confirmación',
        a: 'Revisa [Mensajes](/dashboard/mensajes) para ver si Meta marcó el mensaje como entregado. A veces filtros de spam del cliente bloquean — que guarde tu número como contacto.',
      },
      {
        q: 'Se me cuelga el panel',
        a: 'Actualiza (Cmd+R / Ctrl+R) y prueba otro navegador (Chrome recomendado). Si persiste, contacta soporte con captura de la consola del navegador (Cmd+Opt+I → Console).',
      },
    ],
  },

  {
    title: 'Mi suscripción',
    items: [
      {
        q: '¿Cómo cancelo?',
        a: '[Mi plan](/dashboard/mi-plan) → "Gestionar suscripción". Abre el portal de Stripe, cancelas en 1 click. Mantienes acceso hasta el final del periodo ya pagado.',
      },
      {
        q: '¿Hay permanencia?',
        a: 'Ninguna. Mes a mes. Sin letra pequeña.',
      },
      {
        q: '¿Qué pasa si cancelo con reservas futuras?',
        a: 'El bot deja de responder mensajes, pero tus datos se conservan. Si vuelves, los recuperas. Las reservas confirmadas siguen en tu agenda si tenías sync activo.',
      },
      {
        q: '¿Cómo cambio la tarjeta de pago?',
        a: '[Mi plan](/dashboard/mi-plan) → "Gestionar suscripción" → Método de pago. Te abre el portal de Stripe y actualizas la tarjeta.',
      },
      {
        q: '¿Qué incluye el plan de 29€/mes?',
        a: 'Todo: bot WhatsApp 24/7, agenda, clientes, mensajes, equipo, facturación, libro mensual, cobros online, propinas, rating. Sin extras, sin letra pequeña.',
      },
      {
        q: '¿Me van a subir el precio?',
        a: 'Los que entran ahora se quedan con su precio inicial. Si subimos en el futuro, se aplica solo a nuevos clientes — tú no.',
      },
    ],
  },

  {
    title: 'Privacidad y datos',
    items: [
      {
        q: '¿Quién ve los datos de mis clientes?',
        a: 'Solo tú. Los datos están guardados encriptados, usamos cifrado en tránsito y reposo. otracita no comparte datos con terceros ni los usa para publicidad.',
      },
      {
        q: '¿Cumple GDPR?',
        a: 'Sí. Tienes aviso de privacidad en [otracita.es/privacidad](/privacidad). Si un cliente quiere que borres sus datos, contacta soporte y lo hacemos.',
      },
      {
        q: '¿Puedo exportar mis datos?',
        a: 'Sí. El libro mensual de facturas ya es una exportación. Para histórico completo (clientes, mensajes), contacta soporte y te lo preparamos en CSV.',
      },
    ],
  },
]

// -----------------------------------------------------------------------------
// Flatten for the LLM prompt. Plain text, no JSX, no markdown rendering —
// the LLM just reads it and uses it as grounded knowledge.
// -----------------------------------------------------------------------------
export function helpAsPlainText(): string {
  return HELP_SECTIONS.map((section) => {
    const body = section.items
      .map((f) => `• ${f.q}\n  ${f.a}`)
      .join('\n\n')
    return `## ${section.title}\n${body}`
  }).join('\n\n')
}
