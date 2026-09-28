import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { PrincipalService } from '../../common/auth/principal.service';
import { ConflictError, NotFoundError, PermissionDeniedError, ValidationError } from '../../common/errors/domain-error';
import { ListQueryDto, orderBy, pageArgs, toPage } from '../../common/util/pagination';
import { isKnownPermission } from '../../common/auth/permission-catalogue';
import { CloneRoleDto, CreateUserDto, SetRolePermissionsDto, SetUserRolesDto, UpdateUserDto } from './dto/users.dto';
import { AuthUser } from '../../common/auth/auth-user';

const userSelect = {
  id: true, email: true, name: true, isActive: true, mustChangePassword: true, lockedAt: true, lastLoginAt: true, createdAt: true, updatedAt: true,
  roles: { select: { role: { select: { code: true, name: true } } } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly principals: PrincipalService) {}

  async list(q: ListQueryDto) {
    const { skip, take } = pageArgs(q);
    const where: Prisma.UserWhereInput = q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } : {};
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, select: userSelect, skip, take, orderBy: orderBy(q.sort, ['name', 'email', 'createdAt', 'lastLoginAt'] as const, { name: 'asc' }) }),
      this.prisma.user.count({ where }),
    ]);
    return toPage(items.map(flattenRoles), total, q);
  }

  async get(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!u) throw new NotFoundError('User');
    return flattenRoles(u);
  }

  async create(dto: CreateUserDto) {
    const roles = await this.staffRoles(dto.roleCodes);
    const password = dto.password ?? randomPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email.trim().toLowerCase(),
          name: dto.name.trim(),
          passwordHash,
          mustChangePassword: !dto.password,
          roles: { create: roles.map((r) => ({ roleId: r.id })) },
        },
        select: userSelect,
      });
      await this.audit.record(tx, { action: 'USER_CREATED', entityType: 'User', entityId: created.id, after: { email: created.email, roles: dto.roleCodes } });
      return created;
    });
    return { ...flattenRoles(user), ...(dto.password ? {} : { temporaryPassword: password }) };
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('User');
    if (dto.isActive === false && id === actor.id) throw new ValidationError('You cannot deactivate your own account.');
    if (dto.isActive === false) await this.assertNotLastSuperAdmin(id);
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { ...(dto.email ? { email: dto.email.trim().toLowerCase() } : {}), ...(dto.name ? { name: dto.name.trim() } : {}), ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}) },
        select: userSelect,
      });
      if (dto.isActive === false) await this.audit.record(tx, { action: 'USER_DISABLED', entityType: 'User', entityId: id });
      return updated;
    });
    this.principals.invalidate('STAFF', id);
    return flattenRoles(user);
  }

  async setRoles(id: string, dto: SetUserRolesDto, actor: AuthUser) {
    const roles = await this.staffRoles(dto.roleCodes);
    const existing = await this.prisma.user.findUnique({ where: { id }, include: { roles: { include: { role: true } } } });
    if (!existing) throw new NotFoundError('User');
    const before = existing.roles.map((r) => r.role.code);
    if (id === actor.id && before.includes('SUPER_ADMIN') && !dto.roleCodes.includes('SUPER_ADMIN')) throw new ValidationError('You cannot remove your own Super Administrator role.');
    if (before.includes('SUPER_ADMIN') && !dto.roleCodes.includes('SUPER_ADMIN')) await this.assertNotLastSuperAdmin(id);
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: roles.map((r) => ({ userId: id, roleId: r.id })) });
      await this.audit.record(tx, { action: 'USER_ROLES_CHANGED', entityType: 'User', entityId: id, before: { roles: before }, after: { roles: dto.roleCodes } });
      return tx.user.findUniqueOrThrow({ where: { id }, select: userSelect });
    });
    this.principals.invalidate('STAFF', id);
    return flattenRoles(user);
  }

  async unlock(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundError('User');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { lockedAt: null, failedLogins: 0 } });
      await this.audit.record(tx, { action: 'USER_UNLOCKED', entityType: 'User', entityId: id });
    });
    this.principals.invalidate('STAFF', id);
    return this.get(id);
  }

  async resetPassword(id: string, password: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundError('User');
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true, failedLogins: 0, lockedAt: null } });
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'admin_reset' } });
      await this.audit.record(tx, { action: 'USER_PASSWORD_RESET_BY_ADMIN', entityType: 'User', entityId: id });
    });
    this.principals.invalidate('STAFF', id);
  }

  // ─── Roles & permissions ───

  listRoles(scope?: 'STAFF' | 'CUSTOMER') {
    return this.prisma.role.findMany({
      where: scope ? { scope } : {},
      orderBy: [{ scope: 'asc' }, { isSystem: 'desc' }, { name: 'asc' }],
      include: { permissions: { select: { permission: { select: { code: true } } } }, _count: { select: { users: true, customerUsers: true } } },
    }).then((roles) => roles.map((r) => ({
      id: r.id, code: r.code, name: r.name, description: r.description, isSystem: r.isSystem, scope: r.scope,
      permissions: r.permissions.map((p) => p.permission.code).sort(),
      userCount: r._count.users + r._count.customerUsers,
    })));
  }

  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] });
  }

  async cloneRole(sourceId: string, dto: CloneRoleDto) {
    const source = await this.prisma.role.findUnique({ where: { id: sourceId }, include: { permissions: true } });
    if (!source) throw new NotFoundError('Role');
    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: { code: dto.code, name: dto.name, description: dto.description, isSystem: false, scope: source.scope, permissions: { create: source.permissions.map((p) => ({ permissionId: p.permissionId })) } },
      });
      await this.audit.record(tx, { action: 'ROLE_CREATED', entityType: 'Role', entityId: created.id, after: { code: dto.code, clonedFrom: source.code } });
      return created;
    });
    return role;
  }

  async setRolePermissions(roleId: string, dto: SetRolePermissionsDto) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
    if (!role) throw new NotFoundError('Role');
    if (role.isSystem) throw new PermissionDeniedError('System roles are fixed. Clone the role to customise it.');
    const unknown = dto.permissionCodes.filter((c) => !isKnownPermission(c));
    if (unknown.length) throw new ValidationError(`Unknown permission code(s): ${unknown.join(', ')}`);
    const wrongScope = dto.permissionCodes.filter((c) => c.startsWith('portal.') !== (role.scope === 'CUSTOMER'));
    if (wrongScope.length) throw new ValidationError(`These permissions do not belong to a ${role.scope.toLowerCase()} role: ${wrongScope.join(', ')}`);
    const perms = await this.prisma.permission.findMany({ where: { code: { in: dto.permissionCodes } } });
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId, permissionId: p.id })) });
      await this.audit.record(tx, {
        action: 'PERMISSION_CHANGED', entityType: 'Role', entityId: roleId,
        before: { permissions: role.permissions.map((p) => p.permission.code).sort() }, after: { permissions: dto.permissionCodes.slice().sort() },
      });
    });
    this.principals.invalidateAll();
    return (await this.listRoles()).find((r) => r.id === roleId);
  }

  private async staffRoles(codes: string[]) {
    const roles = await this.prisma.role.findMany({ where: { code: { in: codes }, scope: 'STAFF' } });
    const missing = codes.filter((c) => !roles.some((r) => r.code === c));
    if (missing.length) throw new ValidationError(`Unknown staff role(s): ${missing.join(', ')}`);
    return roles;
  }

  private async assertNotLastSuperAdmin(userId: string) {
    const admins = await this.prisma.user.count({ where: { isActive: true, id: { not: userId }, roles: { some: { role: { code: 'SUPER_ADMIN' } } } } });
    if (admins === 0) throw new ConflictError('LAST_SUPER_ADMIN', 'At least one active Super Administrator must remain.');
  }
}

function flattenRoles<T extends { roles: { role: { code: string; name: string } }[] }>(u: T) {
  const { roles, ...rest } = u;
  return { ...rest, roles: roles.map((r) => r.role.code), roleNames: roles.map((r) => r.role.name) };
}

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 14; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out + '1a';
}
