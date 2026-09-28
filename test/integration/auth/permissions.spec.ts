import { API, auth, bootApp, closeApp, customerWithPortalUser, describeWithDb, http, staffToken } from '../helpers/app';

/**
 * Permission matrix per route (Phase 2 routes). Each row: method, path,
 * roles that must pass, roles that must get 403. Portal routes must reject
 * staff tokens and staff routes must reject portal tokens.
 */
describeWithDb('route permissions', () => {
  const tokens: Record<string, string> = {};
  let portalToken: string;

  beforeAll(async () => {
    await bootApp();
    for (const r of ['SUPER_ADMIN', 'SALES', 'PREPRESS', 'OPERATOR', 'FINANCE', 'DISPATCH']) tokens[r] = (await staffToken([r])).token;
    portalToken = (await customerWithPortalUser('Perm Co', { admin: true })).token;
  });
  afterAll(closeApp);

  const rows: [string, string, string[], string[]][] = [
    ['get', '/customers', ['SUPER_ADMIN', 'SALES', 'PREPRESS', 'FINANCE', 'DISPATCH'], ['OPERATOR']],
    ['post', '/customers', ['SUPER_ADMIN', 'SALES'], ['PREPRESS', 'OPERATOR', 'FINANCE', 'DISPATCH']],
    ['get', '/users', ['SUPER_ADMIN'], ['SALES', 'PREPRESS', 'OPERATOR', 'FINANCE', 'DISPATCH']],
    ['get', '/roles', ['SUPER_ADMIN', 'SALES'], ['OPERATOR', 'DISPATCH']],
    ['get', '/permissions', ['SUPER_ADMIN'], ['SALES', 'FINANCE']],
    ['get', '/skus', ['SUPER_ADMIN', 'SALES', 'PREPRESS', 'OPERATOR', 'FINANCE', 'DISPATCH'], []],
    ['post', '/skus', ['SUPER_ADMIN', 'SALES', 'PREPRESS'], ['OPERATOR', 'FINANCE', 'DISPATCH']],
    ['get', '/master-data', ['SUPER_ADMIN', 'SALES', 'OPERATOR'], []],
    ['post', '/master-data/routes', ['SUPER_ADMIN'], ['SALES', 'PREPRESS', 'OPERATOR']],
    ['get', '/audit', ['SUPER_ADMIN', 'FINANCE'], ['SALES', 'PREPRESS', 'OPERATOR', 'DISPATCH']],
    ['get', '/settings/company', ['SUPER_ADMIN'], ['SALES', 'FINANCE']],
    ['get', '/settings/numbering', ['SUPER_ADMIN'], ['SALES']],
    ['get', '/notification-rules', ['SUPER_ADMIN'], ['SALES', 'OPERATOR']],
    ['get', '/tooling/tools', ['SUPER_ADMIN', 'SALES', 'OPERATOR'], []],
    ['post', '/tooling/tools', ['SUPER_ADMIN', 'PREPRESS'], ['SALES', 'OPERATOR', 'DISPATCH']],
  ];

  it.each(rows)('%s %s', async (method, path, allowed, denied) => {
    for (const role of allowed) {
      const res = await (http() as any)[method](`${API}${path}`).set(auth(tokens[role])).send({});
      expect({ role, status: res.status }).not.toEqual({ role, status: 403 });
      expect({ role, status: res.status }).not.toEqual({ role, status: 401 });
    }
    for (const role of denied) {
      const res = await (http() as any)[method](`${API}${path}`).set(auth(tokens[role])).send({});
      expect({ role, status: res.status, code: res.body.code }).toEqual({ role, status: 403, code: 'PERMISSION_DENIED' });
    }
  });

  it('staff routes reject portal tokens and portal routes reject staff tokens', async () => {
    expect((await http().get(`${API}/customers`).set(auth(portalToken))).status).toBe(403);
    expect((await http().get(`${API}/portal/customer`).set(auth(tokens.SUPER_ADMIN))).status).toBe(403);
    expect((await http().get(`${API}/portal/customer`).set(auth(portalToken))).status).toBe(200);
  });

  it('missing or bad tokens are 401', async () => {
    expect((await http().get(`${API}/customers`)).status).toBe(401);
    expect((await http().get(`${API}/customers`).set({ Authorization: 'Bearer nope' })).status).toBe(401);
  });

  it('any principal can read /auth/me and own notifications', async () => {
    expect((await http().get(`${API}/auth/me`).set(auth(tokens.OPERATOR))).body.kind).toBe('STAFF');
    expect((await http().get(`${API}/auth/me`).set(auth(portalToken))).body.kind).toBe('CUSTOMER');
    expect((await http().get(`${API}/notifications/unread-count`).set(auth(portalToken))).status).toBe(200);
  });

  it('denied attempts are audited as ACCESS_DENIED', async () => {
    const { prisma } = await bootApp();
    const before = await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } });
    await http().get(`${API}/users`).set(auth(tokens.OPERATOR));
    const after = await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } });
    expect(after).toBeGreaterThan(before);
  });

  it('locks the account after repeated failures and unlocks via admin', async () => {
    const { prisma } = await bootApp();
    const { id } = await staffToken(['SALES'], 'lockme@test.local');
    for (let i = 0; i < 5; i++) await http().post(`${API}/auth/login`).send({ email: 'lockme@test.local', password: 'wrong-password' });
    const locked = await http().post(`${API}/auth/login`).send({ email: 'lockme@test.local', password: 'Password123!' });
    expect(locked.status).toBe(423);
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).lockedAt).not.toBeNull();
    expect((await http().post(`${API}/users/${id}/unlock`).set(auth(tokens.SUPER_ADMIN))).status).toBe(201);
    expect((await http().post(`${API}/auth/login`).send({ email: 'lockme@test.local', password: 'Password123!' })).status).toBe(200);
  });

  it('refresh rotates and a replayed token is rejected', async () => {
    const login = await http().post(`${API}/auth/login`).send({ email: 'test-sales@test.local', password: 'Password123!' });
    const first = login.body.refreshToken as string;
    const r1 = await http().post(`${API}/auth/refresh`).send({ refreshToken: first });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(first);
    // Replay inside the grace window → 409 REFRESH_RACE (not a cascade).
    const replay = await http().post(`${API}/auth/refresh`).send({ refreshToken: first });
    expect(replay.status).toBe(409);
    expect(replay.body.code).toBe('REFRESH_RACE');
    // The new token still works.
    expect((await http().post(`${API}/auth/refresh`).send({ refreshToken: r1.body.refreshToken })).status).toBe(200);
  });
});
