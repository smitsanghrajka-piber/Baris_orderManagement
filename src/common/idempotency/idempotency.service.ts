import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { ConflictError } from '../errors/domain-error';

const STALE_PENDING_MS = 2 * 60 * 1000;
const RETENTION_DAYS = 7;

/**
 * Claim-style idempotency keyed by the Idempotency-Key header. An absent key
 * means unguarded (behaves exactly as before). A replay returns the stored
 * response; an in-flight duplicate gets 409; a thrown handler releases the
 * claim so the write stays retryable.
 *
 * The claim is INSERT … ON CONFLICT DO NOTHING (createMany skipDuplicates),
 * deliberately not try/catch around create(): inside a Postgres transaction a
 * failed statement aborts the whole transaction.
 */
@Injectable()
export class IdempotencyService {
  private readonly log = new Logger(IdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async runOnce<T>(scope: string, key: string | undefined, fn: () => Promise<T>): Promise<T> {
    if (!key) return fn();
    const claim = await this.claim(this.prisma, scope, key);
    if (claim.replay) return claim.response as T;
    try {
      const result = await fn();
      await this.complete(this.prisma, scope, key, result);
      return result;
    } catch (err) {
      await this.release(scope, key, err);
      throw err;
    }
  }

  /** Use inside a caller-owned transaction so the claim commits with the side effect. */
  async claimInTx(tx: Tx, scope: string, key: string | undefined) {
    if (!key) return { replay: false as const, response: undefined };
    return this.claim(tx, scope, key);
  }

  async completeInTx(tx: Tx, scope: string, key: string | undefined, response: unknown) {
    if (!key) return;
    await this.complete(tx, scope, key, response);
  }

  private async claim(db: Tx | PrismaService, scope: string, key: string): Promise<{ replay: boolean; response?: unknown }> {
    const { count } = await db.idempotencyRecord.createMany({ data: [{ scope, key, status: 'PENDING' }], skipDuplicates: true });
    if (count === 1) return { replay: false };
    const existing = await db.idempotencyRecord.findUnique({ where: { scope_key: { scope, key } } });
    if (!existing) return { replay: false };
    if (existing.status === 'DONE') return { replay: true, response: existing.responseJson };
    if (Date.now() - existing.createdAt.getTime() > STALE_PENDING_MS) {
      await db.idempotencyRecord.update({ where: { scope_key: { scope, key } }, data: { createdAt: new Date(), status: 'PENDING' } });
      return { replay: false };
    }
    throw new ConflictError('IN_FLIGHT', 'This request is already being processed. It will be retried automatically.');
  }

  private async complete(db: Tx | PrismaService, scope: string, key: string, response: unknown) {
    await db.idempotencyRecord.update({
      where: { scope_key: { scope, key } },
      data: { status: 'DONE', responseJson: (response ?? null) as Prisma.InputJsonValue, completedAt: new Date() },
    });
  }

  private async release(scope: string, key: string, err: unknown) {
    try {
      await this.prisma.idempotencyRecord.deleteMany({ where: { scope, key, status: 'PENDING' } });
    } catch (e) {
      this.log.warn(`could not release idempotency claim ${scope}/${key}: ${(e as Error).message} (original: ${(err as Error)?.message})`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async sweep() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000);
    try {
      const { count } = await this.prisma.idempotencyRecord.deleteMany({ where: { createdAt: { lt: cutoff } } });
      if (count) this.log.log(`swept ${count} idempotency records`);
    } catch (e) {
      this.log.warn(`idempotency sweep failed: ${(e as Error).message}`);
    }
  }
}
