import { Prisma } from '@prisma/client';
import { changedFields, redactSecrets } from '../../src/common/audit/redact';

describe('redactSecrets', () => {
  it('blanks secret-bearing keys at any depth, case-insensitively', () => {
    const out = redactSecrets({ email: 'a@b.c', passwordHash: 'x', nested: { Token: 'y', list: [{ apiKey: 'z', ok: 1 }] } });
    expect(out).toEqual({ email: 'a@b.c', passwordHash: '[redacted]', nested: { Token: '[redacted]', list: [{ apiKey: '[redacted]', ok: 1 }] } });
  });

  it('survives cycles and keeps dates', () => {
    const a: any = { d: new Date('2026-01-01T00:00:00Z') };
    a.self = a;
    const out: any = redactSecrets(a);
    expect(out.d).toBeInstanceOf(Date);
    expect(out.self).toBe('[circular]');
  });

  it('flattens Prisma Decimal and bigint to JSON-safe values', () => {
    const out = redactSecrets({ widthMm: new Prisma.Decimal('120.5'), id: BigInt(42), list: [new Prisma.Decimal(80)] });
    expect(out).toEqual({ widthMm: '120.5', id: '42', list: ['80'] });
    expect(() => JSON.stringify(out)).not.toThrow();
  });
});

describe('changedFields', () => {
  it('ignores updatedAt and reports real diffs', () => {
    expect(changedFields({ a: 1, b: 'x', updatedAt: 1 }, { a: 1, b: 'y', updatedAt: 2 })).toEqual(['b']);
    expect(changedFields(null, { a: 1 })).toEqual([]);
  });
});
