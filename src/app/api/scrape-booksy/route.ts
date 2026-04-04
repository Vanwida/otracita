import OpenAI from 'openai';

const grok = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
});

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url || !url.includes('booksy.com')) {
      return Response.json({ error: 'URL de Booksy no válida' }, { status: 400 });
    }

    // Fetch the page HTML ourselves, then send it to Grok for extraction.
    // Booksy uses an obfuscated Nuxt bundle so regex won't work — Grok reads the raw text.
    const pageRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!pageRes.ok) {
      return Response.json({ error: 'No se pudo acceder a la página de Booksy' }, { status: 400 });
    }

    const html = await pageRes.text();

    // Extract the string table from the Nuxt bundle — all literal strings are in the last
    // function call arguments, separated by commas. We pull every quoted string and send
    // the most relevant ones to Grok.
    const stringMatches = [...html.matchAll(/"([^"\\]{2,100})"/g)].map(m => m[1]);
    const unique = [...new Set(stringMatches)];

    // Keep strings that look like service names, prices, addresses, or business names
    const relevant = unique.filter(s =>
      /[A-ZÁÉÍÓÚ]/.test(s[0]) || // Starts with capital (names)
      /^\d{1,3}$/.test(s) ||      // Short number (prices)
      s.includes(',') ||           // Address-like
      /\d{2}:\d{2}/.test(s)       // Time
    ).slice(0, 400); // Cap at 400 strings to stay within token budget

    const completion = await grok.chat.completions.create({
      model: 'grok-3-fast',
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
      console.error('Grok response had no JSON:', content.slice(0, 300));
      return Response.json({ error: 'No se pudo extraer la información de Booksy' }, { status: 400 });
    }

    const data = JSON.parse(jsonMatch[0]);

    return Response.json({
      businessName: data.businessName || '',
      address: data.address || '',
      phone: data.phone || '',
      services: Array.isArray(data.services) ? data.services : [],
      barbers: [],
      hours: null,
    });

  } catch (error) {
    console.error('Scrape error:', error);

    // Fallback: try raw HTML extraction if Grok fails
    try {
      const { url } = await request.clone().json();
      return await fallbackHtmlScrape(url);
    } catch {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      return Response.json({ error: message }, { status: 500 });
    }
  }
}

// ---------------------------------------------------------------------------
// Fallback: raw HTML + Grok cleaning (original approach, kept as safety net)
// ---------------------------------------------------------------------------

async function fallbackHtmlScrape(url: string) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'es-ES,es;q=0.9',
    },
  });

  if (!res.ok) {
    return Response.json({ error: 'No se pudo acceder a la página de Booksy' }, { status: 400 });
  }

  const html = await res.text();

  // Try to pull readable service text from the Nuxt bundle
  // Booksy stores strings as args to a function — we can grep for capitalized Spanish words
  const nameMatches = html.matchAll(/"([A-ZÁÉÍÓÚ][a-záéíóúüñ][a-záéíóúüñA-ZÁÉÍÓÚ\s\+\&\/\-]{4,60})"/g);
  const candidates: string[] = [];
  const barbershopTerms = ['corte', 'barba', 'afeitado', 'ritual', 'premium', 'cejas', 'depil', 'tinte', 'color', 'navaja', 'fading', 'fade', 'degradado', 'pelo', 'cabello'];

  for (const m of nameMatches) {
    const name = m[1];
    if (barbershopTerms.some(t => name.toLowerCase().includes(t))) {
      candidates.push(name);
    }
  }

  const dedupedCandidates = [...new Set(candidates)].slice(0, 30);

  const businessName = html.match(/"businessName":"([^"]+)"/)?.[1] || '';
  const address = html.match(/"streetAddress":"([^"]+)"/)?.[1] || '';
  const phone = html.match(/"telephone":"([^"]+)"/)?.[1] || '';

  if (dedupedCandidates.length === 0) {
    return Response.json({ businessName, address, phone, services: [], barbers: [], hours: null });
  }

  // Clean with Grok
  try {
    const cleaning = await grok.chat.completions.create({
      model: 'grok-3-fast',
      messages: [
        {
          role: 'system',
          content: `From this list of candidate strings extracted from a barbershop page, identify which ones are actual services and return them cleaned.
Return ONLY a JSON array: [{"name":"clean Spanish name","duration":number,"price":0}]
Rules: clean capitalization, remove duplicates, only real barbershop services.`,
        },
        { role: 'user', content: JSON.stringify(dedupedCandidates) },
      ],
      max_tokens: 800,
      temperature: 0,
    });
    const c = cleaning.choices[0].message.content || '';
    const match = c.match(/\[[\s\S]*\]/);
    if (match) {
      const services = JSON.parse(match[0]);
      return Response.json({ businessName, address, phone, services, barbers: [], hours: null });
    }
  } catch { /* ignore */ }

  return Response.json({ businessName, address, phone, services: [], barbers: [], hours: null });
}
