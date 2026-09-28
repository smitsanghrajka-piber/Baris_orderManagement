import { Prisma, PrismaClient } from '@prisma/client';
import { bootApp, closeApp, describeWithDb } from '../helpers/app';

/**
 * Every hand-written trigger is exercised with raw SQL so the guarantee is
 * proven at the database, not through the ORM.
 */
describeWithDb('database triggers', () => {
  let prisma: PrismaClient;
  let base: PrismaClient; // un-extended client for raw writes the extension would refuse

  beforeAll(async () => {
    ({ prisma } = await bootApp());
    base = new PrismaClient();
  });
  afterAll(async () => { await base.$disconnect(); await closeApp(); });

  it('audit_log is append-only', async () => {
    const row = await base.auditLog.create({ data: { actorType: 'SYSTEM', action: 'TEST', entityType: 'Test', entityId: 't1' } });
    await expect(base.$executeRaw`UPDATE "audit_log" SET "action" = 'TAMPERED' WHERE "id" = ${row.id}`).rejects.toThrow(/append-only/);
    await expect(base.$executeRaw`DELETE FROM "audit_log" WHERE "id" = ${row.id}`).rejects.toThrow(/append-only/);
  });

  it('file identity columns are immutable and rows cannot be deleted', async () => {
    const f = await base.file.create({ data: { bucket: 'attachments', storageKey: `test/${Date.now()}.pdf`, originalName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 1, sha256: 'abc', uploadedByActorType: 'SYSTEM' } });
    await expect(base.$executeRaw`UPDATE "file" SET "sha256" = 'def' WHERE "id" = ${f.id}`).rejects.toThrow(/immutable/);
    await expect(base.$executeRaw`DELETE FROM "file" WHERE "id" = ${f.id}`).rejects.toThrow(/cannot be deleted/);
    // The actor CHECK: STAFF actor without a user id is rejected.
    await expect(base.file.create({ data: { bucket: 'attachments', storageKey: `test/${Date.now()}-b.pdf`, originalName: 'b.pdf', mimeType: 'application/pdf', sizeBytes: 1, sha256: 'x', uploadedByActorType: 'STAFF' } })).rejects.toThrow();
  });

  it('approved specifications and their colours are immutable; only one APPROVED per SKU', async () => {
    const admin = await base.user.findFirstOrThrow();
    const customer = await base.customer.create({ data: { number: `CUS-TRG${Date.now()}`, name: 'Trigger Co' } });
    const sku = await base.customerSku.create({ data: { number: `SKU-TRG${Date.now()}`, customerId: customer.id, description: 'Trigger label' } });
    const cmyk = await base.colourSystem.findUniqueOrThrow({ where: { code: 'CMYK' } });
    const spec = await base.specificationVersion.create({ data: { skuId: sku.id, revisionNo: 1, widthMm: 100, heightMm: 50, createdByUserId: admin.id, colours: { create: [{ sequence: 1, colourSystemId: cmyk.id, colourSystemCode: 'CMYK', code: 'C' }] } } });

    // draft is editable
    await base.specificationVersion.update({ where: { id: spec.id }, data: { shape: 'rect' } });
    // approve
    await base.specificationVersion.update({ where: { id: spec.id }, data: { status: 'APPROVED', approvedAt: new Date(), approvedByUserId: admin.id } });
    // now frozen
    await expect(base.$executeRaw`UPDATE "specification_version" SET "widthMm" = 101 WHERE "id" = ${spec.id}`).rejects.toThrow(/immutable/);
    await expect(base.$executeRaw`UPDATE "specification_colour" SET "code" = 'M' WHERE "specificationId" = ${spec.id}`).rejects.toThrow(/immutable/);
    await expect(base.$executeRaw`INSERT INTO "specification_colour" ("id","specificationId","sequence","colourSystemId","colourSystemCode") VALUES (gen_random_uuid()::text, ${spec.id}, 2, ${cmyk.id}, 'CMYK')`).rejects.toThrow(/immutable/);
    // cannot go back to DRAFT
    await expect(base.$executeRaw`UPDATE "specification_version" SET "status" = 'DRAFT' WHERE "id" = ${spec.id}`).rejects.toThrow(/cannot return to/);
    // lifecycle columns still move
    await base.specificationVersion.update({ where: { id: spec.id }, data: { status: 'SUPERSEDED', supersededAt: new Date() } });
    // second APPROVED for the same SKU is blocked by the partial unique
    const spec2 = await base.specificationVersion.create({ data: { skuId: sku.id, revisionNo: 2, widthMm: 100, heightMm: 50, createdByUserId: admin.id, status: 'APPROVED', approvedAt: new Date() } });
    await expect(base.specificationVersion.create({ data: { skuId: sku.id, revisionNo: 3, widthMm: 100, heightMm: 50, createdByUserId: admin.id, status: 'APPROVED', approvedAt: new Date() } })).rejects.toThrow();
    expect(spec2.status).toBe('APPROVED');
  });

  it('tenant consistency: a portal user cannot be linked to another customer\'s contact', async () => {
    const a = await base.customer.create({ data: { number: `CUS-A${Date.now()}`, name: 'A' } });
    const b = await base.customer.create({ data: { number: `CUS-B${Date.now()}`, name: 'B' } });
    const contactB = await base.customerContact.create({ data: { customerId: b.id, name: 'B contact' } });
    await expect(base.customerUser.create({ data: { customerId: a.id, contactId: contactB.id, email: `x${Date.now()}@t.local`, passwordHash: 'h', name: 'x' } })).rejects.toThrow(/TENANT_MISMATCH|different customer/);
  });

  it('a SKU cannot point at another SKU\'s specification', async () => {
    const admin = await base.user.findFirstOrThrow();
    const c = await base.customer.create({ data: { number: `CUS-S${Date.now()}`, name: 'S' } });
    const s1 = await base.customerSku.create({ data: { number: `SKU-S1${Date.now()}`, customerId: c.id, description: 'one' } });
    const s2 = await base.customerSku.create({ data: { number: `SKU-S2${Date.now()}`, customerId: c.id, description: 'two' } });
    const spec = await base.specificationVersion.create({ data: { skuId: s1.id, revisionNo: 1, widthMm: 1, heightMm: 1, createdByUserId: admin.id } });
    await expect(base.$executeRaw`UPDATE "customer_sku" SET "currentSpecificationId" = ${spec.id} WHERE "id" = ${s2.id}`).rejects.toThrow(/does not belong/);
  });

  it('the ORM refuses hard deletes on protected models', async () => {
    const c = await prisma.customer.create({ data: { number: `CUS-D${Date.now()}`, name: 'Del' } });
    await expect(prisma.customer.delete({ where: { id: c.id } })).rejects.toMatchObject({ code: 'DELETE_FORBIDDEN' });
  });

  it('only one default site per customer', async () => {
    const c = await base.customer.create({ data: { number: `CUS-DS${Date.now()}`, name: 'Sites' } });
    await base.customerSite.create({ data: { customerId: c.id, name: 'One', isDefault: true } });
    await expect(base.customerSite.create({ data: { customerId: c.id, name: 'Two', isDefault: true } })).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });
});
