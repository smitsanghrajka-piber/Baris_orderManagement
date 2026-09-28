import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthUser } from './auth-user';

export const IS_PUBLIC_KEY = 'baris:isPublic';
export const PERMISSIONS_KEY = 'baris:permissions';

/** Route needs no JWT (login, health, signed local file download). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Route requires ANY of the listed permission codes. Codes starting with
 * `portal.` are only satisfiable by CUSTOMER principals; all others only by
 * STAFF principals (PermissionsGuard enforces both).
 */
export const RequirePermission = (...codes: string[]) => SetMetadata(PERMISSIONS_KEY, codes);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});
