import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from './decorators';
import { AuthUser } from './auth-user';
import { PermissionDeniedError, UnauthorizedError } from '../errors/domain-error';
import { AuditService } from '../audit/audit.service';
import { auditContextStorage } from '../audit/audit-context';

/**
 * Default-deny permission guard (architecture §10).
 *   1. @Public() → allow.
 *   2. No principal → 401.
 *   3. No @RequirePermission() on the route → 403 (and assert-routes-annotated
 *      refuses to boot, so this is a last line of defence).
 *   4. Portal codes (`portal.*`) need a CUSTOMER principal; staff codes need a
 *      STAFF principal. Mixing is never allowed.
 *   5. Any listed code present on the principal → allow; else 403, audited as
 *      ACCESS_DENIED.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly audit: AuditService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthUser | undefined;
    if (!user) throw new UnauthorizedError();

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets) ?? [];
    if (required.length === 0) {
      await this.deny(req, user, 'route has no permission declaration');
      throw new PermissionDeniedError('This endpoint is not available.');
    }

    // '*' = any authenticated principal of either kind (e.g. GET auth/me).
    if (required.includes('*')) return true;

    const portalRoute = required.every((c) => c.startsWith('portal.'));
    const staffRoute = required.every((c) => !c.startsWith('portal.'));
    if (!portalRoute && !staffRoute) throw new Error(`Route mixes portal and staff permission codes: ${required.join(', ')}`);
    if (portalRoute && user.kind !== 'CUSTOMER') {
      await this.deny(req, user, 'staff principal on portal route', required[0]);
      throw new PermissionDeniedError('This endpoint is for customer portal users.');
    }
    if (staffRoute && user.kind !== 'STAFF') {
      await this.deny(req, user, 'customer principal on staff route', required[0]);
      throw new PermissionDeniedError('This endpoint is not available to portal users.');
    }

    if (!required.some((c) => user.permissions.includes(c))) {
      await this.deny(req, user, 'missing permission', required.join('|'));
      throw new PermissionDeniedError('You do not have permission to perform this action.', { required });
    }
    return true;
  }

  private async deny(req: any, user: AuthUser, reason: string, permission?: string) {
    // The audit interceptor runs after guards, so build a context here.
    const ctx = {
      actorType: (user.kind === 'CUSTOMER' ? 'CUSTOMER' : 'STAFF') as 'CUSTOMER' | 'STAFF',
      actorId: user.id,
      actorName: user.name,
      actorCustomerId: user.customerId ?? null,
      ip: req.ip ?? null,
      userAgent: req.headers?.['user-agent'] ?? null,
      requestId: null,
    };
    await auditContextStorage.run(ctx, () => this.audit.accessDenied({ reason, permission, path: `${req.method} ${req.originalUrl ?? req.url}` }));
  }
}
