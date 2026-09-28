import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { PrincipalService } from '../../common/auth/principal.service';
import { NotFoundError, ValidationError } from '../../common/errors/domain-error';
import { CreateCustomerUserDto, UpdateCustomerUserDto } from './dto/customers.dto';
import { AuthService } from '../auth/auth.service';
import { EmailOutboxService } from '../notifications/email-outbox.service';
import { DomainEventsService } from '../notifications/domain-events.service';

const select = {
  id: true, customerId: true, email: true, name: true, isActive: true, mustChangePassword: true, lockedAt: true, lastLoginAt: true, contactId: true, createdAt: true,
  roles: { select: { role: { select: { code: true, name: true } } } },
} as const;

/**
 * Portal logins for a customer. Used by staff (customer_user.manage) and by
 * Customer Administrators through the portal (portal.user.manage), which
 * passes `restrictToCustomerId` so the tenant can never be escaped and
 * `byCustomerAdmin` so contact authority flags cannot be granted.
 */
@Injectable()
export class CustomerUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly principals: PrincipalService,
    private readonly auth: AuthService,
    private readonly outbox: EmailOutboxService,
    private readonly events: DomainEventsService,
  ) {}

  async list(customerId: string) {
    const users = await this.prisma.customerUser.findMany({ where: { customerId }, select, orderBy: { name: 'asc' } });
    return users.map(flatten);
  }

  async create(customerId: string, dto: CreateCustomerUserDto, opts: { byCustomerAdmin?: boolean } = {}) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer || customer.archivedAt) throw new NotFoundError('Customer');
    const roles = await this.customerRoles(dto.roleCodes);
    if (dto.contactId) {
      const contact = await this.prisma.customerContact.findFirst({ where: { id: dto.contactId, customerId, archivedAt: null }, include: { portalUser: true } });
      if (!contact) throw new NotFoundError('Contact');
      if (contact.portalUser) throw new ValidationError(`Contact ${contact.name} already has a portal login.`);
    }
    const tempPassword = dto.password ?? null;
    const passwordHash = await bcrypt.hash(tempPassword ?? randomSecret(), 10);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.customerUser.create({
        data: {
          customerId,
          email: dto.email.trim().toLowerCase(),
          name: dto.name.trim(),
          passwordHash,
          mustChangePassword: true,
          contactId: dto.contactId ?? null,
          roles: { create: roles.map((r) => ({ roleId: r.id })) },
        },
        select,
      });
      await this.audit.recordWithActivity(tx,
        { action: 'CUSTOMER_USER_CREATED', entityType: 'CustomerUser', entityId: created.id, after: { email: created.email, roles: dto.roleCodes, byCustomerAdmin: !!opts.byCustomerAdmin } },
        { customerId, verb: 'portal_user_added', summary: `Portal login created for ${created.name}`, visibility: 'SHARED' });
      return created;
    });
    // Welcome email with a set-password link (valid 72 h). Sent even when a
    // password was supplied so the person always has a self-service path.
    const token = await this.auth.createResetToken('CUSTOMER', user.id, 72 * 3600 * 1000);
    const link = `${process.env.APP_URL ?? 'http://localhost:5173'}/portal/reset-password?token=${token}`;
    await this.outbox.enqueue({
      toEmail: user.email, toName: user.name,
      subject: `Your Baris IML portal login for ${customer.name}`,
      html: `<p>Hello ${esc(user.name)},</p><p>A portal login has been created for you at Baris IML. Set your password here (link valid for 72 hours):</p><p><a href="${link}">${link}</a></p>`,
      text: `A portal login has been created for you at Baris IML. Set your password here (valid 72 hours): ${link}`,
    });
    this.events.emit({
      type: 'customer_user.created', customerId, entityType: 'CustomerUser', entityId: user.id,
      title: `Portal login created for ${user.name}`, body: 'Set your password using the link in your welcome email.',
      portalLink: '/portal', targetCustomerUserId: user.id,
    });
    return flatten(user);
  }

  async update(customerId: string, id: string, dto: UpdateCustomerUserDto, opts: { byCustomerAdmin?: boolean; actorId?: string } = {}) {
    const existing = await this.prisma.customerUser.findFirst({ where: { id, customerId }, select });
    if (!existing) throw new NotFoundError('Portal user');
    if (opts.byCustomerAdmin && dto.isActive === false && opts.actorId === id) throw new ValidationError('You cannot deactivate your own login.');
    if (dto.contactId) {
      const contact = await this.prisma.customerContact.findFirst({ where: { id: dto.contactId, customerId, archivedAt: null }, include: { portalUser: true } });
      if (!contact) throw new NotFoundError('Contact');
      if (contact.portalUser && contact.portalUser.id !== id) throw new ValidationError(`Contact ${contact.name} is already linked to another login.`);
    }
    const roles = dto.roleCodes ? await this.customerRoles(dto.roleCodes) : null;
    const user = await this.prisma.$transaction(async (tx) => {
      if (roles) {
        await tx.customerUserRole.deleteMany({ where: { customerUserId: id } });
        await tx.customerUserRole.createMany({ data: roles.map((r) => ({ customerUserId: id, roleId: r.id })) });
      }
      const updated = await tx.customerUser.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.contactId !== undefined ? { contactId: dto.contactId } : {}),
        },
        select,
      });
      if (dto.isActive === false) {
        await tx.refreshToken.updateMany({ where: { customerUserId: id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'disabled' } });
        await this.audit.record(tx, { action: 'CUSTOMER_USER_DISABLED', entityType: 'CustomerUser', entityId: id });
      }
      if (roles) await this.audit.record(tx, { action: 'CUSTOMER_USER_ROLES_CHANGED', entityType: 'CustomerUser', entityId: id, before: { roles: existing.roles.map((r) => r.role.code) }, after: { roles: dto.roleCodes } });
      return updated;
    });
    this.principals.invalidate('CUSTOMER', id);
    return flatten(user);
  }

  async unlock(customerId: string, id: string) {
    const existing = await this.prisma.customerUser.findFirst({ where: { id, customerId } });
    if (!existing) throw new NotFoundError('Portal user');
    await this.prisma.$transaction(async (tx) => {
      await tx.customerUser.update({ where: { id }, data: { lockedAt: null, failedLogins: 0 } });
      await this.audit.record(tx, { action: 'CUSTOMER_USER_UNLOCKED', entityType: 'CustomerUser', entityId: id });
    });
    this.principals.invalidate('CUSTOMER', id);
    return flatten(await this.prisma.customerUser.findUniqueOrThrow({ where: { id }, select }));
  }

  async resendInvite(customerId: string, id: string) {
    const user = await this.prisma.customerUser.findFirst({ where: { id, customerId }, include: { customer: true } });
    if (!user) throw new NotFoundError('Portal user');
    const token = await this.auth.createResetToken('CUSTOMER', user.id, 72 * 3600 * 1000);
    const link = `${process.env.APP_URL ?? 'http://localhost:5173'}/portal/reset-password?token=${token}`;
    await this.outbox.enqueue({
      toEmail: user.email, toName: user.name,
      subject: `Set your Baris IML portal password`,
      html: `<p>Hello ${esc(user.name)},</p><p>Set your Baris IML portal password here (link valid for 72 hours):</p><p><a href="${link}">${link}</a></p>`,
      text: `Set your Baris IML portal password here (valid 72 hours): ${link}`,
    });
    await this.audit.record(this.prisma, { action: 'CUSTOMER_USER_INVITE_RESENT', entityType: 'CustomerUser', entityId: id });
  }

  private async customerRoles(codes: string[]) {
    const roles = await this.prisma.role.findMany({ where: { code: { in: codes }, scope: 'CUSTOMER' } });
    const missing = codes.filter((c) => !roles.some((r) => r.code === c));
    if (missing.length) throw new ValidationError(`Unknown customer role(s): ${missing.join(', ')}`);
    return roles;
  }
}

function flatten<T extends { roles: { role: { code: string; name: string } }[] }>(u: T) {
  const { roles, ...rest } = u;
  return { ...rest, roles: roles.map((r) => r.role.code), roleNames: roles.map((r) => r.role.name) };
}

function randomSecret() {
  return Array.from({ length: 32 }, () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 62)]).join('');
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
