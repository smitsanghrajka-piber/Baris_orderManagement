import { AsyncLocalStorage } from 'async_hooks';
import { ActorType } from '@prisma/client';

/**
 * Per-request actor context, captured once by AuditContextInterceptor and
 * read by AuditService / the Prisma audit extension. Scheduled jobs and
 * webhooks call runWithContext() with an explicit SYSTEM / MES actor.
 */
export interface AuditContext {
  actorType: ActorType;
  actorId?: string | null;
  actorName?: string | null;
  actorCustomerId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export const auditContextStorage = new AsyncLocalStorage<AuditContext>();

export const SYSTEM_CONTEXT: AuditContext = { actorType: 'SYSTEM', actorName: 'system' };

export function getAuditContext(): AuditContext {
  return auditContextStorage.getStore() ?? SYSTEM_CONTEXT;
}

export function runWithContext<T>(ctx: AuditContext, fn: () => Promise<T>): Promise<T> {
  return auditContextStorage.run(ctx, fn);
}
