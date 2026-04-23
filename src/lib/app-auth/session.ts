import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { db } from '@/db'
import { appSessions, appUsers } from '@/db/schema'
import { and, eq, gt } from 'drizzle-orm'

// -----------------------------------------------------------------------------
// PWA customer sessions.
//
//  · Session token = 32 random bytes hex (64 chars). Stored in an httpOnly
//    cookie; we store only its SHA-256 hash in the DB so a DB dump doesn't
//    give an attacker a bag of valid tokens.
//  · Cookie name: "otracita_app_session" — scoped to the whole domain so the
//    same session works across any /b/<slug> the customer visits.
//  · Lifetime: 90 days sliding (lastUsedAt refreshed on each auth check).
// -----------------------------------------------------------------------------

const COOKIE_NAME = 'otracita_app_session'
const SESSION_DAYS = 90

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function createSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('hex')
  return { token, tokenHash: sha256(token) }
}

export interface AppSessionContext {
  userId: string
  phone: string
  name: string | null
  email: string | null
}

export async function issueAppSession(opts: {
  userId: string
  clientId?: string | null
  userAgent?: string | null
}): Promise<string> {
  const { token, tokenHash } = createSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)

  await db.insert(appSessions).values({
    userId: opts.userId,
    tokenHash,
    clientId: opts.clientId ?? null,
    userAgent: opts.userAgent ?? null,
    expiresAt,
  })

  const jar = await cookies()
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })

  return token
}

export async function getAppSession(): Promise<AppSessionContext | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) return null

  const tokenHash = sha256(token)
  const [row] = await db
    .select()
    .from(appSessions)
    .innerJoin(appUsers, eq(appSessions.userId, appUsers.id))
    .where(
      and(
        eq(appSessions.tokenHash, tokenHash),
        gt(appSessions.expiresAt, new Date()),
      ),
    )
  if (!row) return null

  // Sliding expiry: touch lastUsedAt (best-effort, don't await to keep the
  // read path fast).
  db.update(appSessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(appSessions.id, row.app_sessions.id))
    .catch(() => { /* ignore */ })

  return {
    userId: row.app_users.id,
    phone: row.app_users.phone,
    name: row.app_users.name,
    email: row.app_users.email,
  }
}

export async function destroyAppSession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (token) {
    await db.delete(appSessions).where(eq(appSessions.tokenHash, sha256(token)))
  }
  jar.delete(COOKIE_NAME)
}
