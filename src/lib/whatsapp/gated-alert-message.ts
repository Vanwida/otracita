// ---------------------------------------------------------------------------
// L-17 — texto del aviso interno "esta barbería tiene el bot gateado".
//
// Parte PURA, sin BD ni Meta, para poder testear el mensaje aislado (mismo
// patrón que `invoicing-math.ts`). El envío y el cerrojo de "una vez al día"
// viven en `gated-alert.ts`.
//
// Este mensaje NO es user-facing: va a Alex, nunca al cliente de la barbería.
// Al cliente no se le dice jamás que hay que actualizar un plan — no es su
// plan y no sabe que existe un backend.
// ---------------------------------------------------------------------------

import { MS_IN_DAY } from '../time.ts';

/** Ventana del "una vez al día". Rolling 24 h, no día natural: así un mensaje
 *  a las 23:58 y otro a las 00:02 no cuentan como dos días distintos. */
export const GATED_ALERT_COOLDOWN_MS = MS_IN_DAY;

/** Lo que el aviso necesita saber de la barbería. Subconjunto de
 *  `BarbershopConfig` para no arrastrar la config entera hasta aquí. */
export interface GatedClient {
  id: string;
  businessName: string;
  tier: 'solo' | 'pro' | 'estudio';
  trialEndsAt: Date | null;
  status: string;
}

const TIER_LABEL: Record<GatedClient['tier'], string> = {
  solo: 'Solo',
  pro: 'Pro',
  estudio: 'Estudio',
};

const ALERT_TIMEZONE = 'Europe/Madrid';

function formatDay(date: Date): string {
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: ALERT_TIMEZONE,
  });
}

/** Por qué está gateada esta barbería, en una línea. El orden importa:
 *  `hasFeature` corta primero por `status === 'cancelled'`, así que ése manda
 *  aunque el tier siga diciendo Pro. */
function reasonLine(client: GatedClient, now: Date): string {
  if (client.status === 'cancelled') {
    return `Cuenta cancelada (tier ${TIER_LABEL[client.tier]}).`;
  }
  if (client.trialEndsAt && client.trialEndsAt.getTime() <= now.getTime()) {
    return `Plan ${TIER_LABEL[client.tier]} · trial caducado el ${formatDay(client.trialEndsAt)}.`;
  }
  return `Plan ${TIER_LABEL[client.tier]} · sin trial.`;
}

/** Texto del aviso a Alex. Puro: mismo input, mismo output. */
export function gatedAlertMessage(client: GatedClient, now: Date = new Date()): string {
  return [
    `🔇 Bot gateado — ${client.businessName}`,
    '',
    'Le están entrando mensajes al WhatsApp y el bot no contesta.',
    reasonLine(client, now),
    '',
    `Cliente: ${client.id}`,
    'Siguiente aviso de esta barbería: en 24 h como pronto.',
  ].join('\n');
}
