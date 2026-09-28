import { PrismaService, AUDITED_MODELS, DELETE_PROTECTED_MODELS } from '../../src/common/prisma/prisma.service';

/**
 * The extended client is returned from the constructor. This checks, without
 * connecting, that the proxy still exposes the Nest lifecycle hooks and the
 * model delegates, so DI and $transaction keep working.
 */
describe('PrismaService (extension proxy)', () => {
  const svc = new PrismaService();

  it('exposes lifecycle hooks and delegates through the proxy', () => {
    expect(typeof svc.onModuleInit).toBe('function');
    expect(typeof svc.onModuleDestroy).toBe('function');
    expect(typeof (svc as any).customer.findMany).toBe('function');
    expect(typeof svc.$transaction).toBe('function');
    expect(typeof svc.$queryRaw).toBe('function');
  });

  it('protects the right models from hard delete', () => {
    for (const m of ['Customer', 'CustomerSku', 'SpecificationVersion', 'File', 'AuditLog', 'Activity']) expect(DELETE_PROTECTED_MODELS.has(m)).toBe(true);
    for (const m of ['Customer', 'CustomerContact', 'SpecificationVersion', 'RolePermission', 'CompanySettings']) expect(AUDITED_MODELS.has(m)).toBe(true);
    expect(AUDITED_MODELS.has('RefreshToken')).toBe(false); // would copy session material into the trail
    expect(AUDITED_MODELS.has('AuditLog')).toBe(false);
  });
});
