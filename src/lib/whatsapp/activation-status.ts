import { and, eq, sql } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { db } from '@/db';
import { barbers as barbersTable, clients } from '@/db/schema';
import { hasFeature } from '@/lib/billing/tier';
import { graphUrl } from './sender';

// -----------------------------------------------------------------------------
// Estado REAL de activación del bot de WhatsApp.
//
// Antes el semáforo era verde con solo tener `whatsappPhoneNumberId` poblado.
// Eso solo dice "alguien pegó un ID en la ficha": no dice que Meta acepte las
// credenciales, ni que el plan incluya el bot, ni que el motor de huecos
// pueda ofrecer una sola hora. Un barbero veía "Atendiendo" mientras sus
// clientes recibían "Error interno".
//
// Aquí se calcula el estado de verdad. VERDE solo si TODO se cumple:
//
//   1. El plan incluye el bot (`whatsappBot`).
//   2. Hay número Y token, y Meta los acepta AHORA (lectura, ver abajo).
//   3. El motor de disponibilidad está enchufado (DB o, legacy, GCal).
//   4. Hay servicios, hay barberos activos y hay al menos un día abierto.
//
// Si falta algo → ÁMBAR con el motivo concreto, nunca verde optimista.
//
// COSTE: la comprobación de credenciales es un GET a la Graph API pidiendo
// los campos del número. Es una LECTURA — gratis. NO se manda ningún mensaje
// de WhatsApp para "probar el bot": cada mensaje de plantilla se cobra, y
// cobrarle al barbero por pintar un semáforo sería indefendible.
// -----------------------------------------------------------------------------

/** Timeout del health-check. Por encima de esto damos "no verificable" en vez
 *  de bloquear el render de la página. */
const CREDENTIAL_CHECK_TIMEOUT_MS = 4_000;

/** TTL de la respuesta de Meta en el Data Cache de Next. Las credenciales no
 *  cambian de un minuto a otro y la página se abre muchas veces. */
const CREDENTIAL_CHECK_TTL_SECONDS = 300;

/** Códigos de error de Meta que significan "estas credenciales no valen",
 *  frente a "Meta está caído / rate limit" (que no es culpa de la ficha).
 *  https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes */
const CREDENTIAL_REJECTED_CODES = new Set([
  10,  // permission denied
  100, // invalid parameter → normalmente phone number ID que no existe
  102, // sesión caducada
  190, // access token inválido o expirado
  200, // permisos insuficientes
  803, // el objeto no existe para este token
]);

export type MetaCredentialCheck = 'ok' | 'rejected' | 'unreachable';

/**
 * Pregunta a Meta si el par (phoneNumberId, token) sigue vivo. GET, no POST:
 * no manda ni cobra ningún mensaje.
 */
export async function checkMetaCredentials(
  phoneNumberId: string,
  accessToken: string,
): Promise<MetaCredentialCheck> {
  if (!accessToken) return 'rejected';

  let res: Response;
  try {
    res = await fetch(graphUrl(`${phoneNumberId}?fields=id`), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(CREDENTIAL_CHECK_TIMEOUT_MS),
      next: { revalidate: CREDENTIAL_CHECK_TTL_SECONDS },
    });
  } catch {
    // Timeout o red caída: no sabemos nada. "unreachable" ≠ "roto".
    return 'unreachable';
  }

  if (res.ok) return 'ok';

  const body = (await res.json().catch(() => null)) as
    | { error?: { code?: number } }
    | null;
  const code = body?.error?.code;

  if (typeof code === 'number' && CREDENTIAL_REJECTED_CODES.has(code)) return 'rejected';
  if (res.status === 401 || res.status === 403) return 'rejected';
  return 'unreachable';
}

// ─── Estado del bot ──────────────────────────────────────────────────────────

export type BotActivationState =
  /** Número + credenciales vivas + puede ofrecer huecos. Verde. */
  | 'active'
  /** Tiene número, pero algo impide que atienda de verdad. Ámbar + motivos. */
  | 'incomplete'
  /** Sin número todavía, con solicitud enviada. Ámbar "en cola". */
  | 'requested'
  /** Ni número ni solicitud. La página muestra el formulario de alta. */
  | 'idle';

export type BotBlockerCode =
  | 'plan'
  | 'credentials_rejected'
  | 'credentials_unverified'
  | 'availability_engine'
  | 'no_services'
  | 'no_barbers'
  | 'no_open_days';

export interface BotBlocker {
  code: BotBlockerCode;
  /** Qué falta, en una línea. */
  title: string;
  /** Qué hay que hacer. Si lo tenemos que arreglar nosotros, se dice. */
  detail: string;
  action?: { label: string; href: string };
}

export interface BotActivationStatus {
  state: BotActivationState;
  /** Vacío si `state === 'active'`. Ordenado: lo que más bloquea, primero. */
  blockers: BotBlocker[];
}

/** Campos de `clients` que necesita el cálculo. */
export type BotActivationClient = Pick<
  InferSelectModel<typeof clients>,
  | 'id'
  | 'tier'
  | 'trialEndsAt'
  | 'trialStartedAt'
  | 'plan'
  | 'status'
  | 'stripeSubscriptionId'
  | 'whatsappPhoneNumberId'
  | 'whatsappAccessToken'
  | 'whatsappBotRequest'
  | 'chatbotServices'
  | 'chatbotHours'
  | 'useDbAvailability'
  | 'googleCalendarId'
>;

/** Un día cuenta como abierto si tiene rango y no es "Cerrado". */
function hasOpenDay(chatbotHours: unknown): boolean {
  if (!chatbotHours || typeof chatbotHours !== 'object') return false;
  return Object.values(chatbotHours as Record<string, unknown>).some((raw) => {
    if (typeof raw !== 'string') return false;
    const value = raw.trim();
    return value.length > 0 && value.toLowerCase() !== 'cerrado';
  });
}

export async function getBotActivationStatus(
  client: BotActivationClient,
): Promise<BotActivationStatus> {
  const hasNumber = !!client.whatsappPhoneNumberId;
  const hasRequest = !!client.whatsappBotRequest?.phoneRequested;

  if (!hasNumber) {
    return { state: hasRequest ? 'requested' : 'idle', blockers: [] };
  }

  const blockers: BotBlocker[] = [];

  // 1. Plan. Sin la feature, engine.ts deja el mensaje sin contestar.
  if (!hasFeature(client, 'whatsappBot')) {
    blockers.push({
      code: 'plan',
      title: 'Tu plan no incluye el bot',
      detail:
        'El número está dado de alta, pero mientras no tengas Pro los mensajes de tus clientes se quedan sin contestar.',
      action: { label: 'Ver planes', href: '/dashboard/mi-plan' },
    });
  }

  // 2. Credenciales. Lectura contra Meta, sin mandar mensajes.
  const credentials = await checkMetaCredentials(
    client.whatsappPhoneNumberId!,
    client.whatsappAccessToken || process.env.WHATSAPP_ACCESS_TOKEN || '',
  );
  if (credentials === 'rejected') {
    blockers.push({
      code: 'credentials_rejected',
      title: 'Meta no acepta las credenciales del número',
      detail:
        'El token ha caducado o el número ya no cuelga de nuestra cuenta. Esto lo arreglamos nosotros: escríbenos y lo renovamos.',
    });
  } else if (credentials === 'unreachable') {
    blockers.push({
      code: 'credentials_unverified',
      title: 'No hemos podido comprobar la conexión con Meta',
      detail:
        'No nos ha contestado a tiempo. Puede que esté todo bien, pero hasta confirmarlo no te decimos que está atendiendo. Vuelve a abrir esta pantalla en un rato.',
    });
  }

  // 3. Motor de disponibilidad. Sin esto el bot llega hasta "¿qué día?" y
  //    responde "Error interno" (ver engine.ts, guard useDbAvailability).
  if (!client.useDbAvailability && !client.googleCalendarId) {
    blockers.push({
      code: 'availability_engine',
      title: 'El bot no puede leer tu agenda',
      detail:
        'Le falta el motor de huecos: llegaría a preguntar el día y se quedaría ahí. Lo activamos nosotros desde el panel, escríbenos.',
    });
  }

  // 4. Servicios.
  const services = (client.chatbotServices as unknown[] | null) ?? [];
  if (services.length === 0) {
    blockers.push({
      code: 'no_services',
      title: 'No tienes servicios configurados',
      detail: 'Sin catálogo el bot no tiene nada que ofrecer ni cuánto dura cada cosa.',
      action: { label: 'Añadir servicios', href: '/dashboard/ajustes' },
    });
  }

  // 5. Barberos activos. `barbers` es la tabla canónica (nunca booksyServices).
  const [barberCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(barbersTable)
    .where(and(eq(barbersTable.clientId, client.id), eq(barbersTable.active, true)));
  if (!barberCount || barberCount.count === 0) {
    blockers.push({
      code: 'no_barbers',
      title: 'No hay ningún profesional activo',
      detail: 'El motor de huecos busca por profesional: sin ninguno, no devuelve horas.',
      action: { label: 'Ir a Equipo', href: '/dashboard/equipo' },
    });
  }

  // 6. Horario.
  if (!hasOpenDay(client.chatbotHours)) {
    blockers.push({
      code: 'no_open_days',
      title: 'No tienes ningún día abierto',
      detail: 'Con toda la semana en «Cerrado» el bot no puede ofrecer ni un hueco.',
      action: { label: 'Ajustar horario', href: '/dashboard/ajustes' },
    });
  }

  return { state: blockers.length === 0 ? 'active' : 'incomplete', blockers };
}
