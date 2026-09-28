/* eslint-disable no-console */
import { INestApplication } from '@nestjs/common';
import { execSync } from 'child_process';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';

/**
 * Integration harness. Requires DATABASE_URL_TEST (see test/setup-env.ts).
 * Boots the real app (guards, filters, interceptors) once per Jest worker,
 * migrates + seeds the test database, and offers login helpers.
 */
export const HAS_DB = !!process.env.DATABASE_URL_TEST;

let app: INestApplication | null = null;
let prisma: PrismaClient | null = null;
let prepared = false;

export function describeWithDb(name: string, fn: () => void) {
  (HAS_DB ? describe : describe.skip)(name, fn);
}

async function prepareDb() {
  if (prepared) return;
  const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL, DIRECT_URL: process.env.DIRECT_URL };
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env });
  execSync('npx ts-node prisma/seed.ts', { stdio: 'inherit', env });
  prepared = true;
}

export async function bootApp(): Promise<{ app: INestApplication; prisma: PrismaClient }> {
  if (app && prisma) return { app, prisma };
  await prepareDb();
  const { createApp } = await import('../../../src/main');
  const created = await createApp();
  app = created.app;
  // Listen once on an ephemeral port. supertest otherwise calls listen() on
  // the bare server for every request, which under Promise.all piles up
  // listeners and MaxListenersExceeded warnings.
  await app.listen(0);
  prisma = app.get((await import('../../../src/common/prisma/prisma.service')).PrismaService) as unknown as PrismaClient;
  return { app, prisma };
}

export async function closeApp() {
  if (app) { await app.close(); app = null; prisma = null; }
}

export function http() {
  if (!app) throw new Error('bootApp() first');
  return request(app.getHttpServer());
}

export const API = '/api/v1';

/** Create (or reuse) a staff user with the given system roles and return a bearer token. */
export async function staffToken(roleCodes: string[], email = `test-${roleCodes.join('-').toLowerCase()}@test.local`): Promise<{ token: string; id: string }> {
  const db = prisma!;
  const roles = await db.role.findMany({ where: { code: { in: roleCodes } } });
  const password = 'Password123!';
  const user = await db.user.upsert({
    where: { email },
    update: { isActive: true, lockedAt: null, failedLogins: 0, passwordHash: await bcrypt.hash(password, 4), mustChangePassword: false },
    create: { email, name: `Test ${roleCodes.join('/')}`, passwordHash: await bcrypt.hash(password, 4), roles: { create: roles.map((r) => ({ roleId: r.id })) } },
  });
  await db.userRole.deleteMany({ where: { userId: user.id } });
  await db.userRole.createMany({ data: roles.map((r) => ({ userId: user.id, roleId: r.id })) });
  const res = await http().post(`${API}/auth/login`).send({ email, password });
  if (res.status !== 200) throw new Error(`staff login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.accessToken, id: user.id };
}

/** Create a customer with one contact + portal login; returns ids and a bearer token. */
export async function customerWithPortalUser(name: string, opts: { admin?: boolean; canApproveArtwork?: boolean } = {}) {
  const db = prisma!;
  const suffix = Math.random().toString(36).slice(2, 8);
  const customer = await db.customer.create({ data: { number: `CUS-T${suffix.toUpperCase()}`, name: `${name} ${suffix}` } });
  const contact = await db.customerContact.create({ data: { customerId: customer.id, name: `${name} Contact`, email: `contact-${suffix}@test.local`, canApproveArtwork: !!opts.canApproveArtwork, canSubmitOrders: true } });
  const role = await db.role.findUniqueOrThrow({ where: { code: opts.admin ? 'CUSTOMER_ADMIN' : 'CUSTOMER_USER' } });
  const password = 'Password123!';
  const email = `portal-${suffix}@test.local`;
  const user = await db.customerUser.create({ data: { customerId: customer.id, contactId: contact.id, email, name: `${name} Portal`, passwordHash: await bcrypt.hash(password, 4), roles: { create: [{ roleId: role.id }] } } });
  const res = await http().post(`${API}/auth/portal/login`).send({ email, password });
  if (res.status !== 200) throw new Error(`portal login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { customer, contact, user, token: res.body.accessToken as string };
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}
