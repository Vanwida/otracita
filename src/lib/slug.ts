import { db } from '@/db';
import { clients } from '@/db/schema';
import { eq } from 'drizzle-orm';

// -----------------------------------------------------------------------------
// Slug helpers for /b/[slug] public booking pages.
//
// Conventions:
//   · URL-safe: [a-z0-9-], no leading/trailing hyphens, no double hyphens.
//   · Globally unique across clients.
//   · Reserved words (admin, api, dashboard…) blocked so a barber can't
//     accidentally shadow a real route.
//   · Min 3 chars, max 60.
// -----------------------------------------------------------------------------

const RESERVED = new Set([
  'admin',
  'api',
  'dashboard',
  'login',
  'signup',
  'logout',
  'privacidad',
  'terminos',
  'aviso-legal',
  'gracias',
  'pay',
  'pricing',
  'b',
  'settings',
  'help',
  'ayuda',
  'legal',
  'press',
  'about',
  'contact',
  'support',
  'status',
  'robots',
  'sitemap',
  'otracita',
]);

const ACCENTS_SRC = 'áàäâãåéèëêíìïîóòöôõúùüûñçª°·/\\,.:;()!?¿¡"\'`';
const ACCENTS_REP = 'aaaaaaeeeeiiiiooooouuuunc                  ';

/** Build a raw slug from a display name (NOT guaranteed unique). */
export function slugifyName(name: string): string {
  const lower = (name || '').toLowerCase().trim();
  // Replace accents + punctuation with their ASCII equivalent or a space.
  let out = '';
  for (const ch of lower) {
    const idx = ACCENTS_SRC.indexOf(ch);
    out += idx >= 0 ? ACCENTS_REP[idx] : ch;
  }
  // Collapse anything non-alphanumeric to hyphens, trim and dedupe.
  return out
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 60);
}

export function isValidSlug(slug: string): boolean {
  if (!slug || slug.length < 3 || slug.length > 60) return false;
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) return false;
  if (slug.includes('--')) return false;
  if (RESERVED.has(slug)) return false;
  return true;
}

/**
 * Return `slug` if it's free for `clientId`, else append `-N` until it is.
 * Callers use this to validate user-provided edits or to generate one from
 * the business name on signup. `clientId` may be null during signup.
 */
export async function ensureUniqueSlug(
  slug: string,
  clientId: string | null,
): Promise<string> {
  if (!slug) throw new Error('slug empty');
  let candidate = slug;
  let n = 1;
  while (n < 100) {
    const existing = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.publicSlug, candidate));
    const conflict = clientId
      ? existing.find((r) => r.id !== clientId)
      : existing[0];
    if (!conflict) return candidate;
    n++;
    candidate = `${slug}-${n}`;
  }
  throw new Error('could not generate unique slug');
}

/** One-shot for new clients: slugify + append random suffix to avoid collisions. */
export function generateInitialSlug(businessName: string, seed: string): string {
  const base = slugifyName(businessName) || 'barberia';
  const hash = seed
    .replace(/-/g, '')
    .slice(0, 6)
    .toLowerCase();
  return `${base}-${hash}`;
}
