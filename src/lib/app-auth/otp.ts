import { createHash, randomInt } from 'node:crypto'
import { db } from '@/db'
import { appOtpCodes } from '@/db/schema'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { MS_IN_MINUTE } from '@/lib/time'

// -----------------------------------------------------------------------------
// OTP helpers for PWA login. Codes are 6 digits, 10-minute lifetime, stored
// as SHA-256 hashes. Verification increments an attempts counter — after 5
// wrong tries the code is consumed so brute force is capped at 10⁶/5 which
// is basically impossible inside the 10-minute window.
// -----------------------------------------------------------------------------

const OTP_LIFETIME_MINUTES = 10
const MAX_ATTEMPTS = 5

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

export function generateCode(): string {
  // randomInt gives a uniformly random 0..999999; pad to 6 digits.
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export async function storeCode(opts: {
  phone: string
  clientId: string
  code: string
}): Promise<void> {
  const expiresAt = new Date(Date.now() + OTP_LIFETIME_MINUTES * MS_IN_MINUTE)
  await db.insert(appOtpCodes).values({
    phone: opts.phone,
    clientId: opts.clientId,
    codeHash: hashCode(opts.code),
    expiresAt,
  })
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'expired' | 'invalid' | 'too_many_attempts' | 'not_found' }

export async function verifyCode(phone: string, code: string): Promise<VerifyResult> {
  // Pick the latest non-consumed code for this phone that isn't expired.
  const rows = await db
    .select()
    .from(appOtpCodes)
    .where(
      and(
        eq(appOtpCodes.phone, phone),
        isNull(appOtpCodes.consumedAt),
        gt(appOtpCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(appOtpCodes.createdAt)
  if (rows.length === 0) return { ok: false, reason: 'not_found' }
  const row = rows[rows.length - 1]

  if (row.attempts >= MAX_ATTEMPTS) {
    await db
      .update(appOtpCodes)
      .set({ consumedAt: new Date() })
      .where(eq(appOtpCodes.id, row.id))
    return { ok: false, reason: 'too_many_attempts' }
  }

  if (hashCode(code) !== row.codeHash) {
    await db
      .update(appOtpCodes)
      .set({ attempts: row.attempts + 1 })
      .where(eq(appOtpCodes.id, row.id))
    return { ok: false, reason: 'invalid' }
  }

  // Success: consume so it can't be reused.
  await db
    .update(appOtpCodes)
    .set({ consumedAt: new Date() })
    .where(eq(appOtpCodes.id, row.id))
  return { ok: true }
}
