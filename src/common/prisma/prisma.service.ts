import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';
import { getAuditContext } from '../audit/audit-context';
import { changedFields, redactSecrets } from '../audit/redact';
import { DomainError } from '../errors/domain-error';

/**
 * Models whose create/update/delete are diffed automatically into audit_log
 * (architecture §12). Explicit AuditService.record() calls in services cover
 * the mandatory business actions in addition to this.
 */
export const AUDITED_MODELS = new Set<string>([
  'User', 'UserRole', 'Role', 'RolePermission', 'CustomerUserRole',
  'Customer', 'CustomerContact', 'CustomerSite', 'CustomerUser',
  'CustomerSku', 'SpecificationVersion', 'SpecificationColour',
  'Tool', 'PlateSet', 'ProductionRoute', 'ProductionRouteStep', 'ChecklistTemplate', 'ChecklistTemplateItem',
  'NotificationRule', 'CompanySettings', 'NumberSequence',
  'File', 'Attachment', 'GeneratedDocument',
]);

/** Models that must never be hard-deleted through the ORM. */
export const DELETE_PROTECTED_MODELS = new Set<string>([
  'Customer', 'CustomerContact', 'CustomerSite', 'CustomerUser', 'CustomerSku', 'SpecificationVersion',
  'File', 'GeneratedDocument', 'AuditLog', 'Activity', 'NumberSequence', 'CompanySettings',
]);

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * The interactive-transaction client currently executing on this async
 * path, if any. PrismaService.$transaction() sets it so the audit hooks
 * below read "before" state and write audit rows on the SAME connection as
 * the business mutation. Without this every hook inside a transaction would
 * borrow a second pooled connection: under load the pool fills with
 * transactions each waiting for a connection none of them will release, and
 * audit rows would also commit even when the transaction rolls back.
 */
const txStorage = new AsyncLocalStorage<Prisma.TransactionClient>();

/**
 * Prisma client extension: before/after diff on registered models, refusal
 * of hard deletes on protected models. Audit rows are written through the
 * current transaction client (or the base client outside a transaction);
 * AuditLog itself is not an audited model so the hook never recurses.
 * Writes are best-effort and never fail the business mutation.
 */
export function auditExtension(base: PrismaClient) {
  const log = new Logger('PrismaAudit');
  const current = (): Prisma.TransactionClient | PrismaClient => txStorage.getStore() ?? base;

  async function writeAudit(model: string, verb: string, before: unknown, after: unknown, entityId: string | null) {
    try {
      const ctx = getAuditContext();
      const b = before ? (redactSecrets(before) as Record<string, unknown>) : null;
      const a = after ? (redactSecrets(after) as Record<string, unknown>) : null;
      if (verb === 'UPDATE' && b && a && changedFields(b, a).length === 0) return;
      await current().auditLog.create({
        data: {
          actorType: ctx.actorType,
          actorId: ctx.actorId ?? null,
          actorName: ctx.actorName ?? null,
          actorCustomerId: ctx.actorCustomerId ?? null,
          action: `${model.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}_${verb}`,
          entityType: model,
          entityId: entityId ?? '',
          before: b as Prisma.InputJsonValue | undefined,
          after: a as Prisma.InputJsonValue | undefined,
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
          requestId: ctx.requestId ?? null,
        },
      });
    } catch (err) {
      log.warn(`audit write failed for ${model} ${verb}: ${(err as Error).message}`);
    }
  }

  const entityIdOf = (row: any): string | null => {
    if (!row) return null;
    if (row.id !== undefined) return String(row.id);
    const keys = Object.keys(row).filter((k) => k.endsWith('Id'));
    return keys.length ? keys.map((k) => `${k}=${row[k]}`).join(',') : null;
  };

  return Prisma.defineExtension({
    name: 'audit',
    query: {
      $allModels: {
        async create({ model, args, query }) {
          const result = await query(args);
          if (AUDITED_MODELS.has(model)) await writeAudit(model, 'CREATE', null, result, entityIdOf(result));
          return result;
        },
        async update({ model, args, query }) {
          let before: unknown = null;
          if (AUDITED_MODELS.has(model)) {
            try { before = await (current() as any)[lowerFirst(model)].findUnique({ where: (args as any).where }); } catch { /* ignore */ }
          }
          const result = await query(args);
          if (AUDITED_MODELS.has(model)) await writeAudit(model, 'UPDATE', before, result, entityIdOf(result) ?? entityIdOf(before));
          return result;
        },
        async upsert({ model, args, query }) {
          let before: unknown = null;
          if (AUDITED_MODELS.has(model)) {
            try { before = await (current() as any)[lowerFirst(model)].findUnique({ where: (args as any).where }); } catch { /* ignore */ }
          }
          const result = await query(args);
          if (AUDITED_MODELS.has(model)) await writeAudit(model, before ? 'UPDATE' : 'CREATE', before, result, entityIdOf(result));
          return result;
        },
        async delete({ model, args, query }) {
          if (DELETE_PROTECTED_MODELS.has(model)) {
            throw new DomainError(409, 'DELETE_FORBIDDEN', `${model} records are never deleted; archive or void them instead.`);
          }
          let before: unknown = null;
          if (AUDITED_MODELS.has(model)) {
            try { before = await (current() as any)[lowerFirst(model)].findUnique({ where: (args as any).where }); } catch { /* ignore */ }
          }
          const result = await query(args);
          if (AUDITED_MODELS.has(model)) await writeAudit(model, 'DELETE', before ?? result, null, entityIdOf(before ?? result));
          return result;
        },
        async deleteMany({ model, args, query }) {
          if (DELETE_PROTECTED_MODELS.has(model)) {
            throw new DomainError(409, 'DELETE_FORBIDDEN', `${model} records are never deleted; archive or void them instead.`);
          }
          return query(args);
        },
      },
    },
  });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: process.env.PRISMA_LOG === '1' ? ['query', 'warn', 'error'] : ['warn', 'error'],
      transactionOptions: { maxWait: 10_000, timeout: 30_000 },
    });
    // Return the extended client from the constructor. The extension proxy
    // forwards unknown members (onModuleInit, $connect, …) to this instance,
    // so Nest lifecycle hooks and every model delegate keep working. The
    // hooks fire inside interactive transactions too.
    return this.$extends(auditExtension(this)) as unknown as this;
  }

  async onModuleInit() {
    await this.$connect();
  }

  /**
   * Interactive transactions publish their client to txStorage for the
   * duration of the callback (see auditExtension). Batch transactions pass
   * straight through.
   */
  override $transaction(arg: any, options?: any): Promise<any> {
    if (typeof arg !== 'function') return super.$transaction(arg, options);
    return super.$transaction((tx: Prisma.TransactionClient) => txStorage.run(tx, () => arg(tx)), options);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

/** The client type handed to services inside $transaction callbacks. */
export type Tx = Prisma.TransactionClient;
