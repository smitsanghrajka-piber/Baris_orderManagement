import { Injectable } from '@nestjs/common';
import { ActorType, Prisma, Visibility } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { getAuditContext } from './audit-context';
import { redactSecrets } from './redact';

export interface RecordAuditInput {
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

export interface PostActivityInput {
  entityType: string;
  entityId: string;
  customerId?: string | null;
  verb: string;
  summary: string;
  meta?: Record<string, unknown>;
  visibility?: Visibility;
}

/**
 * Explicit audit + activity writes for the mandatory business actions
 * (architecture §12). Always pass the transaction client so the audit row
 * commits or rolls back with the business change.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(tx: Tx | PrismaService, input: RecordAuditInput) {
    const ctx = getAuditContext();
    await tx.auditLog.create({
      data: {
        actorType: ctx.actorType,
        actorId: ctx.actorId ?? null,
        actorName: ctx.actorName ?? null,
        actorCustomerId: ctx.actorCustomerId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        before: input.before === undefined ? undefined : (redactSecrets(input.before) as Prisma.InputJsonValue),
        after: input.after === undefined ? undefined : (redactSecrets(input.after) as Prisma.InputJsonValue),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        requestId: ctx.requestId ?? null,
      },
    });
  }

  async activity(tx: Tx | PrismaService, input: PostActivityInput) {
    const ctx = getAuditContext();
    await tx.activity.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        customerId: input.customerId ?? null,
        actorType: ctx.actorType,
        actorId: ctx.actorId ?? null,
        actorName: ctx.actorName ?? 'system',
        verb: input.verb,
        summary: input.summary,
        meta: (input.meta ?? undefined) as Prisma.InputJsonValue | undefined,
        visibility: input.visibility ?? 'INTERNAL',
      },
    });
  }

  /** Record + activity in one call for the common case. */
  async recordWithActivity(tx: Tx | PrismaService, audit: RecordAuditInput, activity: Omit<PostActivityInput, 'entityType' | 'entityId'>) {
    await this.record(tx, audit);
    await this.activity(tx, { entityType: audit.entityType, entityId: audit.entityId, ...activity });
  }

  /** Access-denied events are audited from the guard (no transaction). */
  async accessDenied(input: { entityType?: string; entityId?: string; reason: string; permission?: string; path?: string }) {
    try {
      const ctx = getAuditContext();
      await this.prisma.auditLog.create({
        data: {
          actorType: ctx.actorType as ActorType,
          actorId: ctx.actorId ?? null,
          actorName: ctx.actorName ?? null,
          actorCustomerId: ctx.actorCustomerId ?? null,
          action: 'ACCESS_DENIED',
          entityType: input.entityType ?? 'Route',
          entityId: input.entityId ?? input.path ?? '',
          after: { reason: input.reason, permission: input.permission ?? null, path: input.path ?? null },
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
          requestId: ctx.requestId ?? null,
        },
      });
    } catch {
      /* never fail the request because the denial could not be logged */
    }
  }
}
