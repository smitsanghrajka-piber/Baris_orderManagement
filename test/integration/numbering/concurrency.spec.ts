import { API, auth, bootApp, closeApp, describeWithDb, http, staffToken } from '../helpers/app';

describeWithDb('numbering under concurrency', () => {
  let token: string;
  beforeAll(async () => { await bootApp(); token = (await staffToken(['SALES'])).token; });
  afterAll(closeApp);

  it('25 parallel customer creates receive 25 distinct sequential numbers', async () => {
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) => http().post(`${API}/customers`).set(auth(token)).send({ name: `Concurrent ${i}` })));
    const statuses = results.map((r) => r.status);
    expect(statuses.every((s) => s === 201)).toBe(true);
    const numbers = results.map((r) => r.body.number as string);
    expect(new Set(numbers).size).toBe(25);
    const seqs = numbers.map((n) => Number(n.split('-')[1])).sort((a, b) => a - b);
    expect(seqs[seqs.length - 1] - seqs[0]).toBe(24); // contiguous
  });

  it('a failed create does not consume a number', async () => {
    const { prisma } = await bootApp();
    const before = await prisma.numberSequence.findUniqueOrThrow({ where: { key: 'SKU' } });
    // customerId that does not exist → 404 before numbering; and a real failure path:
    const bad = await http().post(`${API}/skus`).set(auth(token)).send({ customerId: '00000000-0000-0000-0000-000000000000', description: 'x' });
    expect(bad.status).toBe(404);
    const after = await prisma.numberSequence.findUniqueOrThrow({ where: { key: 'SKU' } });
    expect(after.nextValue).toBe(before.nextValue);
  });
});
