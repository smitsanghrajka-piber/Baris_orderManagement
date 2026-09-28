import { API, auth, bootApp, closeApp, describeWithDb, http, staffToken } from '../helpers/app';

/**
 * Customer → SKU → spec revision → approve → new revision → approve
 * (supersede) → history intact. Also: draft-only edits, one draft at a time,
 * optimistic locking on the SKU head, and the audit trail of each step.
 */
describeWithDb('SKU and specification lifecycle', () => {
  let sales: string;
  let prepress: string;
  let customerId: string;

  beforeAll(async () => {
    await bootApp();
    sales = (await staffToken(['SALES'])).token;
    prepress = (await staffToken(['PREPRESS'])).token;
    const c = await http().post(`${API}/customers`).set(auth(sales)).send({ name: 'Lifecycle Co' });
    customerId = c.body.id;
  });
  afterAll(closeApp);

  it('runs the full revision lifecycle with immutable history', async () => {
    const { prisma } = await bootApp();
    const sku = await http().post(`${API}/skus`).set(auth(sales)).send({ customerId, description: '10L Paint Pail — Front IML', customerSkuCode: 'PP-10L-F' });
    expect(sku.status).toBe(201);
    expect(sku.body.number).toMatch(/^SKU-\d{6}$/);
    expect(sku.body.status).toBe('DRAFT');

    const cmyk = await prisma.colourSystem.findUniqueOrThrow({ where: { code: 'CMYK' } });
    const pantone = await prisma.colourSystem.findUniqueOrThrow({ where: { code: 'PANTONE' } });
    const material = await prisma.material.findFirstOrThrow();

    // Sales cannot create spec revisions; prepress can.
    expect((await http().post(`${API}/skus/${sku.body.id}/specifications`).set(auth(sales)).send({ widthMm: 100, heightMm: 50 })).status).toBe(403);
    const v1 = await http().post(`${API}/skus/${sku.body.id}/specifications`).set(auth(prepress)).send({
      widthMm: 120.5, heightMm: 80, materialId: material.id, colourCount: 5, whiteInk: 'BACKING', varnish: true,
      colours: [{ colourSystemId: cmyk.id, code: 'CMYK' }, { colourSystemId: pantone.id, code: '485 C', name: 'Red', toleranceDeltaE: 2 }],
    });
    expect(v1.status).toBe(201);
    expect(v1.body.revisionNo).toBe(1);
    expect(v1.body.materialCode).toBe(material.code); // snapshot
    expect(v1.body.colours).toHaveLength(2);

    // Only one draft at a time.
    expect((await http().post(`${API}/skus/${sku.body.id}/specifications`).set(auth(prepress)).send({ widthMm: 1, heightMm: 1 })).body.code).toBe('DRAFT_EXISTS');

    // Draft is editable.
    const edit = await http().patch(`${API}/specifications/${v1.body.id}`).set(auth(prepress)).send({ widthMm: 121, heightMm: 80, colours: [{ colourSystemId: cmyk.id, code: 'CMYK' }] });
    expect(edit.status).toBe(200);
    expect(Number(edit.body.widthMm)).toBe(121);
    expect(edit.body.colours).toHaveLength(1);

    // Approve → SKU becomes ACTIVE with current spec.
    const approved = await http().post(`${API}/specifications/${v1.body.id}/approve`).set(auth(prepress));
    expect(approved.status).toBe(201);
    expect(approved.body.status).toBe('APPROVED');
    const skuAfter = await http().get(`${API}/skus/${sku.body.id}`).set(auth(sales));
    expect(skuAfter.body.status).toBe('ACTIVE');
    expect(skuAfter.body.currentSpecificationId).toBe(v1.body.id);

    // Approved is immutable through the API.
    const frozen = await http().patch(`${API}/specifications/${v1.body.id}`).set(auth(prepress)).send({ widthMm: 999, heightMm: 80 });
    expect(frozen.status).toBe(409);
    expect(frozen.body.code).toBe('INVALID_TRANSITION');
    expect((await http().post(`${API}/specifications/${v1.body.id}/approve`).set(auth(prepress))).status).toBe(409);

    // Revision 2 → approve → v1 superseded, history intact.
    const v2 = await http().post(`${API}/skus/${sku.body.id}/specifications`).set(auth(prepress)).send({ widthMm: 121, heightMm: 82, colourCount: 0, changeSummary: 'Height +2 mm', requiresCustomerReapproval: true });
    expect(v2.body.revisionNo).toBe(2);
    expect((await http().post(`${API}/specifications/${v2.body.id}/approve`).set(auth(prepress))).status).toBe(201);
    const full = await http().get(`${API}/skus/${sku.body.id}`).set(auth(sales));
    const revs = full.body.specifications.map((s: any) => [s.revisionNo, s.status]);
    expect(revs).toEqual([[2, 'APPROVED'], [1, 'SUPERSEDED']]);
    expect(full.body.currentSpecificationId).toBe(v2.body.id);
    const v1Now = await prisma.specificationVersion.findUniqueOrThrow({ where: { id: v1.body.id } });
    expect(Number(v1Now.widthMm)).toBe(121); // untouched by v2

    // Audit trail
    const actions = (await prisma.auditLog.findMany({ where: { entityType: 'SpecificationVersion', entityId: { in: [v1.body.id, v2.body.id] } } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['SPEC_REVISION_CREATED', 'SPEC_DRAFT_UPDATED', 'SPEC_APPROVED']));
    const activity = await prisma.activity.findMany({ where: { customerId, verb: 'spec_approved' } });
    expect(activity.length).toBe(2);
  });

  it('optimistic locking on the SKU head returns 409 on stale version', async () => {
    const sku = await http().post(`${API}/skus`).set(auth(sales)).send({ customerId, description: 'Lock test' });
    const ok = await http().patch(`${API}/skus/${sku.body.id}`).set(auth(sales)).send({ description: 'Lock test v2', version: sku.body.version });
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(sku.body.version + 1);
    const stale = await http().patch(`${API}/skus/${sku.body.id}`).set(auth(sales)).send({ description: 'Lock test v3', version: sku.body.version });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');
  });

  it('a SKU cannot be activated without an approved specification', async () => {
    const sku = await http().post(`${API}/skus`).set(auth(sales)).send({ customerId, description: 'No spec' });
    const res = await http().patch(`${API}/skus/${sku.body.id}`).set(auth(sales)).send({ status: 'ACTIVE', version: sku.body.version });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SPEC_REQUIRED');
  });
});
