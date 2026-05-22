import { NextResponse, type NextRequest } from 'next/server';

const SHORT_HOSTS = new Set(['otracita.es', 'www.otracita.es']);

const RESERVED_SLUGS = new Set([
  'admin',
  'ajustes',
  'api',
  'app',
  'auth',
  'account',
  'aviso-legal',
  'billing',
  'dashboard',
  'gracias',
  'legal',
  'login',
  'manifest',
  'pay',
  'privacidad',
  'setup',
  'signup',
  'terminos',
]);

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;

export function proxy(request: NextRequest) {
  const host = request.headers.get('host')?.toLowerCase();
  if (!host || !SHORT_HOSTS.has(host)) return;

  const { pathname, search } = request.nextUrl;

  if (pathname === '/' || pathname === '') {
    return NextResponse.redirect('https://otracita.es/', { status: 302 });
  }

  const trimmed = pathname.replace(/^\/+/, '');
  const [slug, ...rest] = trimmed.split('/');
  const tail = rest.length ? `/${rest.join('/')}` : '';

  if (RESERVED_SLUGS.has(slug)) {
    return NextResponse.redirect(
      `https://otracita.es/${trimmed}${search}`,
      { status: 302 },
    );
  }

  if (!SLUG_REGEX.test(slug)) {
    return NextResponse.redirect('https://otracita.es/', { status: 302 });
  }

  return NextResponse.redirect(
    `https://otracita.es/${slug}${tail}${search}`,
    { status: 302 },
  );
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|robots.txt|sitemap.xml).*)'],
};
