import { Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user';
import { TenantMismatchError } from '../errors/domain-error';

/**
 * Registry mapping an entityType (as used by Attachment, Activity,
 * Notification and file routes) to a function that resolves the owning
 * customer. `null` customerId means the entity is Baris-internal and is
 * never portal-readable. Modules register their own entity types at init.
 */
export type TenantResolution = { customerId: string | null } | null;
export type TenantResolver = (entityId: string) => Promise<TenantResolution>;

@Injectable()
export class TenantResolverService {
  private readonly resolvers = new Map<string, TenantResolver>();

  register(entityType: string, resolver: TenantResolver) {
    this.resolvers.set(entityType, resolver);
  }

  has(entityType: string) {
    return this.resolvers.has(entityType);
  }

  async resolve(entityType: string, entityId: string): Promise<TenantResolution> {
    const r = this.resolvers.get(entityType);
    if (!r) return null;
    return r(entityId);
  }

  /**
   * Portal principals must match the entity's customer; staff always pass.
   * A mismatch is reported as NOT_FOUND so existence never leaks.
   */
  async assertAccess(user: AuthUser, entityType: string, entityId: string, what = 'The requested record'): Promise<string | null> {
    const res = await this.resolve(entityType, entityId);
    if (!res) throw new TenantMismatchError(what);
    if (user.kind === 'CUSTOMER' && (res.customerId === null || res.customerId !== user.customerId)) throw new TenantMismatchError(what);
    return res.customerId;
  }
}

/** Throw NOT_FOUND unless the record belongs to the portal user's tenant (staff pass). */
export function assertSameTenant(user: AuthUser, customerId: string | null | undefined, what = 'The requested record') {
  if (user.kind !== 'CUSTOMER') return;
  if (!customerId || customerId !== user.customerId) throw new TenantMismatchError(what);
}
