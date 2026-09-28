import { API, auth, bootApp, closeApp, customerWithPortalUser, describeWithDb, http, staffToken } from '../helpers/app';

/**
 * A customer must never reach another customer's data by manipulating an
 * id. Every portal route with an id is hit with a foreign id and must 404.
 */
describeWithDb('tenant isolation', () => {
  let a: Awaited<ReturnType<typeof customerWithPortalUser>>;
  let b: Awaited<ReturnType<typeof customerWithPortalUser>>;
  let admin: string;
  let skuB: any;
  let siteB: any;

  beforeAll(async () => {
    const { prisma } = await bootApp();
    admin = (await staffToken(['SUPER_ADMIN'])).token;
    a = await customerWithPortalUser('Alpha', { admin: true });
    b = await customerWithPortalUser('Beta', { admin: true });
    skuB = await prisma.customerSku.create({ data: { number: `SKU-ISO${Date.now()}`, customerId: b.customer.id, description: 'Beta only' } });
    siteB = await prisma.customerSite.create({ data: { customerId: b.customer.id, name: 'Beta site' } });
  });
  afterAll(closeApp);

  it('portal customer view is scoped to the caller', async () => {
    const res = await http().get(`${API}/portal/customer`).set(auth(a.token));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(a.customer.id);
    expect(res.body.notes).toBeUndefined();
    expect(res.body.creditHold).toBeUndefined();
  });

  it.each([
    ['get', () => `/portal/skus/${skuB.id}`],
    ['patch', () => `/portal/sites/${siteB.id}`],
    ['patch', () => `/portal/users/${b.user.id}`],
  ])('%s foreign id → 404', async (method, path) => {
    const res = await (http() as any)[method](`${API}${path()}`).set(auth(a.token)).send({ name: 'x' });
    expect(res.status).toBe(404);
  });

  it('portal SKU list never includes another tenant\'s SKUs', async () => {
    const res = await http().get(`${API}/portal/skus`).set(auth(a.token));
    expect(res.status).toBe(200);
    expect(res.body.some((s: any) => s.id === skuB.id)).toBe(false);
  });

  it('a file tagged to another tenant is not downloadable and the attempt is a 404', async () => {
    const { prisma } = await bootApp();
    const file = await prisma.file.create({ data: { bucket: 'attachments', storageKey: `customers/${b.customer.id}/t/${Date.now()}.pdf`, originalName: 't.pdf', mimeType: 'application/pdf', sizeBytes: 1, sha256: 's', uploadedByActorType: 'SYSTEM', customerId: b.customer.id } });
    expect((await http().get(`${API}/portal/files/${file.id}/url`).set(auth(a.token))).status).toBe(404);
    // internal file (no tenant) is never portal-readable, even for its "own" org
    const internal = await prisma.file.create({ data: { bucket: 'attachments', storageKey: `internal/${Date.now()}.pdf`, originalName: 'i.pdf', mimeType: 'application/pdf', sizeBytes: 1, sha256: 's2', uploadedByActorType: 'SYSTEM' } });
    expect((await http().get(`${API}/portal/files/${internal.id}/url`).set(auth(b.token))).status).toBe(404);
  });

  it('customer admin cannot grant contact authority flags through the portal', async () => {
    const res = await http().post(`${API}/portal/users`).set(auth(a.token)).send({ email: `new-${Date.now()}@test.local`, name: 'New', isAdmin: false, canApproveArtwork: true });
    expect(res.status).toBe(201);
    const { prisma } = await bootApp();
    const created = await prisma.customerUser.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(created.customerId).toBe(a.customer.id);
    expect(created.contactId).toBeNull();
  });

  it('staff see everything through the 360 view, portal sees the allow-list', async () => {
    const staff = await http().get(`${API}/customers/${b.customer.id}`).set(auth(admin));
    expect(staff.status).toBe(200);
    expect(staff.body).toHaveProperty('creditHold');
    const portal = await http().get(`${API}/portal/customer`).set(auth(b.token));
    expect(Object.keys(portal.body)).not.toContain('creditHold');
    expect(Object.keys(portal.body)).not.toContain('salesRep');
  });
});
