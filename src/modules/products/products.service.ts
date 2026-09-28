import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { NumberingService } from '../../common/numbering/numbering.service';
import { TenantResolverService } from '../../common/tenant/tenant-resolver.service';
import { ConflictError, InvalidTransitionError, NotFoundError, ValidationError, VersionConflictError } from '../../common/errors/domain-error';
import { orderBy, pageArgs, toPage } from '../../common/util/pagination';
import { CreateSkuDto, SkuListQueryDto, SpecificationDto, UpdateSkuDto } from './dto/products.dto';
import { defineMachine } from '../../common/util/state-machine';
import { DomainEventsService } from '../notifications/domain-events.service';

export const SPEC_MACHINE = defineMachine<'DRAFT' | 'APPROVED' | 'SUPERSEDED' | 'ARCHIVED'>({
  DRAFT: ['APPROVED', 'ARCHIVED'],
  APPROVED: ['SUPERSEDED', 'ARCHIVED'],
  SUPERSEDED: ['ARCHIVED'],
  ARCHIVED: [],
});

const specInclude = {
  material: true, finish: true, tool: true, plateSet: true, route: true, dieLineFile: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
  colours: { orderBy: { sequence: 'asc' as const }, include: { colourSystem: true } },
  approvedBy: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } },
} satisfies Prisma.SpecificationVersionInclude;

@Injectable()
export class ProductsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly tenants: TenantResolverService,
    private readonly events: DomainEventsService,
  ) {}

  onModuleInit() {
    this.tenants.register('CustomerSku', async (id) => {
      const s = await this.prisma.customerSku.findUnique({ where: { id }, select: { customerId: true } });
      return s ? { customerId: s.customerId } : null;
    });
    this.tenants.register('SpecificationVersion', async (id) => {
      const s = await this.prisma.specificationVersion.findUnique({ where: { id }, select: { sku: { select: { customerId: true } } } });
      return s ? { customerId: s.sku.customerId } : null;
    });
  }

  async list(q: SkuListQueryDto) {
    const { skip, take } = pageArgs(q);
    const where: Prisma.CustomerSkuWhereInput = {
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.includeArchived === 'true' ? {} : { archivedAt: null }),
      ...(q.status && q.status !== 'ALL' ? { status: q.status as any } : {}),
      ...(q.q ? { OR: [
        { number: { contains: q.q, mode: 'insensitive' } },
        { customerSkuCode: { contains: q.q, mode: 'insensitive' } },
        { description: { contains: q.q, mode: 'insensitive' } },
        { customer: { name: { contains: q.q, mode: 'insensitive' } } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.customerSku.findMany({
        where, skip, take,
        orderBy: orderBy(q.sort, ['number', 'description', 'status', 'createdAt', 'updatedAt'] as const, { number: 'asc' }),
        include: { customer: { select: { id: true, number: true, name: true } }, labelType: true, application: true, currentSpecification: { select: { id: true, revisionNo: true, status: true, widthMm: true, heightMm: true, colourCount: true, approvedAt: true } } },
      }),
      this.prisma.customerSku.count({ where }),
    ]);
    return toPage(items, total, q);
  }

  async get(id: string) {
    const sku = await this.prisma.customerSku.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, number: true, name: true, archivedAt: true } }, labelType: true, application: true, route: true,
        specifications: { orderBy: { revisionNo: 'desc' }, include: specInclude },
      },
    });
    if (!sku) throw new NotFoundError('SKU');
    return sku;
  }

  async create(dto: CreateSkuDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer || customer.archivedAt) throw new NotFoundError('Customer');
    return this.prisma.$transaction(async (tx) => {
      const number = await this.numbering.next(tx, 'SKU');
      const sku = await tx.customerSku.create({ data: { ...dto, number, description: dto.description.trim(), customerSkuCode: dto.customerSkuCode?.trim() || null } });
      await this.audit.recordWithActivity(tx, { action: 'SKU_CREATED', entityType: 'CustomerSku', entityId: sku.id, after: sku }, { customerId: sku.customerId, verb: 'sku_created', summary: `SKU ${sku.number} created: ${sku.description}`, visibility: 'SHARED' });
      return sku;
    });
  }

  async update(id: string, dto: UpdateSkuDto) {
    const { version, ...data } = dto;
    const existing = await this.prisma.customerSku.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('SKU');
    if (data.status === 'ACTIVE' && !existing.currentSpecificationId && existing.status !== 'ACTIVE') {
      throw new ConflictError('SPEC_REQUIRED', `SKU ${existing.number} cannot be activated until a specification revision is approved.`);
    }
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.customerSku.updateMany({ where: { id, version }, data: { ...data, ...(data.description ? { description: data.description.trim() } : {}), version: version + 1 } });
      if (count === 0) throw new VersionConflictError('This SKU');
      const updated = await tx.customerSku.findUniqueOrThrow({ where: { id } });
      await this.audit.record(tx, { action: data.status && data.status !== existing.status ? 'SKU_STATUS_CHANGED' : 'SKU_UPDATED', entityType: 'CustomerSku', entityId: id, before: existing, after: updated });
      return updated;
    });
  }

  async archive(id: string) {
    const existing = await this.prisma.customerSku.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('SKU');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customerSku.update({ where: { id }, data: { archivedAt: new Date(), status: 'DISCONTINUED', version: { increment: 1 } } });
      await this.audit.recordWithActivity(tx, { action: 'SKU_ARCHIVED', entityType: 'CustomerSku', entityId: id, before: existing, after: updated }, { customerId: existing.customerId, verb: 'sku_archived', summary: `SKU ${existing.number} discontinued`, visibility: 'SHARED' });
      return updated;
    });
  }

  // ─── Specifications ───

  async getSpecification(id: string) {
    const spec = await this.prisma.specificationVersion.findUnique({ where: { id }, include: { ...specInclude, sku: { select: { id: true, number: true, customerId: true, description: true } } } });
    if (!spec) throw new NotFoundError('Specification');
    return spec;
  }

  /** New DRAFT revision. At most one DRAFT per SKU at a time. */
  async createRevision(skuId: string, dto: SpecificationDto, actorId: string) {
    const sku = await this.prisma.customerSku.findUnique({ where: { id: skuId }, include: { customer: { select: { archivedAt: true } } } });
    if (!sku || sku.archivedAt) throw new NotFoundError('SKU');
    const draft = await this.prisma.specificationVersion.findFirst({ where: { skuId, status: 'DRAFT' } });
    if (draft) throw new ConflictError('DRAFT_EXISTS', `SKU ${sku.number} already has a draft specification (revision ${draft.revisionNo}). Edit or approve it first.`);
    const snapshots = await this.snapshots(this.prisma, dto);
    return this.prisma.$transaction(async (tx) => {
      // Serialise revision allocation on the SKU row.
      await tx.$executeRaw(Prisma.sql`SELECT 1 FROM "customer_sku" WHERE "id" = ${skuId} FOR UPDATE`);
      const last = await tx.specificationVersion.aggregate({ where: { skuId }, _max: { revisionNo: true } });
      const revisionNo = (last._max.revisionNo ?? 0) + 1;
      const { colours, ...fields } = dto;
      const spec = await tx.specificationVersion.create({
        data: {
          ...fields, ...snapshots, skuId, revisionNo, status: 'DRAFT', createdByUserId: actorId,
          colours: colours?.length ? { create: await this.colourRows(tx, colours) } : undefined,
        },
        include: specInclude,
      });
      await this.audit.recordWithActivity(tx, { action: 'SPEC_REVISION_CREATED', entityType: 'SpecificationVersion', entityId: spec.id, after: spec }, { customerId: sku.customerId, verb: 'spec_revision', summary: `Specification revision ${revisionNo} drafted for ${sku.number}`, visibility: 'INTERNAL' });
      return spec;
    });
  }

  /** Edit a DRAFT revision in place (approved revisions are immutable — the trigger enforces it). */
  async updateDraft(specId: string, dto: SpecificationDto) {
    const spec = await this.prisma.specificationVersion.findUnique({ where: { id: specId }, include: { sku: true } });
    if (!spec) throw new NotFoundError('Specification');
    if (spec.status !== 'DRAFT') throw new InvalidTransitionError(`Specification revision ${spec.revisionNo} of ${spec.sku.number} is ${spec.status.toLowerCase()} and cannot be edited. Create a new revision.`);
    const snapshots = await this.snapshots(this.prisma, dto);
    return this.prisma.$transaction(async (tx) => {
      const { colours, ...fields } = dto;
      if (colours) {
        await tx.specificationColour.deleteMany({ where: { specificationId: specId } });
        if (colours.length) await tx.specificationColour.createMany({ data: (await this.colourRows(tx, colours)).map((c) => ({ ...c, specificationId: specId })) });
      }
      const updated = await tx.specificationVersion.update({ where: { id: specId }, data: { ...fields, ...snapshots }, include: specInclude });
      await this.audit.record(tx, { action: 'SPEC_DRAFT_UPDATED', entityType: 'SpecificationVersion', entityId: specId, before: spec, after: updated });
      return updated;
    });
  }

  /** DRAFT → APPROVED; previous APPROVED → SUPERSEDED; SKU pointer moves. */
  async approve(specId: string, actorId: string) {
    const spec = await this.prisma.specificationVersion.findUnique({ where: { id: specId }, include: { sku: true, colours: true } });
    if (!spec) throw new NotFoundError('Specification');
    SPEC_MACHINE.assert(spec.status, 'APPROVED', `Specification revision ${spec.revisionNo} of ${spec.sku.number}`);
    if (spec.colourCount > 0 && spec.colours.length === 0) throw new ValidationError('Add the colour specification before approving (colour count is greater than zero).');
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const previous = await tx.specificationVersion.findFirst({ where: { skuId: spec.skuId, status: 'APPROVED' } });
      if (previous) await tx.specificationVersion.update({ where: { id: previous.id }, data: { status: 'SUPERSEDED', supersededAt: now } });
      // Status-predicate update: a concurrent approve of the same draft loses.
      const { count } = await tx.specificationVersion.updateMany({ where: { id: specId, status: 'DRAFT' }, data: { status: 'APPROVED', approvedAt: now, approvedByUserId: actorId } });
      if (count === 0) throw new InvalidTransitionError(`Specification revision ${spec.revisionNo} was already approved or changed by someone else.`);
      await tx.customerSku.update({ where: { id: spec.skuId }, data: { currentSpecificationId: specId, ...(spec.sku.status === 'DRAFT' ? { status: 'ACTIVE' } : {}), version: { increment: 1 } } });
      await this.audit.recordWithActivity(tx,
        { action: 'SPEC_APPROVED', entityType: 'SpecificationVersion', entityId: specId, before: { status: 'DRAFT' }, after: { status: 'APPROVED', supersededId: previous?.id ?? null } },
        { customerId: spec.sku.customerId, verb: 'spec_approved', summary: `Specification revision ${spec.revisionNo} approved for ${spec.sku.number}`, visibility: 'SHARED' });
      this.events.emit({
        type: 'spec.approved', customerId: spec.sku.customerId, entityType: 'SpecificationVersion', entityId: specId,
        title: `Specification revision ${spec.revisionNo} approved for ${spec.sku.number}`,
        body: spec.requiresCustomerReapproval ? 'This revision requires the customer to re-approve artwork.' : undefined,
        link: `/skus/${spec.skuId}`, portalLink: `/portal/skus/${spec.skuId}`,
        meta: { requiresCustomerReapproval: spec.requiresCustomerReapproval },
      });
      return tx.specificationVersion.findUniqueOrThrow({ where: { id: specId }, include: specInclude });
    });
  }

  async archiveSpec(specId: string) {
    const spec = await this.prisma.specificationVersion.findUnique({ where: { id: specId }, include: { sku: true } });
    if (!spec) throw new NotFoundError('Specification');
    SPEC_MACHINE.assert(spec.status, 'ARCHIVED', `Specification revision ${spec.revisionNo} of ${spec.sku.number}`);
    if (spec.status === 'APPROVED') throw new InvalidTransitionError('The current approved specification cannot be archived. Approve a new revision first.');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.specificationVersion.update({ where: { id: specId }, data: { status: 'ARCHIVED' } });
      await this.audit.record(tx, { action: 'SPEC_ARCHIVED', entityType: 'SpecificationVersion', entityId: specId, before: spec, after: updated });
      return updated;
    });
  }

  private async snapshots(db: Tx | PrismaService, dto: SpecificationDto) {
    const [material, finish, tool, plateSet, route] = await Promise.all([
      dto.materialId ? db.material.findUnique({ where: { id: dto.materialId } }) : null,
      dto.finishId ? db.finish.findUnique({ where: { id: dto.finishId } }) : null,
      dto.toolId ? db.tool.findUnique({ where: { id: dto.toolId } }) : null,
      dto.plateSetId ? db.plateSet.findUnique({ where: { id: dto.plateSetId } }) : null,
      dto.routeId ? db.productionRoute.findUnique({ where: { id: dto.routeId } }) : null,
    ]);
    if (dto.materialId && !material) throw new NotFoundError('Material');
    if (dto.finishId && !finish) throw new NotFoundError('Finish');
    if (dto.toolId && !tool) throw new NotFoundError('Tool');
    if (dto.plateSetId && !plateSet) throw new NotFoundError('Plate set');
    if (dto.routeId && !route) throw new NotFoundError('Production route');
    return {
      materialCode: material?.code ?? null,
      finishCode: finish?.code ?? null,
      toolCode: tool?.code ?? null,
      plateSetCode: plateSet?.code ?? null,
      routeCode: route?.code ?? null,
    };
  }

  private async colourRows(db: Tx | PrismaService, colours: SpecificationDto['colours']) {
    const systems = await db.colourSystem.findMany({ where: { id: { in: colours!.map((c) => c.colourSystemId) } } });
    return colours!.map((c, i) => {
      const sys = systems.find((s) => s.id === c.colourSystemId);
      if (!sys) throw new NotFoundError('Colour system');
      return { sequence: i + 1, colourSystemId: sys.id, colourSystemCode: sys.code, code: c.code ?? null, name: c.name ?? null, reference: c.reference ?? null, toleranceDeltaE: c.toleranceDeltaE ?? null, instructions: c.instructions ?? null };
    });
  }
}
