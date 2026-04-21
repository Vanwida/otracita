import OpenAI from 'openai';
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

const grok = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
});

// Scrape-booksy hits Grok twice per request and issues outbound fetches. We
// cap it tight — 5 attempts per minute per tenant is more than enough for
// manual onboarding flows and nowhere near abuse territory.
const SCRAPE_BOOKSY_MAX_PER_MINUTE = 5;

const FETCH_TIMEOUT_MS = 15_000;
const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'es-ES,es;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
} as const;

function isBooksyUrl(input: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  return host === 'booksy.com' || host.endsWith('.booksy.com');
}

async function fetchBooksyPage(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: SCRAPE_HEADERS, signal: controller.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface ScrapeResult {
  businessName: string;
  address: string;
  phone: string;
  services: Array<{ name: string; duration: number; price: number }>;
  barbers: string[];
  hours: null;
}

function emptyResult(partial: Partial<ScrapeResult> = {}): ScrapeResult {
  return {
    businessName: partial.businessName ?? '',
    address: partial.address ?? '',
    phone: partial.phone ?? '',
    services: partial.services ?? [],
    barbers: partial.barbers ?? [],
    hours: null,
  };
}

export async function POST(request: Request) {
  const access = await requireClientAccess(request);
  if (!access.ok) return accessErrorResponse(access);

  // Rate-limit by tenant (not user) so a malicious admin impersonating a
  // client can't burn a different tenant's budget. The key namespace is
  // explicit (`:scrape`) so we can share the limiter map across endpoints.
  const limit = checkRateLimit(
    `${access.client.id}:scrape`,
    SCRAPE_BOOKSY_MAX_PER_MINUTE,
  );
  if (!limit.ok) return rateLimitResponse(limit);

  const { url } = await request.json().catch(() => ({ url: '' }));

  if (!url || !isBooksyUrl(url)) {
    return Response.json({ error: 'URL de Booksy no válida' }, { status: 400 });
  }

  const html = await fetchBooksyPage(url);
  if (!html) {
    return Response.json({ error: 'No se pudo acceder a la página de Booksy' }, { status: 400 });
  }

  // Primary path: extract string table from the Nuxt bundle and let Grok structure it.
  // Booksy uses an obfuscated Nuxt bundle so regex won't work directly on service data.
  const stringMatches = [...html.matchAll(/"([^"\\]{2,100})"/g)].map((m) => m[1]);
  const unique = [...new Set(stringMatches)];
  const relevant = unique
    .filter(
      (s) =>
        /[A-ZÁÉÍÓÚ]/.test(s[0]) ||  // Starts with capital (names)
        /^\d{1,3}$/.test(s) ||       // Short number (prices)
        s.includes(',') ||            // Address-like
        /\d{2}:\d{2}/.test(s),        // Time
    )
    .slice(0, 400);

  try {
    const completion = await grok.chat.completions.create({
      model: 'grok-4-1-fast-non-reasoning',
      messages: [
        {
          role: 'system',
          content: `You are a data extractor for a barbershop booking app. You will receive raw strings extracted from a Booksy barbershop page. Extract the business data.

Return ONLY valid JSON, no markdown:
{
  "businessName": "string",
  "address": "full address string",
  "phone": "phone number",
  "services": [
    { "name": "clean Spanish service name", "duration": number_minutes, "price": number_euros }
  ]
}

Rules:
- Include ALL barbershop services (cortes, barbas, rituales, etc.)
- name: short clean Spanish, no ALL CAPS, no English translations, no marketing text
- duration: estimate if not listed (corte: 30, barba: 20, corte+barba: 50, ritual/premium: 60)
- price: integer euros
- Deduplicate
- Return empty array if no services found`,
        },
        {
          role: 'user',
          content: `Booksy URL: ${url}\n\nExtracted page strings:\n${relevant.join('\n')}`,
        },
      ],
      max_tokens: 2000,
      temperature: 0,
    });

    const content = completion.choices[0].message.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[scrape-booksy] Grok response had no JSON:', content.slice(0, 300));
      return fallbackFromHtml(url, html);
    }

    const data = JSON.parse(jsonMatch[0]);
    return Response.json(
      emptyResult({
        businessName: data.businessName,
        address: data.address,
        phone: data.phone,
        services: Array.isArray(data.services) ? data.services : [],
      }),
    );
  } catch (error) {
    console.error('[scrape-booksy] primary path failed:', error);
    return fallbackFromHtml(url, html);
  }
}

// ---------------------------------------------------------------------------
// Fallback: pull JSON-LD hints + candidate service names from HTML, then let
// Grok clean them up. Same fetched HTML — no second network request.
// ---------------------------------------------------------------------------

const BARBERSHOP_TERMS = [
  'corte', 'barba', 'afeitado', 'ritual', 'premium', 'cejas', 'depil',
  'tinte', 'color', 'navaja', 'fading', 'fade', 'degradado', 'pelo', 'cabello',
];

async function fallbackFromHtml(url: string, html: string): Promise<Response> {
  const businessName = html.match(/"businessName":"([^"]+)"/)?.[1] || '';
  const address = html.match(/"streetAddress":"([^"]+)"/)?.[1] || '';
  const phone = html.match(/"telephone":"([^"]+)"/)?.[1] || '';

  const nameMatches = html.matchAll(/"([A-ZÁÉÍÓÚ][a-záéíóúüñ][a-záéíóúüñA-ZÁÉÍÓÚ\s\+\&\/\-]{4,60})"/g);
  const candidates: string[] = [];
  for (const m of nameMatches) {
    const name = m[1];
    if (BARBERSHOP_TERMS.some((t) => name.toLowerCase().includes(t))) {
      candidates.push(name);
    }
  }
  const dedupedCandidates = [...new Set(candidates)].slice(0, 30);

  if (dedupedCandidates.length === 0) {
    return Response.json(emptyResult({ businessName, address, phone }));
  }

  try {
    const cleaning = await grok.chat.completions.create({
      model: 'grok-4-1-fast-non-reasoning',
      messages: [
        {
          role: 'system',
          content: `From this list of candidate strings extracted from a barbershop page, identify which ones are actual services and return them cleaned.
Return ONLY a JSON array: [{"name":"clean Spanish name","duration":number,"price":0}]
Rules: clean capitalization, remove duplicates, only real barbershop services.`,
        },
        { role: 'user', content: `Booksy URL: ${url}\n\n${JSON.stringify(dedupedCandidates)}` },
      ],
      max_tokens: 800,
      temperature: 0,
    });
    const c = cleaning.choices[0].message.content || '';
    const match = c.match(/\[[\s\S]*\]/);
    if (match) {
      const services = JSON.parse(match[0]);
      return Response.json(emptyResult({ businessName, address, phone, services }));
    }
  } catch (error) {
    console.error('[scrape-booksy] fallback cleaning failed:', error);
  }

  return Response.json(emptyResult({ businessName, address, phone }));
}
