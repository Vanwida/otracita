export interface BooksyBookingData {
  type: 'new' | 'modified' | 'cancelled';
  booksyBookingId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  service: string | null;
  barber: string | null;
  date: string | null;   // YYYY-MM-DD
  time: string | null;   // HH:MM (start time)
  duration: number | null; // minutes, derived from time range
  price: number | null;   // euros as integer (e.g. 25 for 25,00 €)
}

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

function detectType(subject: string): BooksyBookingData['type'] | null {
  const s = subject.toLowerCase();
  if (/cancelad|cancelled|cancelacion/.test(s)) return 'cancelled';
  if (/modificad|modified|cambiad|reprogramad/.test(s)) return 'modified';
  if (/confirmad|nueva reserva|new appointment|reserva confirmada/.test(s)) return 'new';
  return null;
}

function parseDate(textBody: string): { date: string; time: string; duration: number } | null {
  const regex = /(\w+),\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4}),\s+(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/i;
  const match = textBody.match(regex);
  if (!match) return null;

  const day = parseInt(match[2], 10);
  const monthName = match[3].toLowerCase();
  const year = parseInt(match[4], 10);
  const startTime = match[5]; // e.g. "16:40"
  const endTime = match[6];   // e.g. "17:25"

  const month = MONTHS[monthName];
  if (!month) return null;

  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const duration = endH * 60 + endM - (startH * 60 + startM);

  return { date, time: startTime, duration };
}

function parseBarber(textBody: string): string | null {
  const match = textBody.match(/con\s+([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]+)/);
  if (!match) return null;
  return match[1].trim();
}

function parsePrice(textBody: string): number | null {
  const match = textBody.match(/([\d]+)[,.](\d{2})\s*€/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

function parseService(textBody: string): string | null {
  // Boilerplate patterns to skip
  const boilerplate = /^(AGENDALO|OTRACITA|BOOKSY|CONFIRMAD|CANCELAD|MODIFICAD|RESERVA|CITA|BOOKING|WWW\.|HTTP|UNSUBSCRIBE|DARSE DE BAJA)/i;

  const lines = textBody.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length < 10) continue;
    if (line !== line.toUpperCase()) continue; // must be all uppercase
    if (boilerplate.test(line)) continue;
    if (/^\d/.test(line)) continue; // skip lines starting with digits (prices, times)
    return line;
  }
  return null;
}

function parseBookingId(textBody: string): string | null {
  const match = textBody.match(/(?:reserva|booking|cita|#)\s*(?:n[uú]mero\s*)?[:#]?\s*(\d{5,12})/i);
  return match ? match[1] : null;
}

function parseCustomerPhone(textBody: string): string | null {
  const match = textBody.match(/(?:tel[eé]fono|phone|móvil|tel\.?)\s*:?\s*(\+?[\d\s\-]{9,15})/i);
  return match ? match[1].trim() : null;
}

function parseCustomerName(textBody: string): string | null {
  const match = textBody.match(/(?:cliente|customer|nombre|name)\s*:?\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ\s]+)/i);
  return match ? match[1].trim() : null;
}

export function parseBooksyEmail(subject: string, textBody: string): BooksyBookingData | null {
  const type = detectType(subject);
  if (!type) return null;

  const dateInfo = parseDate(textBody);

  return {
    type,
    booksyBookingId: parseBookingId(textBody),
    customerName: parseCustomerName(textBody),
    customerPhone: parseCustomerPhone(textBody),
    service: parseService(textBody),
    barber: parseBarber(textBody),
    date: dateInfo?.date ?? null,
    time: dateInfo?.time ?? null,
    duration: dateInfo?.duration ?? null,
    price: parsePrice(textBody),
  };
}
