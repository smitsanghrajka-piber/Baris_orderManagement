import { INestApplication, Logger } from '@nestjs/common';
import { ModulesContainer, Reflector } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from './decorators';
import { isKnownPermission } from './permission-catalogue';

/**
 * Refuse to boot if any HTTP route lacks @RequirePermission()/@Public(), or
 * names a permission code that is not in the catalogue. PermissionsGuard is
 * default-deny, so an un-annotated route would fail *silently* as a 403 that
 * looks like an ordinary permission error. ROUTE_AUTH_CHECK=warn downgrades
 * to a warning for emergencies.
 */
export function assertRoutesAnnotated(app: INestApplication): void {
  const modules = app.get(ModulesContainer);
  const reflector = app.get(Reflector);
  const problems: string[] = [];
  let count = 0;

  for (const module of modules.values()) {
    for (const wrapper of module.controllers.values()) {
      const ctrl = wrapper.metatype as any;
      if (!ctrl || typeof ctrl !== 'function') continue;
      const basePath = Reflect.getMetadata(PATH_METADATA, ctrl) ?? '';
      const classPublic = reflector.get<boolean>(IS_PUBLIC_KEY, ctrl);
      const classPerms = reflector.get<string[]>(PERMISSIONS_KEY, ctrl);
      const proto = ctrl.prototype;
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === 'constructor') continue;
        const handler = proto[name];
        if (typeof handler !== 'function') continue;
        if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue; // not a route
        count++;
        const routePath = Reflect.getMetadata(PATH_METADATA, handler) ?? '';
        const label = `${ctrl.name}.${name} (/${[basePath, routePath].filter(Boolean).join('/').replace(/\/+/g, '/')})`;
        const isPublic = reflector.get<boolean>(IS_PUBLIC_KEY, handler) ?? classPublic;
        const perms = reflector.get<string[]>(PERMISSIONS_KEY, handler) ?? classPerms;
        if (isPublic) continue;
        if (!perms || perms.length === 0) { problems.push(`${label}: no @RequirePermission() or @Public()`); continue; }
        if (perms.includes('*')) { if (perms.length > 1) problems.push(`${label}: '*' cannot be combined with other codes`); continue; }
        for (const p of perms) if (!isKnownPermission(p)) problems.push(`${label}: unknown permission code "${p}"`);
        const portal = perms.filter((p) => p.startsWith('portal.')).length;
        if (portal !== 0 && portal !== perms.length) problems.push(`${label}: mixes portal and staff permission codes`);
      }
    }
  }

  const log = new Logger('RouteAuthCheck');
  if (problems.length) {
    const msg = `Route authorisation check failed for ${problems.length} route(s):\n  - ${problems.join('\n  - ')}`;
    if (process.env.ROUTE_AUTH_CHECK === 'warn') log.warn(msg);
    else throw new Error(msg);
  } else {
    log.log(`${count} routes annotated`);
  }
}
