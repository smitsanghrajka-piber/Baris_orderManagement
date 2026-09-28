import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, JwtClaims } from './auth-user';
import { LockedError, UnauthorizedError } from '../errors/domain-error';

const TTL_MS = 30_000;

interface CacheEntry<T> { value: T; expires: number }

/**
 * Resolves JWT claims into an AuthUser: re-checks isActive / lockedAt, loads
 * roles and flattens permissions. Cached for 30 s per principal so a
 * disabled account or an edited role is enforced within half a minute
 * without a database hit on every request.
 */
@Injectable()
export class PrincipalService {
  private cache = new Map<string, CacheEntry<AuthUser>>();

  constructor(private readonly prisma: PrismaService) {}

  invalidate(kind: 'STAFF' | 'CUSTOMER', id: string) {
    this.cache.delete(`${kind}:${id}`);
  }

  invalidateAll() {
    this.cache.clear();
  }

  async resolve(claims: JwtClaims): Promise<AuthUser> {
    const key = `${claims.kind}:${claims.sub}`;
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const user = claims.kind === 'CUSTOMER' ? await this.loadCustomerUser(claims.sub) : await this.loadStaffUser(claims.sub);
    this.cache.set(key, { value: user, expires: Date.now() + TTL_MS });
    return user;
  }

  private async loadStaffUser(id: string): Promise<AuthUser> {
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });
    if (!u || !u.isActive) throw new UnauthorizedError('This account is not active.', 'ACCOUNT_INACTIVE');
    if (u.lockedAt) throw new LockedError('This account is locked. Ask an administrator to unlock it.');
    const roles = u.roles.map((r) => r.role.code);
    const permissions = [...new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code)))];
    return { kind: 'STAFF', id: u.id, email: u.email, name: u.name, roles, permissions, mustChangePassword: u.mustChangePassword };
  }

  private async loadCustomerUser(id: string): Promise<AuthUser> {
    const u = await this.prisma.customerUser.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, status: true, archivedAt: true } },
        contact: { select: { id: true, canApproveArtwork: true, canAcceptQuotations: true, canSubmitOrders: true, archivedAt: true } },
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });
    if (!u || !u.isActive) throw new UnauthorizedError('This account is not active.', 'ACCOUNT_INACTIVE');
    if (u.lockedAt) throw new LockedError('This account is locked. Ask your Baris contact to unlock it.');
    if (u.customer.archivedAt || u.customer.status === 'INACTIVE') throw new UnauthorizedError('Your organisation\'s portal access is not active.', 'CUSTOMER_INACTIVE');
    const roles = u.roles.map((r) => r.role.code);
    const permissions = [...new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code)))];
    const contact = u.contact && !u.contact.archivedAt ? u.contact : null;
    return {
      kind: 'CUSTOMER',
      id: u.id,
      email: u.email,
      name: u.name,
      roles,
      permissions,
      customerId: u.customerId,
      contactId: contact?.id ?? null,
      contactFlags: {
        canApproveArtwork: !!contact?.canApproveArtwork,
        canAcceptQuotations: !!contact?.canAcceptQuotations,
        canSubmitOrders: !!contact?.canSubmitOrders,
      },
      mustChangePassword: u.mustChangePassword,
    };
  }
}
