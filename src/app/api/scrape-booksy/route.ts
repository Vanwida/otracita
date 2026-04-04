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

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'es-ES,es;q=0.9',
      },
    });

    if (!res.ok) {
      return Response.json({ error: 'No se pudo acceder a la página de Booksy' }, { status: 400 });
    }

    const html = await res.text();

    // Extract structured data (JSON-LD) — Booksy embeds service data as Schema.org
    const services: Array<{ name: string; duration: number; price: number }> = [];

    // Extract service names and prices from JSON-LD patterns
    const serviceMatches = html.matchAll(/"name":"([^"]+)","priceCurrency":"([A-Z]+)","price":(\d+)/g);
    for (const match of serviceMatches) {
      const rawName = match[1];
      const price = parseInt(match[3]);

      // Skip if it looks like a business name, not a service
      if (rawName.length > 80) continue;

      services.push({
        name: rawName,
        duration: estimateDuration(rawName),
        price,
      });
    }

    // Extract business name
    const nameMatch = html.match(/"name":"([^"]+)","@type":"LocalBusiness"/);
    const businessName = nameMatch ? nameMatch[1] : '';

    // Extract address
    const addressMatch = html.match(/"streetAddress":"([^"]+)"/);
    const postalMatch = html.match(/"postalCode":"([^"]+)"/);
    const cityMatch = html.match(/"addressLocality":"([^"]+)"/);
    const address = [
      addressMatch?.[1],
      postalMatch?.[1],
      cityMatch?.[1],
    ].filter(Boolean).join(', ');

    // Extract phone
    const phoneMatch = html.match(/"telephone":"([^"]+)"/);
    const phone = phoneMatch ? phoneMatch[1] : '';

    // If we got services from structured data, clean them with Grok
    if (services.length > 0) {
      try {
        const completion = await grok.chat.completions.create({
          model: 'grok-4-1-fast-non-reasoning',
          messages: [
            {
              role: 'system',
              content: `Clean these barbershop service names. Return ONLY a JSON array. Rules:
- Remove English translations (after / or in parentheses)
- Remove ALL CAPS, use normal capitalization
- Keep it short and clear in Spanish
- Remove marketing text, keep just the service name
- Estimate duration if not obvious from name

Input format: [{"name":"...", "price":N, "duration":N}]
Output format: [{"name":"cleaned name", "price":N, "duration":N}]`,
            },
            { role: 'user', content: JSON.stringify(services) },
          ],
          max_tokens: 1000,
          temperature: 0,
        });

        const content = completion.choices[0].message.content || '';
        const match = content.match(/\[[\s\S]*\]/);
        if (match) {
          const cleaned = JSON.parse(match[0]);
          return Response.json({
            businessName,
            address,
            phone,
            services: cleaned,
            barbers: [],
            hours: null,
          });
        }
      } catch {
        // Grok failed, return raw services
      }
    }

    return Response.json({
      businessName,
      address,
      phone,
      services,
      barbers: [],
      hours: null,
    });
  } catch (error) {
    console.error('Scrape error:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return Response.json({ error: message }, { status: 500 });
  }
}

function estimateDuration(name: string): number {
  const lower = name.toLowerCase();
  if (lower.includes('ritual') || lower.includes('presidencial')) return 60;
  if (lower.includes('tint') || lower.includes('color') || lower.includes('mech')) return 60;
  if (lower.includes('barba') && lower.includes('corte')) return 50;
  if (lower.includes('barba')) return 25;
  if (lower.includes('cejas')) return 10;
  if (lower.includes('depilacion') || lower.includes('wax')) return 10;
  if (lower.includes('premium') || lower.includes('asesoria')) return 45;
  if (lower.includes('largo')) return 45;
  if (lower.includes('corte')) return 35;
  return 30;
}
