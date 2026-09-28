import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { DomainError } from '../errors/domain-error';

export type SequenceKey = 'CUSTOMER' | 'SKU' | 'ARTWORK' | 'QUOTATION' | 'SALES_ORDER' | 'JOB' | 'DISPATCH' | 'NCR' | 'INSPECTION';

interface SeqRow { key: string; prefix: string; padding: number; format: string; resetPolicy: 'NEVER' | 'YEARLY'; periodKey: string | null; nextValue: number }

/**
 * Concurrency-safe document numbering (architecture §16.1).
 *
 * Call inside the transaction that creates the numbered row, as late as
 * possible: the row lock taken by SELECT … FOR UPDATE is held until the
 * caller commits, so two creators serialise only for the tail of their
 * transactions. A rollback un-consumes the number, so there are no gaps from
 * failed creates.
 *
 * Format tokens: {prefix} {seq} {year} {yy}.
 */
@Injectable()
export class NumberingService {
  constructor(private readonly prisma: PrismaService) {}

  async next(tx: Tx | PrismaService, key: SequenceKey, now = new Date()): Promise<string> {
    const rows = await tx.$queryRaw<SeqRow[]>(Prisma.sql`SELECT "key","prefix","padding","format","resetPolicy","periodKey","nextValue" FROM "number_sequence" WHERE "key" = ${key} FOR UPDATE`);
    const row = rows[0];
    if (!row) throw new DomainError(500, 'NUMBERING_MISSING', `Number sequence ${key} is not configured. Run the seed or add it under Settings → Numbering.`);

    const year = String(now.getFullYear());
    let value = row.nextValue;
    let periodKey = row.periodKey;
    if (row.resetPolicy === 'YEARLY' && periodKey !== year) {
      value = 1;
      periodKey = year;
    }
    await tx.$executeRaw(Prisma.sql`UPDATE "number_sequence" SET "nextValue" = ${value + 1}, "periodKey" = ${periodKey}, "updatedAt" = now() WHERE "key" = ${key}`);
    return this.format(row.format, row.prefix, value, row.padding, year);
  }

  format(format: string, prefix: string, value: number, padding: number, year: string): string {
    return format
      .replace('{prefix}', prefix)
      .replace('{seq}', String(value).padStart(padding, '0'))
      .replace('{year}', year)
      .replace('{yy}', year.slice(-2));
  }

  /** Preview of the next number without consuming it (for the settings screen). */
  async peek(key: SequenceKey): Promise<string> {
    const row = await this.prisma.numberSequence.findUnique({ where: { key } });
    if (!row) return '';
    const year = String(new Date().getFullYear());
    const value = row.resetPolicy === 'YEARLY' && row.periodKey !== year ? 1 : row.nextValue;
    return this.format(row.format, row.prefix, value, row.padding, year);
  }
}
