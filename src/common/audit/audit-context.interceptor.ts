import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable } from 'rxjs';
import { AuditContext, auditContextStorage } from './audit-context';
import { AuthUser } from '../auth/auth-user';

/**
 * Captures actor, ip, user-agent and a request id into AsyncLocalStorage for
 * the duration of the request, so services and the Prisma audit extension
 * never need the actor passed by hand. Runs after the guards, so req.user is
 * already resolved for authenticated routes.
 */
@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthUser | undefined;
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    const ip = (req.ip as string) || (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || null;
    const ctx: AuditContext = {
      actorType: user ? (user.kind === 'CUSTOMER' ? 'CUSTOMER' : 'STAFF') : 'SYSTEM',
      actorId: user?.id ?? null,
      actorName: user?.name ?? (user ? user.email : 'anonymous'),
      actorCustomerId: user?.customerId ?? null,
      ip,
      userAgent: (req.headers['user-agent'] as string) ?? null,
      requestId,
    };
    const res = context.switchToHttp().getResponse();
    if (res?.setHeader) res.setHeader('x-request-id', requestId);
    return auditContextStorage.run(ctx, () => next.handle());
  }
}
