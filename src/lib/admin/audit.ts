import { db } from '@/db';
import { adminActions } from '@/db/schema';
import { desc, eq, and } from 'drizzle-orm';

/**
 * Audit log for admin operations. Every mutation that an admin triggers
 * from the panel — pausing a client, extending a trial, converting a lead,
 * changing a status — calls `logAdminAction` so we can answer "who did what
 * and when" without grepping application logs that eventually rotate out.
 *
 * Never throws: a failed audit log must not block the underlying action.
 * Worst case the action succeeds but doesn't show up in the log — preferable
 * to a successful audit and a failed mutation.
 */

export interface LogAdminActionArgs {
  adminEmail: string;
  /** Verb-like identifier, matches the server-action `intent` strings used in the UI. */
  intent: string;
  /** What kind of thing this acted on. */
  targetType: 'client' | 'lead' | 'invoice' | 'system';
  /** UUID or stable identifier of the target. May be null for system-wide actions. */
  targetId?: string | null;
  /** Short, humane sentence — shown in the audit log table. */
  summary: string;
  /** Optional before/after snapshot or extra context. Stored as jsonb. */
  metadata?: Record<string, unknown>;
}

export async function logAdminAction(args: LogAdminActionArgs): Promise<void> {
  try {
    await db.insert(adminActions).values({
      adminEmail: args.adminEmail,
      intent: args.intent,
      targetType: args.targetType,
      targetId: args.targetId ?? null,
      summary: args.summary,
      metadata: args.metadata ?? null,
    });
  } catch (err) {
    // Never throw — log to stderr and move on so the original action isn't blocked.
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[audit] logAdminAction failed:', msg, args);
  }
}

export interface AdminActionRow {
  id: string;
  adminEmail: string;
  intent: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  createdAt: Date;
}

/**
 * Most recent admin actions. Optionally scoped to a specific target so the
 * client detail page can show "what's been done to THIS tenant lately".
 */
export async function getRecentAdminActions({
  limit = 30,
  targetType,
  targetId,
}: {
  limit?: number;
  targetType?: string;
  targetId?: string;
} = {}): Promise<AdminActionRow[]> {
  const wheres = [];
  if (targetType) wheres.push(eq(adminActions.targetType, targetType));
  if (targetId) wheres.push(eq(adminActions.targetId, targetId));
  const where = wheres.length === 0 ? undefined : wheres.length === 1 ? wheres[0] : and(...wheres);

  return db
    .select({
      id: adminActions.id,
      adminEmail: adminActions.adminEmail,
      intent: adminActions.intent,
      targetType: adminActions.targetType,
      targetId: adminActions.targetId,
      summary: adminActions.summary,
      createdAt: adminActions.createdAt,
    })
    .from(adminActions)
    .where(where)
    .orderBy(desc(adminActions.createdAt))
    .limit(limit);
}
