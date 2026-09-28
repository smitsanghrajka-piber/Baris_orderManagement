import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/domain-error';
import { ChecklistTemplateDto, LookupDto, LookupKind, RouteDto, StageDefinitionDto, UpdateChecklistTemplateDto, UpdateLookupDto, UpdateRouteDto, UpdateStageDefinitionDto } from './dto/master-data.dto';

/** Prisma delegate + the extra columns each lookup kind accepts. */
const LOOKUPS: Record<LookupKind, { model: string; extras: string[]; editPermission: string }> = {
  materials: { model: 'material', extras: ['micronDefault'], editPermission: 'master_data.lookups.edit' },
  finishes: { model: 'finish', extras: [], editPermission: 'master_data.lookups.edit' },
  'colour-systems': { model: 'colourSystem', extras: [], editPermission: 'master_data.lookups.edit' },
  'label-types': { model: 'labelType', extras: [], editPermission: 'master_data.lookups.edit' },
  applications: { model: 'applicationType', extras: [], editPermission: 'master_data.lookups.edit' },
  'payment-terms': { model: 'paymentTerm', extras: ['days'], editPermission: 'master_data.lookups.edit' },
  carriers: { model: 'carrier', extras: ['trackingUrlTemplate'], editPermission: 'master_data.lookups.edit' },
  machines: { model: 'machine', extras: ['type'], editPermission: 'master_data.machines.edit' },
};

export function lookupEditPermission(kind: string): string | null {
  return (LOOKUPS as any)[kind]?.editPermission ?? null;
}

@Injectable()
export class MasterDataService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private delegate(kind: string) {
    const def = LOOKUPS[kind as LookupKind];
    if (!def) throw new NotFoundError('Lookup type');
    return { def, model: (this.prisma as any)[def.model] };
  }

  /** Everything the UI needs to render forms in one call. */
  async all() {
    const [materials, finishes, colourSystems, labelTypes, applications, paymentTerms, carriers, machines, stageDefinitions, routes, checklistTemplates] = await Promise.all([
      this.prisma.material.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.finish.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.colourSystem.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.labelType.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.applicationType.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.paymentTerm.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.carrier.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.machine.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.productionStageDefinition.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.productionRoute.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], include: { steps: { orderBy: { sequence: 'asc' }, include: { stageDefinition: true, qcChecklistTemplate: { select: { id: true, code: true, name: true } } } } } }),
      this.prisma.checklistTemplate.findMany({ orderBy: [{ kind: 'asc' }, { name: 'asc' }], include: { items: { orderBy: { sequence: 'asc' } }, labelType: true } }),
    ]);
    return { materials, finishes, colourSystems, labelTypes, applications, paymentTerms, carriers, machines, stageDefinitions, routes, checklistTemplates };
  }

  listLookup(kind: string) {
    const { model } = this.delegate(kind);
    return model.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  async createLookup(kind: string, dto: LookupDto) {
    const { def, model } = this.delegate(kind);
    const data = this.pick(dto, def.extras);
    if (kind === 'payment-terms' && data.days === undefined) throw new ValidationError('Payment terms need a number of days.');
    if (kind === 'machines' && !data.type) data.type = 'PRESS';
    const row = await model.create({ data });
    await this.audit.record(this.prisma, { action: 'MASTER_DATA_CREATED', entityType: def.model, entityId: row.id, after: row });
    return row;
  }

  async updateLookup(kind: string, id: string, dto: UpdateLookupDto) {
    const { def, model } = this.delegate(kind);
    const before = await model.findUnique({ where: { id } });
    if (!before) throw new NotFoundError('Record');
    const row = await model.update({ where: { id }, data: this.pick(dto, def.extras) });
    await this.audit.record(this.prisma, { action: 'MASTER_DATA_UPDATED', entityType: def.model, entityId: id, before, after: row });
    return row;
  }

  private pick(dto: Record<string, any>, extras: string[]) {
    const out: Record<string, any> = {};
    for (const k of ['code', 'name', 'isActive', 'sortOrder', ...extras]) if (dto[k] !== undefined) out[k] = dto[k];
    if (typeof out.code === 'string') out.code = out.code.toUpperCase();
    return out;
  }

  // ─── Stage definitions ───

  createStageDefinition(dto: StageDefinitionDto) {
    return this.prisma.productionStageDefinition.create({ data: { ...dto, code: dto.code.toUpperCase() } });
  }

  async updateStageDefinition(id: string, dto: UpdateStageDefinitionDto) {
    const existing = await this.prisma.productionStageDefinition.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Stage definition');
    return this.prisma.productionStageDefinition.update({ where: { id }, data: { ...dto, ...(dto.code ? { code: dto.code.toUpperCase() } : {}) } });
  }

  // ─── Routes ───

  async createRoute(dto: RouteDto) {
    await this.validateSteps(dto.steps);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.productionRoute.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      const route = await tx.productionRoute.create({
        data: { code: dto.code.toUpperCase(), name: dto.name, isDefault: !!dto.isDefault, isActive: dto.isActive ?? true, steps: { create: dto.steps.map((s, i) => ({ ...s, sequence: i + 1 })) } },
        include: { steps: { orderBy: { sequence: 'asc' }, include: { stageDefinition: true } } },
      });
      await this.audit.record(tx, { action: 'ROUTE_CREATED', entityType: 'ProductionRoute', entityId: route.id, after: route });
      return route;
    });
  }

  async updateRoute(id: string, dto: UpdateRouteDto) {
    const existing = await this.prisma.productionRoute.findUnique({ where: { id }, include: { steps: true } });
    if (!existing) throw new NotFoundError('Production route');
    if (dto.steps) await this.validateSteps(dto.steps);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.productionRoute.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
      if (dto.steps) {
        await tx.productionRouteStep.deleteMany({ where: { routeId: id } });
        await tx.productionRouteStep.createMany({ data: dto.steps.map((s, i) => ({ ...s, routeId: id, sequence: i + 1 })) });
      }
      const { steps, ...fields } = dto;
      const route = await tx.productionRoute.update({
        where: { id },
        data: { ...fields, ...(fields.code ? { code: fields.code.toUpperCase() } : {}) },
        include: { steps: { orderBy: { sequence: 'asc' }, include: { stageDefinition: true } } },
      });
      await this.audit.record(tx, { action: 'ROUTE_UPDATED', entityType: 'ProductionRoute', entityId: id, before: existing, after: route });
      return route;
    });
  }

  private async validateSteps(steps: RouteDto['steps']) {
    const ids = [...new Set(steps.map((s) => s.stageDefinitionId))];
    const defs = await this.prisma.productionStageDefinition.findMany({ where: { id: { in: ids } } });
    if (defs.length !== ids.length) throw new NotFoundError('Stage definition');
    for (const s of steps) {
      if (s.qcChecklistTemplateId) {
        const t = await this.prisma.checklistTemplate.findUnique({ where: { id: s.qcChecklistTemplateId } });
        if (!t || t.kind !== 'QC') throw new ValidationError('QC checklist template must be a QC checklist.');
      }
      if (s.requiresQc && s.allowSkip) throw new ValidationError('A stage that requires QC cannot be skippable.');
    }
  }

  // ─── Checklist templates ───

  createChecklist(dto: ChecklistTemplateDto) {
    return this.prisma.checklistTemplate.create({
      data: { code: dto.code.toUpperCase(), name: dto.name, kind: dto.kind, labelTypeId: dto.labelTypeId ?? null, isActive: dto.isActive ?? true, items: { create: dto.items.map((it, i) => ({ ...it, code: it.code.toUpperCase(), sequence: i + 1 })) } },
      include: { items: { orderBy: { sequence: 'asc' } } },
    });
  }

  async updateChecklist(id: string, dto: UpdateChecklistTemplateDto) {
    const existing = await this.prisma.checklistTemplate.findUnique({ where: { id }, include: { items: true } });
    if (!existing) throw new NotFoundError('Checklist template');
    return this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.checklistTemplateItem.deleteMany({ where: { templateId: id } });
        await tx.checklistTemplateItem.createMany({ data: dto.items.map((it, i) => ({ ...it, code: it.code.toUpperCase(), templateId: id, sequence: i + 1 })) });
      }
      const { items, ...fields } = dto;
      const t = await tx.checklistTemplate.update({ where: { id }, data: { ...fields, ...(fields.code ? { code: fields.code.toUpperCase() } : {}) }, include: { items: { orderBy: { sequence: 'asc' } } } });
      await this.audit.record(tx, { action: 'CHECKLIST_UPDATED', entityType: 'ChecklistTemplate', entityId: id, before: existing, after: t });
      return t;
    });
  }

  async assertDefaultRouteExists() {
    const r = await this.prisma.productionRoute.findFirst({ where: { isDefault: true, isActive: true } });
    if (!r) throw new ConflictError('NO_DEFAULT_ROUTE', 'No default production route is configured.');
    return r;
  }
}
