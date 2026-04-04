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

    // Use Grok with live web search to extract structured data from the Booksy page.
    // This avoids the obfuscated Nuxt bundle problem with raw HTML parsing.
    const completion = await grok.chat.completions.create({
      model: 'grok-3-fast',
      messages: [
        {
          role: 'system',
          content: `You are a data extractor. Visit the given Booksy URL and extract the business data.
Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "businessName": "string",
  "address": "string",
  "phone": "string",
  "services": [
    { "name": "service name in Spanish, clean and short", "duration": number_minutes, "price": number_euros }
  ]
}

Rules for services:
- Include ALL services listed on the page
- name: clean Spanish name, remove English translations, remove ALL CAPS, no marketing text
- duration: estimate in minutes if not shown (corte: 30, barba: 20, corte+barba: 50, ritual/premium: 60)
- price: integer euros (0 if free or not shown)
- Deduplicate identical services`,
        },
        {
          role: 'user',
          content: `Extract all business data and services from this Booksy page: ${url}`,
        },
      ],
      // @ts-expect-error — xAI live_search extension
      search_parameters: {
        mode: 'on',
        sources: [{ type: 'web' }],
      },
      max_tokens: 2000,
      temperature: 0,
    });

    const content = completion.choices[0].message.content || '';

    // Extract JSON from response
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
