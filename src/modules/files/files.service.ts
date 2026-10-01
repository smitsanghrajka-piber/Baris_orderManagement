import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { BUCKETS, StorageService } from '../../common/storage/storage.service';
import { TenantResolverService } from '../../common/tenant/tenant-resolver.service';
import { AuthUser } from '../../common/auth/auth-user';
import { NotFoundError, TenantMismatchError, ValidationError } from '../../common/errors/domain-error';
import { UploadAttachmentDto } from './dto/files.dto';

export const SIGNED_URL_SECONDS = 60;

@Injectable()
export class FilesService {
  private readonly log = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly tenants: TenantResolverService,
    private readonly audit: AuditService,
  ) {}

  /** Generic attachment upload against any registered entity type. */
  async uploadAttachment(user: AuthUser, dto: UploadAttachmentDto, file: { originalname: string; buffer: Buffer }) {
    if (!this.tenants.has(dto.entityType)) throw new ValidationError(`Attachments cannot be added to ${dto.entityType}.`);
    const customerId = await this.tenants.assertAccess(user, dto.entityType, dto.entityId);
    const visibility = user.kind === 'CUSTOMER' ? 'SHARED' : (dto.visibility ?? 'INTERNAL');
    const keyPrefix = customerId ? `customers/${customerId}/attachments/${dto.entityType}/${dto.entityId}` : `internal/attachments/${dto.entityType}/${dto.entityId}`;
    return this.prisma.$transaction(async (tx) => {
      const { file: stored, duplicateOf } = await this.storage.store(tx, {
        bucket: BUCKETS.ATTACHMENTS, keyPrefix, originalName: file.originalname, body: file.buffer, purpose: 'attachment', actor: user, customerId,
      });
      const attachment = await tx.attachment.create({
        data: { fileId: stored.id, entityType: dto.entityType, entityId: dto.entityId, category: dto.category ?? null, label: dto.label ?? null, visibility },
        include: { file: true },
      });
      await this.audit.recordWithActivity(tx,
        { action: 'ATTACHMENT_ADDED', entityType: dto.entityType, entityId: dto.entityId, after: { fileId: stored.id, name: stored.originalName, sha256: stored.sha256, visibility } },
        { customerId, verb: 'attachment_added', summary: `Attachment added: ${stored.originalName}`, visibility });
      return { ...attachment, duplicateOf: duplicateOf ? { id: duplicateOf.id, originalName: duplicateOf.originalName, createdAt: duplicateOf.createdAt } : null };
    });
  }

  async listAttachments(user: AuthUser, entityType: string, entityId: string) {
    await this.tenants.assertAccess(user, entityType, entityId);
    return this.prisma.attachment.findMany({
      where: { entityType, entityId, ...(user.kind === 'CUSTOMER' ? { visibility: 'SHARED' } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true, uploadedByActorType: true } } },
    });
  }

  /**
   * Short-lived signed URL. Staff: any file (file.view). Portal: the file must
   * be tagged with the caller's tenant AND be reachable through a SHARED
   * attachment or an owning entity of that tenant.
   */
  async signedUrl(user: AuthUser, fileId: string, download = false) {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundError('File');
    if (user.kind === 'CUSTOMER') {
      if (!file.customerId || file.customerId !== user.customerId) throw new TenantMismatchError('File');
      const shared = await this.prisma.attachment.findFirst({ where: { fileId, visibility: 'SHARED' } });
      const ownedElsewhere = await this.isCustomerVisibleOwner(fileId);
      if (!shared && !ownedElsewhere) throw new TenantMismatchError('File');
    }
    const url = await this.storage.signedUrl(file, { expiresInSeconds: SIGNED_URL_SECONDS, download });
    await this.audit.record(this.prisma, { action: 'FILE_URL_ISSUED', entityType: 'File', entityId: fileId, after: { name: file.originalName, download, kind: user.kind } });
    return { url, expiresInSeconds: SIGNED_URL_SECONDS, fileName: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes };
  }

  /**
   * Files a customer may read through an owning record: die-line files on a
   * specification, and the proof of an artwork version that was sent to them
   * (source and production files stay internal).
   */
  private async isCustomerVisibleOwner(fileId: string): Promise<boolean> {
    const [spec, proof] = await Promise.all([
      this.prisma.specificationVersion.findFirst({ where: { dieLineFileId: fileId }, select: { id: true } }),
      this.prisma.artworkFile.findFirst({ where: { fileId, kind: 'PROOF', version: { sentAt: { not: null } } }, select: { id: true } }),
    ]);
    return !!spec || !!proof;
  }

  /** Objects written but never committed (crash between put and commit). Local driver only; Supabase handled by lifecycle rules. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async sweepOrphans() {
    if (this.storage.driver.name !== 'local') return;
    // The local driver has no listing API on purpose; orphan objects are rare
    // and are cleaned by scripts/sweep-local-storage.ts against the DB.
    this.log.debug('orphan sweep is a script for the local driver');
  }
}
