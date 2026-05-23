// -----------------------------------------------------------------------------
// iCalendar (.ics) → otracita bookings — pure helpers.
//
// Por qué este módulo: el onboarding de un barbero que migra desde Booksy /
// Treatwell / Google Calendar a otracita necesita poder traerse las citas
// FUTURAS sin re-introducirlas a mano. Booksy permite exportar su agenda en
// formato iCal estándar (RFC 5545) — ese es el target principal. Treatwell
// y Google Calendar exportan el mismo formato.
//
// Reglas duras:
//
//   · Solo eventos FUTUROS (DTSTART > now) llegan al preview. Las citas
//     pasadas no se importan: si el barbero quiere histórico, esa es otra
//     ruta (vision/email).
//   · El UID de cada VEVENT es la clave de idempotencia. Persistimos el
//     UID en `bookings.imported_ical_uid` y skip si ya existe para este
//     tenant. Importar el mismo .ics dos veces NO duplica.
//   · El SUMMARY de Booksy normalmente es "Cliente — Servicio" o
//     "Servicio — Cliente"; intentamos partir por separadores comunes
//     (em-dash, en-dash, guion, dos puntos) — si no, todo va a `service`
//     y `customerName` queda null (el barbero lo edita en el preview).
//   · Las fechas iCal pueden venir como `DTSTART:20260523T093000Z` (UTC),
//     `DTSTART;TZID=Europe/Madrid:20260523T093000` (local) o
//     `DTSTART;VALUE=DATE:20260523` (all-day, sin hora — se ignora).
//   · Multi-tenant: el caller (API route) resuelve `clientId` desde la
//     sesión y NUNCA lo acepta del body — aquí solo manipulamos strings.
//
// Estos helpers son puros (sin DB, sin I/O). El caller (API route) valida
// el tenant, hace SELECT de UIDs ya importados, llama a `parseIcs`, calcula
// colisiones, presenta preview, y al confirmar invoca `createBooking()` por
// cada evento — pipeline canónica para que pase por las mismas validaciones
// que el bot, voice y dashboard.
// -----------------------------------------------------------------------------

import { BUSINESS_TIMEZONE } from '../time.ts';

/** Un VEVENT parseado y normalizado a estructura plana de booking. */
export interface ParsedIcalEvent {
  /** UID del VEVENT — clave de idempotencia per tenant. Nunca null. */
  uid: string;
  /** YYYY-MM-DD en Europa/Madrid. */
  date: string;
  /** HH:MM 24h en Europa/Madrid. */
  time: string;
  /** Minutos = (DTEND - DTSTART). Si DTEND falta, null y el caller usa default. */
  durationMinutes: number | null;
  /** Mejor candidato a nombre del cliente (parseado de SUMMARY). */
  customerName: string | null;
  /** Mejor candidato a servicio (parseado de SUMMARY). */
  service: string;
  /** SUMMARY crudo, sin parsear — útil para debug en preview. */
  rawSummary: string;
  /** DESCRIPTION crudo. Se mapea a `notes` (vacío → null). */
  notes: string | null;
  /** LOCATION crudo, no se guarda en booking pero útil de mostrar. */
  location: string | null;
  /** Cuando la fecha+hora original era anterior a `now` (no se importa). */
  isPast: boolean;
}

/** Una posible colisión con un booking ya existente. */
export interface IcalCollision {
  /** UID del evento iCal que colisiona. */
  uid: string;
  /** Razón de la colisión. */
  reason: 'duplicate_uid' | 'overlap';
  /** ID del booking otracita que ya ocupa ese hueco (overlap). */
  conflictingBookingId?: string;
  /** Texto descriptivo para el preview ("Ya hay otra cita 09:30–10:00 con Reni"). */
  message: string;
}

// ── iCal line parsing ────────────────────────────────────────────────────────

/**
 * iCal usa "line folding": una línea lógica puede estar partida en varias
 * físicas si la siguiente empieza con espacio o tab. Esta función reagrupa
 * las líneas físicas en lógicas siguiendo RFC 5545 §3.1.
 */
export function unfoldIcalLines(raw: string): string[] {
  // Normalize line endings — Booksy/macOS/Windows mix CRLF and LF.
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/** Una línea iCal cruda: `KEY[;PARAM=VAL[;…]]:VALUE`. */
interface IcalLine {
  key: string;
  params: Record<string, string>;
  value: string;
}

/**
 * Parsea una línea ya unfolded en {key, params, value}. Soporta los params
 * comunes que vamos a necesitar: TZID, VALUE. No intentamos manejar quotes
 * complejos dentro de params (Booksy/Google no los usan).
 */
function parseIcalLine(line: string): IcalLine | null {
  // Encontrar el primer `:` que NO esté dentro de una param entre quotes.
  let colonIdx = -1;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ':' && !inQuotes) {
      colonIdx = i;
      break;
    }
  }
  if (colonIdx < 0) return null;

  const header = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const headerParts = header.split(';');
  const key = headerParts[0]?.toUpperCase() ?? '';
  if (!key) return null;

  const params: Record<string, string> = {};
  for (let i = 1; i < headerParts.length; i++) {
    const part = headerParts[i];
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const pk = part.slice(0, eq).toUpperCase();
    const pv = part.slice(eq + 1).replace(/^"|"$/g, '');
    params[pk] = pv;
  }
  return { key, params, value };
}

/**
 * iCal text-value escaping (RFC 5545 §3.3.11): `\n` `\,` `\;` `\\`.
 * SUMMARY/DESCRIPTION/LOCATION llegan con estos escapes y hay que desescaparlos
 * antes de mostrarlos al usuario.
 */
function unescapeIcalText(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\N/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

// ── Datetime helpers ─────────────────────────────────────────────────────────

/**
 * Parsea un valor DTSTART/DTEND. Devuelve un Date en UTC instant + flag de
 * si era all-day (sin hora). NO intentamos honrar TZID arbitrarios — solo
 * 3 casos cubren ~100% de exports reales:
 *
 *   1. `20260523T093000Z`             → UTC absoluto
 *   2. `20260523T093000` con TZID     → interpretado en Europa/Madrid (asumido)
 *   3. `20260523` (VALUE=DATE)        → all-day, ignoramos el evento
 *
 * Booksy/Google/Treatwell todos exportan a UTC o a Europe/Madrid. Si alguien
 * tiene un .ics con TZID exótico (Pacific/Auckland), aceptamos el riesgo de
 * que el cálculo de hora local sea aproximado — el barbero lo verá en el
 * preview y puede corregirlo a mano.
 */
function parseIcalDate(
  value: string,
  params: Record<string, string>,
): { instant: Date; allDay: boolean } | null {
  const trimmed = value.trim();
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(trimmed)) {
    // All-day — sin hora, no nos sirve para una cita de barbería.
    return { instant: new Date(0), allDay: true };
  }
  // Forma: YYYYMMDDTHHMMSS[Z]
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(trimmed);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z === 'Z') {
    // UTC absoluto.
    return {
      instant: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)),
      allDay: false,
    };
  }
  // Local time — interpretamos como Europa/Madrid. Calculamos el offset que
  // Europe/Madrid tenía en esa fecha (CET = UTC+1 invierno, CEST = UTC+2
  // verano) y construimos el instant correspondiente. Esto evita depender del
  // TZ del proceso Node (que en Vercel es UTC).
  const utcInstant = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  const offsetMin = madridOffsetMinutes(utcInstant);
  return {
    instant: new Date(utcInstant.getTime() - offsetMin * 60_000),
    allDay: false,
  };
}

/**
 * Offset (en minutos) de Europe/Madrid respecto a UTC en el `instant` dado.
 * Devuelve +60 en invierno (CET) o +120 en verano (CEST). Usa Intl.DateTimeFormat
 * (sin libs externas) — un truco común en Node sin date-fns-tz.
 */
function madridOffsetMinutes(instant: Date): number {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const y = +get('year');
  const mo = +get('month');
  const d = +get('day');
  // 24:00 viene de Intl en algunas locales → normalizar a 00:00.
  let h = +get('hour');
  if (h === 24) h = 0;
  const mi = +get('minute');
  const s = +get('second');
  const madridAsUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  return Math.round((madridAsUtc - instant.getTime()) / 60_000);
}

/** Formatea un Date como YYYY-MM-DD HH:MM en Europe/Madrid. */
function formatInMadrid(instant: Date): { date: string; time: string } {
  // toLocaleString con timeZone — fuente única.
  const date = instant.toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE }); // YYYY-MM-DD
  const time = instant.toLocaleTimeString('en-GB', {
    timeZone: BUSINESS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { date, time };
}

// ── SUMMARY → (customerName, service) heuristics ─────────────────────────────

/**
 * Booksy exporta SUMMARY en formatos variados:
 *
 *   · "Carlos García — Corte clásico"        ← em-dash
 *   · "Carlos García - Corte clásico"        ← guion
 *   · "Corte clásico (Carlos García)"        ← paréntesis (menos común)
 *   · "Corte clásico"                        ← solo servicio
 *   · "Carlos García"                        ← solo nombre (sin servicio)
 *
 * Treatwell/Google suelen ser similares pero a veces vienen invertidos
 * ("Servicio — Cliente"). Sin contexto fiable para saber el orden,
 * heurística: si la primera parte parece nombre de persona (2+ palabras,
 * todas Capitalized, sin números, sin keywords típicos de servicio),
 * la tratamos como `customerName`. Resto = service.
 *
 * Cuando no podemos partir, todo va a `service` y `customerName=null`.
 * El barbero lo edita en el preview — mejor null que adivinar mal.
 */
const SEPARATOR_RE = /\s+[—–\-:]\s+/;
const SERVICE_KEYWORDS = [
  'corte',
  'cortes',
  'barba',
  'afeitado',
  'tinte',
  'color',
  'tratamiento',
  'lavado',
  'peinado',
  'masaje',
  'mechas',
  'manicura',
  'pedicura',
  'depilac',
  'cera',
  'extension',
];

export function parseSummary(summary: string): { customerName: string | null; service: string } {
  const clean = summary.trim();
  if (!clean) return { customerName: null, service: 'Importado' };

  // Caso: "Servicio (Cliente)".
  const paren = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(clean);
  if (paren) {
    const a = paren[1].trim();
    const b = paren[2].trim();
    // Asumir paren contiene el nombre del cliente.
    return { customerName: b || null, service: a || 'Importado' };
  }

  // Separadores comunes.
  const parts = clean.split(SEPARATOR_RE);
  if (parts.length >= 2) {
    const a = parts[0].trim();
    const b = parts.slice(1).join(' — ').trim();
    if (looksLikePersonName(a) && !looksLikePersonName(b)) {
      return { customerName: a, service: b || 'Importado' };
    }
    if (looksLikePersonName(b) && !looksLikePersonName(a)) {
      return { customerName: b, service: a || 'Importado' };
    }
    // Empate: por convención (Booksy export real) primera = cliente.
    return { customerName: a, service: b || 'Importado' };
  }

  // No separador: si parece nombre, va a name; si no, va a service.
  if (looksLikePersonName(clean)) {
    return { customerName: clean, service: 'Importado' };
  }
  return { customerName: null, service: clean };
}

function looksLikePersonName(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/\d/.test(t)) return false;
  const lower = t.toLowerCase();
  if (SERVICE_KEYWORDS.some((k) => lower.includes(k))) return false;
  const words = t.split(/\s+/);
  if (words.length < 2) return false;
  return words.every((w) => /^[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü'’]+$/.test(w));
}

// ── VEVENT parser ────────────────────────────────────────────────────────────

/**
 * Parsea un .ics entero. Solo extraemos los VEVENT futuros con DTSTART+hora.
 * Eventos all-day o pasados se devuelven en la lista pero marcados isPast=true
 * (el caller los filtra/cuenta).
 *
 * No usamos un parser externo a propósito — el formato es pequeño y un parser
 * inline nos da control total sobre los foot-guns (line folding, escapes,
 * datetimes UTC vs locales). Cero dependencias nuevas.
 */
export function parseIcs(ics: string, now: Date = new Date()): ParsedIcalEvent[] {
  const lines = unfoldIcalLines(ics);
  const events: ParsedIcalEvent[] = [];

  let inEvent = false;
  let buf: Record<string, IcalLine> = {};

  for (const raw of lines) {
    if (!raw.trim()) continue;
    const parsed = parseIcalLine(raw);
    if (!parsed) continue;
    const { key } = parsed;
    if (key === 'BEGIN' && parsed.value.toUpperCase() === 'VEVENT') {
      inEvent = true;
      buf = {};
      continue;
    }
    if (key === 'END' && parsed.value.toUpperCase() === 'VEVENT') {
      inEvent = false;
      const ev = buildEvent(buf, now);
      if (ev) events.push(ev);
      buf = {};
      continue;
    }
    if (!inEvent) continue;
    // Solo guardamos las keys que nos interesan — el resto se descarta.
    if (['UID', 'SUMMARY', 'DESCRIPTION', 'LOCATION', 'DTSTART', 'DTEND', 'STATUS'].includes(key)) {
      buf[key] = parsed;
    }
  }

  return events;
}

function buildEvent(
  buf: Record<string, IcalLine>,
  now: Date,
): ParsedIcalEvent | null {
  const uidLine = buf.UID;
  const dtStartLine = buf.DTSTART;
  if (!uidLine || !dtStartLine) return null;

  const uid = uidLine.value.trim();
  if (!uid) return null;

  // STATUS:CANCELLED → skip (Booksy a veces incluye cancelados).
  const status = buf.STATUS?.value.trim().toUpperCase();
  if (status === 'CANCELLED') return null;

  const start = parseIcalDate(dtStartLine.value, dtStartLine.params);
  if (!start || start.allDay) return null;

  let durationMinutes: number | null = null;
  if (buf.DTEND) {
    const end = parseIcalDate(buf.DTEND.value, buf.DTEND.params);
    if (end && !end.allDay) {
      const diffMin = Math.round((end.instant.getTime() - start.instant.getTime()) / 60_000);
      if (diffMin > 0 && diffMin < 24 * 60) durationMinutes = diffMin;
    }
  }

  const { date, time } = formatInMadrid(start.instant);
  const rawSummary = unescapeIcalText(buf.SUMMARY?.value ?? '');
  const { customerName, service } = parseSummary(rawSummary);

  const description = buf.DESCRIPTION ? unescapeIcalText(buf.DESCRIPTION.value).trim() : '';
  const location = buf.LOCATION ? unescapeIcalText(buf.LOCATION.value).trim() : '';

  const isPast = start.instant.getTime() < now.getTime();

  return {
    uid,
    date,
    time,
    durationMinutes,
    customerName,
    service,
    rawSummary,
    notes: description || null,
    location: location || null,
    isPast,
  };
}

// ── Collision detection ──────────────────────────────────────────────────────

/** Booking ya existente en DB que necesitamos para detectar colisiones. */
export interface ExistingBookingSlot {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  duration: number; // minutos
  barberId: string | null;
  status: string;
  importedIcalUid?: string | null;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Calcula colisiones para una lista de eventos parseados vs bookings ya
 * existentes en este tenant + UIDs ya importados anteriormente.
 *
 *   · `duplicate_uid` — ya importamos este UID antes (idempotencia). Skip.
 *   · `overlap`       — choca con otro booking del mismo día (cualquier
 *                       barbero). Aviso, NO skip — el barbero decide en
 *                       el preview (puede ser legítimo: 2 barberos en
 *                       paralelo con el mismo .ics combinado).
 *
 * El check de overlap es por DÍA + RANGO TEMPORAL, sin considerar barbero
 * (no sabemos a qué barbero asignar antes de confirmar). El caller pinta
 * el aviso y al confirmar createBooking() vuelve a chequear con barbero
 * resuelto — esa es la última red de seguridad.
 */
export function detectCollisions(
  events: ParsedIcalEvent[],
  existingBookings: ExistingBookingSlot[],
  existingUids: Set<string>,
  defaultDurationMinutes: number,
): Map<string, IcalCollision> {
  const out = new Map<string, IcalCollision>();

  // Index existing bookings by date for O(1) lookups.
  const byDate = new Map<string, ExistingBookingSlot[]>();
  for (const b of existingBookings) {
    if (b.status === 'cancelled') continue;
    const list = byDate.get(b.date) ?? [];
    list.push(b);
    byDate.set(b.date, list);
  }

  for (const ev of events) {
    if (ev.isPast) continue;
    if (existingUids.has(ev.uid)) {
      out.set(ev.uid, {
        uid: ev.uid,
        reason: 'duplicate_uid',
        message: 'Ya importaste esta cita antes — se omitirá.',
      });
      continue;
    }
    const dur = ev.durationMinutes ?? defaultDurationMinutes;
    const start = toMinutes(ev.time);
    const end = start + dur;
    const sameDay = byDate.get(ev.date) ?? [];
    const overlap = sameDay.find((b) => {
      const bStart = toMinutes(b.time);
      const bEnd = bStart + b.duration;
      return start < bEnd && end > bStart;
    });
    if (overlap) {
      out.set(ev.uid, {
        uid: ev.uid,
        reason: 'overlap',
        conflictingBookingId: overlap.id,
        message: `Choca con otra cita ${overlap.time}–${minutesToHHMM(toMinutes(overlap.time) + overlap.duration)} ese día.`,
      });
    }
  }

  return out;
}

function minutesToHHMM(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const mi = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}
