import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequirePermission } from '../../common/auth/decorators';

class AuditQueryDto {
  @IsOptional() @IsString() @MaxLength(60) entityType?: string;
  @IsOptional() @IsString() @MaxLength(80) entityId?: string;
  @IsOptional() @IsString() @MaxLength(80) actorId?: string;
  @IsOptional() @IsString() @MaxLength(80) action?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) pageSize?: number = 100;
}

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  private where(q: AuditQueryDto): Prisma.AuditLogWhereInput {
    return {
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.action ? { action: { contains: q.action.toUpperCase() } } : {}),
      ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
    };
  }

  @RequirePermission('audit.view') @Get()
  async list(@Query() q: AuditQueryDto) {
    const page = q.page ?? 1, pageSize = q.pageSize ?? 100;
    const where = this.where(q);
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items: rows.map((r) => ({ ...r, id: r.id.toString() })), total, page, pageSize };
  }

  @RequirePermission('audit.view') @Get('actions')
  async actions() {
    const rows = await this.prisma.auditLog.groupBy({ by: ['action'], _count: { _all: true }, orderBy: { action: 'asc' } });
    return rows.map((r) => ({ action: r.action, count: r._count._all }));
  }

  @RequirePermission('audit.export') @Get('export.csv')
  async exportCsv(@Query() q: AuditQueryDto, @Res() res: any) {
    const rows = await this.prisma.auditLog.findMany({ where: this.where(q), orderBy: { id: 'desc' }, take: 50_000 });
    const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return `"${s.replace(/"/g, '""')}"`; };
    const header = ['id', 'createdAt', 'actorType', 'actorId', 'actorName', 'actorCustomerId', 'action', 'entityType', 'entityId', 'ip', 'requestId', 'before', 'after'];
    const lines = [header.join(',')];
    for (const r of rows) lines.push([r.id.toString(), r.createdAt.toISOString(), r.actorType, r.actorId, r.actorName, r.actorCustomerId, r.action, r.entityType, r.entityId, r.ip, r.requestId, r.before, r.after].map(esc).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(lines.join('\r\n'));
  }
}
