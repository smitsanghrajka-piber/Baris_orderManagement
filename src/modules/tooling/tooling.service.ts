import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotFoundError, ValidationError } from '../../common/errors/domain-error';
import { ListQueryDto, orderBy, pageArgs, toPage } from '../../common/util/pagination';
import { PlateSetDto, ToolDto, UpdatePlateSetDto, UpdateToolDto } from './dto/tooling.dto';

@Injectable()
export class ToolingService {
  constructor(private readonly prisma: PrismaService) {}

  async listTools(q: ListQueryDto & { customerId?: string; includeArchived?: string }) {
    const { skip, take } = pageArgs(q);
    const where: Prisma.ToolWhereInput = {
      ...(q.includeArchived === 'true' ? {} : { archivedAt: null }),
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.q ? { OR: [{ code: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.tool.findMany({ where, skip, take, orderBy: orderBy(q.sort, ['code', 'name', 'status', 'createdAt'] as const, { code: 'asc' }), include: { customer: { select: { id: true, number: true, name: true } }, _count: { select: { specifications: true, plateSets: true } } } }),
      this.prisma.tool.count({ where }),
    ]);
    return toPage(items, total, q);
  }

  async getTool(id: string) {
    const t = await this.prisma.tool.findUnique({ where: { id }, include: { customer: { select: { id: true, number: true, name: true } }, plateSets: true, specifications: { select: { id: true, revisionNo: true, status: true, sku: { select: { id: true, number: true, description: true } } } } } });
    if (!t) throw new NotFoundError('Tool');
    return t;
  }

  async createTool(dto: ToolDto) {
    this.validateOwner(dto);
    return this.prisma.tool.create({ data: { ...dto, code: dto.code.toUpperCase() } });
  }

  async updateTool(id: string, dto: UpdateToolDto) {
    const existing = await this.prisma.tool.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Tool');
    this.validateOwner({ ownedBy: dto.ownedBy ?? existing.ownedBy, customerId: dto.customerId === undefined ? existing.customerId : dto.customerId });
    return this.prisma.tool.update({ where: { id }, data: { ...dto, ...(dto.code ? { code: dto.code.toUpperCase() } : {}) } });
  }

  async archiveTool(id: string) {
    const existing = await this.prisma.tool.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Tool');
    return this.prisma.tool.update({ where: { id }, data: { archivedAt: new Date(), status: 'RETIRED' } });
  }

  async listPlateSets(q: ListQueryDto & { customerId?: string; includeArchived?: string }) {
    const { skip, take } = pageArgs(q);
    const where: Prisma.PlateSetWhereInput = {
      ...(q.includeArchived === 'true' ? {} : { archivedAt: null }),
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.q ? { OR: [{ code: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.plateSet.findMany({ where, skip, take, orderBy: orderBy(q.sort, ['code', 'name', 'status', 'createdAt'] as const, { code: 'asc' }), include: { customer: { select: { id: true, number: true, name: true } }, tool: { select: { id: true, code: true, name: true } } } }),
      this.prisma.plateSet.count({ where }),
    ]);
    return toPage(items, total, q);
  }

  async createPlateSet(dto: PlateSetDto) {
    this.validateOwner(dto);
    return this.prisma.plateSet.create({ data: { ...dto, code: dto.code.toUpperCase() } });
  }

  async updatePlateSet(id: string, dto: UpdatePlateSetDto) {
    const existing = await this.prisma.plateSet.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Plate set');
    this.validateOwner({ ownedBy: dto.ownedBy ?? existing.ownedBy, customerId: dto.customerId === undefined ? existing.customerId : dto.customerId });
    return this.prisma.plateSet.update({ where: { id }, data: { ...dto, ...(dto.code ? { code: dto.code.toUpperCase() } : {}) } });
  }

  async archivePlateSet(id: string) {
    const existing = await this.prisma.plateSet.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Plate set');
    return this.prisma.plateSet.update({ where: { id }, data: { archivedAt: new Date(), status: 'RETIRED' } });
  }

  private validateOwner(v: { ownedBy?: string; customerId?: string | null }) {
    if (v.ownedBy === 'CUSTOMER' && !v.customerId) throw new ValidationError('Customer-owned tooling must name the customer.');
    if ((v.ownedBy ?? 'BARIS') === 'BARIS' && v.customerId) throw new ValidationError('Baris-owned tooling cannot be assigned to a customer. Set the owner to CUSTOMER.');
  }
}
