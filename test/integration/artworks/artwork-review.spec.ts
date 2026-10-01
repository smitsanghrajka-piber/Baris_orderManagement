import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { API, auth, bootApp, closeApp, customerWithPortalUser, describeWithDb, http, staffToken } from '../helpers/app';

// Minimal one-page PDF — passes the server's content sniffing.
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
// Smallest valid PNG (1×1) — a real image, but proofs must be PDF.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

/**
 * Proof review end to end: staff upload and send, the customer marks up and
 * requests changes, staff upload a new version, the customer approves. Plus
 * tenant isolation and the database guards on sent versions and decisions.
 */
describeWithDb('artwork proof review', () => {
  let prisma: PrismaClient;
  let base: PrismaClient;
  let sales: string;
  let operator: string;
  let a: Awaited<ReturnType<typeof customerWithPortalUser>>; // reviewer without approval authority
  let approver: Awaited<ReturnType<typeof customerWithPortalUser>>;
  let other: Awaited<ReturnType<typeof customerWithPortalUser>>;
  let skuA: string;
  let skuOther: string;

  beforeAll(async () => {
    ({ prisma } = await bootApp());
    base = new PrismaClient();
    sales = (await staffToken(['SALES'])).token;
    operator = (await staffToken(['OPERATOR'])).token;
    a = await customerWithPortalUser('Artwork Co', { canApproveArtwork: false });
    other = await customerWithPortalUser('Other Co', { canApproveArtwork: true });
    skuA = (await prisma.customerSku.create({ data: { number: `SKU-AW${Date.now()}`, customerId: a.customer.id, description: 'Yoghurt lid 500g' } })).id;
    skuOther = (await prisma.customerSku.create({ data: { number: `SKU-AWO${Date.now()}`, customerId: other.customer.id, description: 'Other lid' } })).id;
    // A second login at the same customer whose contact may approve artwork.
    const contact = await prisma.customerContact.create({ data: { customerId: a.customer.id, name: 'Approver Contact', canApproveArtwork: true } });
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'CUSTOMER_USER' } });
    const email = `approver-${Date.now()}@test.local`;
    const user = await prisma.customerUser.create({ data: { customerId: a.customer.id, contactId: contact.id, email, name: 'Approver Portal', passwordHash: await bcrypt.hash('Password123!', 4), roles: { create: [{ roleId: role.id }] } } });
    const login = await http().post(`${API}/auth/portal/login`).send({ email, password: 'Password123!' });
    approver = { customer: a.customer, contact, user, token: login.body.accessToken };
  });
  afterAll(async () => { await base.$disconnect(); await closeApp(); });

  const upload = (path: string, token: string, fields: Record<string, string>, name = 'proof.pdf', body = PDF) => {
    let req = http().post(`${API}${path}`).set(auth(token));
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req.attach('file', body, name);
  };

  let artworkId: string;
  let v1: string;
  let v2: string;

  it("requires a PDF proof and one of the customer's SKUs; operators cannot upload", async () => {
    const png = await upload('/artworks', sales, { customerId: a.customer.id, skuId: skuA, title: 'Lid' }, 'proof.png', PNG);
    expect(png.status).toBe(400);
    expect(png.body.message).toMatch(/PDF/);
    const noSku = await upload('/artworks', sales, { customerId: a.customer.id, title: 'Lid' });
    expect(noSku.status).toBe(400);
    const wrongSku = await upload('/artworks', sales, { customerId: a.customer.id, skuId: skuOther, title: 'Lid' });
    expect(wrongSku.status).toBe(400);
    const op = await upload('/artworks', operator, { customerId: a.customer.id, skuId: skuA, title: 'Lid' });
    expect(op.status).toBe(403);
  });

  it('staff upload a proof; it stays internal until sent', async () => {
    const res = await upload('/artworks', sales, { customerId: a.customer.id, skuId: skuA, title: 'Yoghurt lid 500g', sendNow: 'false', customerNotes: 'First proof for review' });
    expect(res.status).toBe(201);
    artworkId = res.body.id;
    expect(res.body.number).toMatch(/^ART-/);
    expect(res.body.status).toBe('PROOF_IN_PREPARATION');
    v1 = res.body.versions[0].id;
    expect(res.body.versions[0].files[0].kind).toBe('PROOF');

    const list = await http().get(`${API}/portal/artworks`).set(auth(a.token));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(0);
    expect((await http().get(`${API}/portal/artworks/${artworkId}`).set(auth(a.token))).status).toBe(404);
  });

  it('sending makes it visible to that customer only', async () => {
    const sent = await http().post(`${API}/artwork-versions/${v1}/send`).set(auth(sales));
    expect(sent.status).toBe(200);
    expect(sent.body.status).toBe('PROOF_SENT');

    const list = await http().get(`${API}/portal/artworks`).set(auth(a.token));
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: artworkId, awaitingReview: true });

    // Another customer sees nothing and gets 404 on direct access.
    expect((await http().get(`${API}/portal/artworks`).set(auth(other.token))).body).toHaveLength(0);
    expect((await http().get(`${API}/portal/artworks/${artworkId}`).set(auth(other.token))).status).toBe(404);
    expect((await http().get(`${API}/portal/artwork-versions/${v1}/comments`).set(auth(other.token))).status).toBe(404);
    expect((await http().post(`${API}/portal/artwork-versions/${v1}/comments`).set(auth(other.token)).send({ body: 'hi' })).status).toBe(404);

    // The customer can open the proof file; the other customer cannot.
    const detail = await http().get(`${API}/portal/artworks/${artworkId}`).set(auth(a.token));
    expect(detail.status).toBe(200);
    expect(detail.body).not.toHaveProperty('versions.0.internalNotes');
    const fileId = detail.body.versions[0].files[0].file.id;
    expect((await http().get(`${API}/portal/files/${fileId}/url`).set(auth(a.token))).status).toBe(200);
    expect((await http().get(`${API}/portal/files/${fileId}/url`).set(auth(other.token))).status).toBe(404);
  });

  it('the customer marks up areas as drafts that Baris cannot see until submitted', async () => {
    const viewed = await http().post(`${API}/portal/artwork-versions/${v1}/viewed`).set(auth(a.token));
    expect(viewed.body.status).toBe('CUSTOMER_REVIEWING');

    const c = await http().post(`${API}/portal/artwork-versions/${v1}/comments`).set(auth(a.token))
      .send({ body: 'Logo should be larger', annotation: { page: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.15 } });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ isDraft: true, isMine: true, annotation: { page: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.15 } });
    expect(c.body).not.toHaveProperty('authorCustomerUserId');

    // Out-of-range annotation is refused.
    const bad = await http().post(`${API}/portal/artwork-versions/${v1}/comments`).set(auth(a.token)).send({ body: 'x', annotation: { page: 1, x: 1.4, y: 0, w: 0, h: 0 } });
    expect(bad.status).toBe(400);

    const staffView = await http().get(`${API}/artwork-versions/${v1}/comments`).set(auth(sales));
    expect(staffView.body).toHaveLength(0);

    // Colleagues in the same organisation see the draft; they cannot edit it.
    const colleague = await http().get(`${API}/portal/artwork-versions/${v1}/comments`).set(auth(approver.token));
    expect(colleague.body).toHaveLength(1);
    expect(colleague.body[0]).toMatchObject({ isDraft: true, isMine: false });
    expect((await http().patch(`${API}/portal/artwork-comments/${c.body.id}`).set(auth(approver.token)).send({ body: 'edited' })).status).toBe(403);
  });

  it('a reviewer without approval authority can request changes but not approve', async () => {
    const approve = await http().post(`${API}/portal/artwork-versions/${v1}/decision`).set(auth(a.token)).send({ decision: 'APPROVED', acceptStatement: true });
    expect(approve.status).toBe(403);

    const res = await http().post(`${API}/portal/artwork-versions/${v1}/decision`).set(auth(a.token)).send({ decision: 'CHANGES_REQUESTED', summary: 'Please enlarge the logo' });
    expect(res.status).toBe(200);
    expect(res.body.versions[0].status).toBe('CHANGES_REQUESTED');

    const staffView = await http().get(`${API}/artwork-versions/${v1}/comments`).set(auth(sales));
    expect(staffView.body).toHaveLength(1);
    expect(staffView.body[0].submittedAt).toBeTruthy();

    const needs = await http().get(`${API}/artworks?filter=NEEDS_ACTION`).set(auth(sales));
    expect(needs.body.items.map((x: { id: string }) => x.id)).toContain(artworkId);

    // Decided: no more comments or decisions on this version.
    expect((await http().post(`${API}/portal/artwork-versions/${v1}/comments`).set(auth(a.token)).send({ body: 'late' })).status).toBe(409);
    expect((await http().post(`${API}/portal/artwork-versions/${v1}/decision`).set(auth(a.token)).send({ decision: 'CHANGES_REQUESTED', summary: 'again' })).status).toBe(409);
  });

  it('staff resolve the feedback and upload a new version that supersedes the old one', async () => {
    const comments = await http().get(`${API}/artwork-versions/${v1}/comments`).set(auth(sales));
    const resolved = await http().patch(`${API}/artwork-comments/${comments.body[0].id}`).set(auth(sales)).send({ status: 'RESOLVED' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe('RESOLVED');

    const noDesc = await upload(`/artworks/${artworkId}/versions`, sales, {});
    expect(noDesc.status).toBe(400);

    const res = await upload(`/artworks/${artworkId}/versions`, sales, { revisionDescription: 'Logo enlarged by 20%', sendNow: 'true' });
    expect(res.status).toBe(201);
    expect(res.body.versions.map((v: { revisionNo: number; status: string }) => [v.revisionNo, v.status])).toEqual([[2, 'PROOF_SENT'], [1, 'SUPERSEDED']]);
    v2 = res.body.versions[0].id;
  });

  it('a contact with approval authority approves against the statement', async () => {
    const noTick = await http().post(`${API}/portal/artwork-versions/${v2}/decision`).set(auth(approver.token)).send({ decision: 'APPROVED' });
    expect(noTick.status).toBe(400);

    const res = await http().post(`${API}/portal/artwork-versions/${v2}/decision`).set(auth(approver.token)).send({ decision: 'APPROVED', acceptStatement: true });
    expect(res.status).toBe(200);
    expect(res.body.versions[0]).toMatchObject({ revisionNo: 2, status: 'APPROVED' });
    expect(res.body.versions[0].approvals[0]).toMatchObject({ decision: 'APPROVED', decidedByName: approver.user.name });
    expect(res.body.versions[0].approvals[0].statement).toBeTruthy();
    expect(res.body.versions[0].approvals[0]).not.toHaveProperty('ip');

    const decision = await prisma.artworkApproval.findFirstOrThrow({ where: { versionId: v2 } });
    expect(decision.proofFileSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('database guards: decisions are append-only, sent versions are frozen, SKU must match the customer', async () => {
    const decision = await base.artworkApproval.findFirstOrThrow({ where: { versionId: v2 } });
    await expect(base.$executeRaw`UPDATE "artwork_approval" SET "decision" = 'REJECTED' WHERE "id" = ${decision.id}`).rejects.toThrow(/append-only/);
    await expect(base.$executeRaw`UPDATE "artwork_version" SET "revisionDescription" = 'tampered' WHERE "id" = ${v2}`).rejects.toThrow(/immutable/);
    const file = await base.artworkFile.findFirstOrThrow({ where: { versionId: v2 } });
    await expect(base.$executeRaw`DELETE FROM "artwork_file" WHERE "id" = ${file.id}`).rejects.toThrow(/immutable/);

    await expect(base.$executeRaw`UPDATE "artwork" SET "skuId" = ${skuOther} WHERE "id" = ${artworkId}`).rejects.toThrow(/TENANT_MISMATCH/);
    await expect(base.$executeRaw`UPDATE "artwork" SET "skuId" = NULL WHERE "id" = ${artworkId}`).rejects.toThrow();
  });
});
