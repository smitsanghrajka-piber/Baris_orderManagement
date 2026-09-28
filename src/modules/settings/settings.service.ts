import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { NumberingService, SequenceKey } from '../../common/numbering/numbering.service';
import { NotFoundError, ValidationError } from '../../common/errors/domain-error';
import { CompanySettingsDto, NumberSequenceDto } from './dto/settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly numbering: NumberingService) {}

  async company() {
    const s = await this.prisma.companySettings.findUnique({ where: { id: 'default' }, include: { logoFile: { select: { id: true, originalName: true } } } });
    if (!s) return this.prisma.companySettings.create({ data: { id: 'default' } });
    return s;
  }

  /** Public subset for login pages and the portal (no internal defaults). */
  async publicCompany() {
    const s = await this.company();
    return { legalName: s.legalName, tradingName: s.tradingName, phone: s.phone, email: s.email, website: s.website, logoFileId: s.logoFileId, defaultCurrency: s.defaultCurrency, gstRatePct: s.gstRatePct, timeZone: s.timeZone };
  }

  async updateCompany(dto: CompanySettingsDto) {
    const before = await this.company();
    const statementChanged = dto.approvalStatementText !== undefined && dto.approvalStatementText !== before.approvalStatementText;
    const updated = await this.prisma.companySettings.update({
      where: { id: 'default' },
      data: { ...dto, ...(statementChanged ? { approvalStatementVersion: { increment: 1 } } : {}) },
    });
    await this.audit.record(this.prisma, { action: statementChanged ? 'APPROVAL_STATEMENT_CHANGED' : 'COMPANY_SETTINGS_UPDATED', entityType: 'CompanySettings', entityId: 'default', before, after: updated });
    return updated;
  }

  async sequences() {
    const rows = await this.prisma.numberSequence.findMany({ orderBy: { key: 'asc' } });
    return Promise.all(rows.map(async (r) => ({ ...r, preview: await this.numbering.peek(r.key as SequenceKey) })));
  }

  async updateSequence(key: string, dto: NumberSequenceDto) {
    const before = await this.prisma.numberSequence.findUnique({ where: { key } });
    if (!before) throw new NotFoundError('Number sequence');
    if (dto.nextValue !== undefined && dto.nextValue < before.nextValue) throw new ValidationError(`The next value can only move forward (currently ${before.nextValue}).`);
    const updated = await this.prisma.numberSequence.update({ where: { key }, data: dto });
    await this.audit.record(this.prisma, { action: 'NUMBERING_CHANGED', entityType: 'NumberSequence', entityId: key, before, after: updated });
    return { ...updated, preview: await this.numbering.peek(key as SequenceKey) };
  }
}
