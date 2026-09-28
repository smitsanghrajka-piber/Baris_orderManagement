import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { NumberingService } from '../../common/numbering/numbering.service';
import { TenantResolverService } from '../../common/tenant/tenant-resolver.service';
import { ConflictError, NotFoundError, ValidationError, VersionConflictError } from '../../common/errors/domain-error';
import { orderBy, pageArgs, toPage } from '../../common/util/pagination';
import { ContactDto, CreateCustomerDto, CreditHoldDto, CustomerListQueryDto, SiteDto, UpdateContactDto, UpdateCustomerDto, UpdateSiteDto } from './dto/customers.dto';
import { AuthUser } from '../../common/auth/auth-user';

const summarySelect = {
  id: true, number: true, name: true, tradingName: true, status: true, currency: true, creditHold: true,
  salesRep: { select: { id: true, name: true } }, archivedAt: true, createdAt: true, updatedAt: true, version: true,
  _count: { select: { skus: true, contacts: true, users: true } },
} satisfies Prisma.CustomerSelect;

@Injectable()
export class CustomersService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly tenants: TenantResolverService,
  ) {}

  onModuleInit() {
    this.tenants.register('Customer', async (id) => {
      const c = await this.prisma.customer.findUnique({ where: { id }, select: { id: true } });
      return c ? { customerId: c.id } : null;
    });
    this.tenants.register('CustomerContact', async (id) => {
      const c = await this.prisma.customerContact.findUnique({ where: { id }, select: { customerId: true } });
      return c ? { customerId: c.customerId } : null;
    });
    this.tenants.register('CustomerSite', async (id) => {
      const c = await this.prisma.customerSite.findUnique({ where: { id }, select: { customerId: true } });
      return c ? { customerId: c.customerId } : null;
    });
    this.tenants.register('CustomerUser', async (id) => {
      const c = await this.prisma.customerUser.findUnique({ where: { id }, select: { customerId: true } });
      return c ? { customerId: c.customerId } : null;
    });
  }

  async list(q: CustomerListQueryDto) {
    const { skip, take } = pageArgs(q);
    const where: Prisma.CustomerWhereInput = {
      ...(q.includeArchived === 'true' ? {} : { archivedAt: null }),
      ...(q.status && q.status !== 'ALL' ? { status: q.status as any } : {}),
      ...(q.q ? { OR: [
        { name: { contains: q.q, mode: 'insensitive' } },
        { tradingName: { contains: q.q, mode: 'insensitive' } },
        { number: { contains: q.q, mode: 'insensitive' } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({ where, select: summarySelect, skip, take, orderBy: orderBy(q.sort, ['name', 'number', 'status', 'createdAt', 'updatedAt'] as const, { name: 'asc' }) }),
      this.prisma.customer.count({ where }),
    ]);
    return toPage(items, total, q);
  }

  /** 360° view: master record + contacts + sites + portal users + counts. */
  async get360(id: string) {
    const c = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        paymentTerms: true, salesRep: { select: { id: true, name: true, email: true } }, defaultMaterial: true, defaultFinish: true,
        creditHoldBy: { select: { id: true, name: true } },
        contacts: { where: { archivedAt: null }, orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }], include: { portalUser: { select: { id: true, email: true, isActive: true } } } },
        sites: { where: { archivedAt: null }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] },
        users: { orderBy: { name: 'asc' }, select: { id: true, email: true, name: true, isActive: true, lockedAt: true, lastLoginAt: true, mustChangePassword: true, contactId: true, roles: { select: { role: { select: { code: true, name: true } } } } } },
        _count: { select: { skus: true } },
      },
    });
    if (!c) throw new NotFoundError('Customer');
    const skus = await this.prisma.customerSku.findMany({ where: { customerId: id, archivedAt: null }, orderBy: { number: 'asc' }, select: { id: true, number: true, customerSkuCode: true, description: true, status: true, currentSpecification: { select: { id: true, revisionNo: true, status: true } } } });
    return { ...c, users: c.users.map((u) => ({ ...u, roles: u.roles.map((r) => r.role.code) })), skus };
  }

  async create(dto: CreateCustomerDto) {
    return this.prisma.$transaction(async (tx) => {
      const number = await this.numbering.next(tx, 'CUSTOMER');
      const created = await tx.customer.create({ data: { ...dto, name: dto.name.trim(), number } });
      await this.audit.recordWithActivity(tx, { action: 'CUSTOMER_CREATED', entityType: 'Customer', entityId: created.id, after: created }, { customerId: created.id, verb: 'created', summary: `Customer ${created.number} created`, visibility: 'INTERNAL' });
      return created;
    });
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const { version, ...data } = dto;
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Customer');
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.customer.updateMany({ where: { id, version }, data: { ...data, version: version + 1 } });
      if (count === 0) throw new VersionConflictError('This customer');
      const updated = await tx.customer.findUniqueOrThrow({ where: { id } });
      await this.audit.record(tx, { action: 'CUSTOMER_UPDATED', entityType: 'Customer', entityId: id, before: existing, after: updated });
      return updated;
    });
  }

  async archive(id: string) {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Customer');
    if (existing.archivedAt) return existing;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({ where: { id }, data: { archivedAt: new Date(), status: 'INACTIVE', version: { increment: 1 } } });
      await tx.customerUser.updateMany({ where: { customerId: id }, data: { isActive: false } });
      await tx.refreshToken.updateMany({ where: { customerUser: { customerId: id }, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'customer_archived' } });
      await this.audit.recordWithActivity(tx, { action: 'CUSTOMER_ARCHIVED', entityType: 'Customer', entityId: id, before: existing, after: updated }, { customerId: id, verb: 'archived', summary: `Customer ${existing.number} archived` });
      return updated;
    });
  }

  async creditHold(id: string, dto: CreditHoldDto, actor: AuthUser) {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Customer');
    if (dto.hold && !dto.reason?.trim()) throw new ValidationError('A reason is required to place a customer on credit hold.');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({
        where: { id },
        data: dto.hold
          ? { creditHold: true, creditHoldReason: dto.reason!.trim(), creditHoldAt: new Date(), creditHoldByUserId: actor.id, version: { increment: 1 } }
          : { creditHold: false, creditHoldReason: null, creditHoldAt: null, creditHoldByUserId: null, version: { increment: 1 } },
      });
      await this.audit.recordWithActivity(tx,
        { action: dto.hold ? 'CUSTOMER_CREDIT_HOLD_SET' : 'CUSTOMER_CREDIT_HOLD_LIFTED', entityType: 'Customer', entityId: id, before: { creditHold: existing.creditHold, creditHoldReason: existing.creditHoldReason }, after: { creditHold: updated.creditHold, creditHoldReason: updated.creditHoldReason } },
        { customerId: id, verb: dto.hold ? 'credit_hold' : 'credit_hold_lifted', summary: dto.hold ? `Credit hold placed: ${dto.reason}` : 'Credit hold lifted' });
      return updated;
    });
  }

  // ─── Contacts ───

  async addContact(customerId: string, dto: ContactDto) {
    await this.mustExist(customerId);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) await tx.customerContact.updateMany({ where: { customerId, isPrimary: true }, data: { isPrimary: false } });
      const c = await tx.customerContact.create({ data: { ...dto, customerId, email: dto.email?.trim().toLowerCase() } });
      await this.audit.recordWithActivity(tx, { action: 'CONTACT_CREATED', entityType: 'CustomerContact', entityId: c.id, after: c }, { customerId, verb: 'contact_added', summary: `Contact ${c.name} added`, visibility: 'SHARED' });
      return c;
    });
  }

  async updateContact(customerId: string, contactId: string, dto: UpdateContactDto) {
    const existing = await this.prisma.customerContact.findFirst({ where: { id: contactId, customerId } });
    if (!existing) throw new NotFoundError('Contact');
    return this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) await tx.customerContact.updateMany({ where: { customerId, isPrimary: true, id: { not: contactId } }, data: { isPrimary: false } });
      const c = await tx.customerContact.update({ where: { id: contactId }, data: { ...dto, email: dto.email === undefined ? undefined : dto.email?.trim().toLowerCase() } });
      const flagsChanged = (['canApproveArtwork', 'canAcceptQuotations', 'canSubmitOrders'] as const).some((f) => dto[f] !== undefined && dto[f] !== existing[f]);
      await this.audit.record(tx, { action: flagsChanged ? 'CONTACT_AUTHORITY_CHANGED' : 'CONTACT_UPDATED', entityType: 'CustomerContact', entityId: contactId, before: existing, after: c });
      return c;
    });
  }

  async archiveContact(customerId: string, contactId: string) {
    const existing = await this.prisma.customerContact.findFirst({ where: { id: contactId, customerId }, include: { portalUser: true } });
    if (!existing) throw new NotFoundError('Contact');
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.customerContact.update({ where: { id: contactId }, data: { archivedAt: new Date(), isPrimary: false } });
      await this.audit.record(tx, { action: 'CONTACT_ARCHIVED', entityType: 'CustomerContact', entityId: contactId, before: existing });
      return c;
    });
  }

  // ─── Sites ───

  async addSite(customerId: string, dto: SiteDto) {
    await this.mustExist(customerId);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.customerSite.updateMany({ where: { customerId, isDefault: true }, data: { isDefault: false } });
      const s = await tx.customerSite.create({ data: { ...dto, customerId } });
      await this.audit.record(tx, { action: 'SITE_CREATED', entityType: 'CustomerSite', entityId: s.id, after: s });
      return s;
    });
  }

  async updateSite(customerId: string, siteId: string, dto: UpdateSiteDto) {
    const existing = await this.prisma.customerSite.findFirst({ where: { id: siteId, customerId } });
    if (!existing) throw new NotFoundError('Site');
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.customerSite.updateMany({ where: { customerId, isDefault: true, id: { not: siteId } }, data: { isDefault: false } });
      const s = await tx.customerSite.update({ where: { id: siteId }, data: dto });
      await this.audit.record(tx, { action: 'SITE_UPDATED', entityType: 'CustomerSite', entityId: siteId, before: existing, after: s });
      return s;
    });
  }

  async archiveSite(customerId: string, siteId: string) {
    const existing = await this.prisma.customerSite.findFirst({ where: { id: siteId, customerId } });
    if (!existing) throw new NotFoundError('Site');
    return this.prisma.customerSite.update({ where: { id: siteId }, data: { archivedAt: new Date(), isDefault: false } });
  }

  // ─── Timeline ───

  async timeline(customerId: string, limit = 100, forPortal = false) {
    await this.mustExist(customerId);
    return this.prisma.activity.findMany({
      where: { customerId, ...(forPortal ? { visibility: 'SHARED' } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
  }

  async mustExist(id: string) {
    const c = await this.prisma.customer.findUnique({ where: { id }, select: { id: true, archivedAt: true, number: true, name: true, status: true } });
    if (!c) throw new NotFoundError('Customer');
    return c;
  }

  async assertActive(id: string) {
    const c = await this.mustExist(id);
    if (c.archivedAt) throw new ConflictError('CUSTOMER_ARCHIVED', `Customer ${c.number} is archived.`);
    return c;
  }
}
