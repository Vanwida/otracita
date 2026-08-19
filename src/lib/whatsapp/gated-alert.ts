// ---------------------------------------------------------------------------
// L-17 — la barbería sin plan del bot: silencio hacia el cliente, aviso a Alex.
//
// Cuando `hasFeature(config, 'whatsappBot')` es false, `engine.ts` tira el
// mensaje entrante. Hacia el cliente final eso está BIEN: escribe al WhatsApp
// de su barbería y le contesta el barbero a mano, sin enterarse de que hay un
// backend detrás. Jamás le decimos "actualiza el plan" — no es su plan.
//
// Lo que estaba mal es que el drop era invisible también para nosotros: una
// barbería con el número de Meta ya conectado podía estar recibiendo peticiones
// de cita por WhatsApp durante semanas sin que nadie lo supiera. Esa es la
// señal comercial más caliente que existe (número montado + demanda real +
// plan que no la cubre) y se perdía en un `console.log` de Vercel.
//
// El aviso va a Alex, UNA vez cada 24 h por barbería. El cerrojo es la columna
// `clients.bot_gated_alert_at` y un UPDATE condicional: quien consigue mover la
// fecha manda el aviso, el resto de mensajes de esa ventana no hacen nada. Al
// ser una sola sentencia atómica, dos invocaciones concurrentes del webhook
// (dos clientes escribiendo a la vez) no pueden mandar dos avisos.
//
// La reclamación NO se revierte si el envío falla. Si la ventana de 24 h de
// Meta con Alex está cerrada, `notifyAlex` lo deja en el log y se reintenta al
// día siguiente; devolver el cerrojo convertiría un día malo en un intento de
// envío por cada mensaje entrante, que es justo lo que este módulo evita.
// ---------------------------------------------------------------------------

import { db } from '@/db';
import { clients } from '@/db/schema';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { notifyAlex } from '@/lib/notify-alex';
import {
  GATED_ALERT_COOLDOWN_MS,
  gatedAlertMessage,
  type GatedClient,
} from './gated-alert-message.ts';

export type { GatedClient };

/**
 * Intenta quedarse con el aviso de las próximas 24 h de esta barbería.
 * Devuelve true SOLO al primero que llega dentro de la ventana.
 *
 * La condición viaja dentro del UPDATE, así que es atómico: en READ COMMITTED
 * el segundo escritor concurrente reevalúa el WHERE contra la fila ya
 * actualizada, deja de cumplirlo, y se va con 0 filas.
 */
export async function claimGatedAlert(
  clientId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - GATED_ALERT_COOLDOWN_MS);

  const claimed = await db
    .update(clients)
    .set({ botGatedAlertAt: now })
    .where(
      and(
        eq(clients.id, clientId),
        or(isNull(clients.botGatedAlertAt), lt(clients.botGatedAlertAt, cutoff)),
      ),
    )
    .returning({ id: clients.id });

  return claimed.length > 0;
}

/**
 * Avisa a Alex de que esta barbería está recibiendo WhatsApps con el bot
 * gateado. Nunca lanza: un fallo aquí no puede tumbar el webhook de Meta, que
 * tiene que contestar 200 o Meta reintenta el mismo mensaje.
 */
export async function notifyAlexBotGated(
  client: GatedClient,
  now: Date = new Date(),
): Promise<void> {
  try {
    if (!(await claimGatedAlert(client.id, now))) return;
    await notifyAlex(gatedAlertMessage(client, now));
  } catch (err) {
    console.error('[gated-alert] aviso no enviado:', err);
  }
}
