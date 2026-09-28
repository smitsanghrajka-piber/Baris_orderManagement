import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './decorators';
import { LockedError, UnauthorizedError } from '../errors/domain-error';

/**
 * Global JWT guard. @Public() routes skip authentication entirely. Errors
 * raised while resolving the principal (inactive, locked) are surfaced as
 * their own codes rather than a generic 401.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err instanceof LockedError || err instanceof UnauthorizedError) throw err;
    if (err || !user) {
      const reason = info?.name === 'TokenExpiredError' ? 'Your session has expired. Sign in again.' : 'Authentication required.';
      const code = info?.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED';
      throw new UnauthorizedError(reason, code);
    }
    return user;
  }
}
