import { Injectable, OnModuleInit } from '@nestjs/common';
import { ArtworkStatus, Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { NumberingService } from '../../common/numbering/numbering.service';
import { TenantResolverService } from '../../common/tenant/tenant-resolver.service';
import { BUCKETS, StorageService } from '../../common/storage/storage.service';
import { extensionOf } from '../../common/storage/mime-sniff';
import { AuthUser, hasPermission } from '../../common/auth/auth-user';
import { ConflictError, InvalidTransitionError, NotFoundError, PermissionDeniedError, TenantMismatchError, ValidationError, VersionConflictError } from '../../common/errors/domain-error';
import { orderBy, pageArgs, toPage } from '../../common/util/pagination';
import { DomainEventsService } from '../notifications/domain-events.service';
import {
  AddVersionFileDto, AnnotationDto, ArtworkListQueryDto, CreateArtworkDto, CreateVersionDto, PortalCommentDto, PortalCommentUpdateDto,
  PortalDecisionDto, ResolveCommentDto, StaffCommentDto, UpdateArtworkDto,
} from './dto/artworks.dto';
import { ARTWORK_VERSION_MACHINE, AWAITING_CUSTOMER, HUMAN_STATUS, PROOF_EXTENSIONS, SUPERSEDED_BY_NEW_VERSION } from './artworks.transitions';

export interface UploadedFile { originalname: string; buffer: Buffer }

const userRef = { select: { id: true, name: true } } as const;
const fileMeta = { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true } } as const;

const versionInclude = {
  files: { orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }], include: { file: fileMeta } },
  uploadedByUser: userRef,
  sentBy: userRef,
  approvals: { orderBy: { decidedAt: 'desc' as const } },
  _count: { select: { comments: true } },
} satisfies Prisma.ArtworkVersionInclude;

const FILTERS: Record<string, ArtworkStatus[] | undefined> = {
  ALL: undefined,
  NEEDS_ACTION: ['CHANGES_REQUESTED', 'REJECTED'],
  AWAITING_CUSTOMER: ['PROOF_SENT', 'CUSTOMER_REVIEWING'],
  IN_PREPARATION: ['DRAFT', 'CUSTOMER_ARTWORK_RECEIVED', 'PREPRESS_REVIEW', 'CHANGES_REQUIRED', 'PROOF_IN_PREPARATION'],
  APPROVED: ['APPROVED', 'APPROVED_FOR_PRODUCTION'],
};

/**
 * Artwork streams and proof review (architecture §6–7, review slice).
 *
 * Staff upload a proof (a new ArtworkVersion), send it, and answer feedback
 * with a new version. Portal users of the owning customer see only sent
 * versions; they mark up areas with draft comments that reach Baris when the
 * review is submitted as "changes requested" or "approved".
 */
@Injectable()
export class ArtworksService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly tenants: TenantResolverService,
    private readonly storage: StorageService,
    private readonly events: DomainEventsService,
  ) {}

  onModuleInit() {
    this.tenants.register('Artwork', async (id) => {
      const a = await this.prisma.artwork.findUnique({ where: { id }, select: { customerId: true } });
      return a ? { customerId: a.customerId } : null;
    });
    this.tenants.register('ArtworkVersion', async (id) => {
      const v = await this.prisma.artworkVersion.findUnique({ where: { id }, select: { artwork: { select: { customerId: true } } } });
      return v ? { customerId: v.artwork.customerId } : null;
    });
  }

  // ─────────────────────────── staff reads ───────────────────────────

  async list(q: ArtworkListQueryDto) {
    const { skip, take } = pageArgs(q);
    const statuses = FILTERS[q.filter ?? 'ALL'];
    const where: Prisma.ArtworkWhereInput = {
      archivedAt: null,
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.skuId ? { skuId: q.skuId } : {}),
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(q.q ? { OR: [
        { number: { contains: q.q, mode: 'insensitive' } },
        { title: { contains: q.q, mode: 'insensitive' } },
        { customer: { name: { contains: q.q, mode: 'insensitive' } } },
        { sku: { number: { contains: q.q, mode: 'insensitive' } } },
      ] } : {}),
    };
    const [items, total, counts] = await Promise.all([
      this.prisma.artwork.findMany({
        where, skip, take,
        orderBy: orderBy(q.sort, ['number', 'title', 'status', 'createdAt', 'updatedAt'] as const, { updatedAt: 'desc' }),
        include: {
          customer: { select: { id: true, number: true, name: true } },
          sku: { select: { id: true, number: true, description: true } },
          accountManager: userRef,
          currentVersion: { select: { id: true, revisionNo: true, status: true, sentAt: true, decidedAt: true, createdAt: true } },
        },
      }),
      this.prisma.artwork.count({ where }),
      this.prisma.artwork.groupBy({ by: ['status'], where: { archivedAt: null, ...(q.customerId ? { customerId: q.customerId } : {}) }, _count: { _all: true } }),
    ]);
    const tally = (s: ArtworkStatus[] | undefined) => counts.filter((c) => !s || s.includes(c.status)).reduce((n, c) => n + c._count._all, 0);
    return { ...toPage(items, total, q), counts: Object.fromEntries(Object.entries(FILTERS).map(([k, s]) => [k, tally(s)])) };
  }

  async get(id: string) {
    const a = await this.prisma.artwork.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, number: true, name: true, salesRep: userRef } },
        sku: { select: { id: true, number: true, description: true, customerSkuCode: true } },
        accountManager: userRef,
        createdBy: userRef,
        versions: { orderBy: { revisionNo: 'desc' }, include: versionInclude },
      },
    });
    if (!a) throw new NotFoundError('Artwork');
    // Open, submitted customer feedback per version — the staff "to do" count.
    const open = await this.prisma.artworkComment.groupBy({
      by: ['versionId'],
      where: { version: { artworkId: id }, authorType: 'CUSTOMER', submittedAt: { not: null }, status: 'OPEN' },
      _count: { _all: true },
    });
    return { ...a, versions: a.versions.map((v) => ({ ...v, openCustomerComments: open.find((o) => o.versionId === v.id)?._count._all ?? 0 })) };
  }

  // ─────────────────────────── staff writes ───────────────────────────

  async create(user: AuthUser, dto: CreateArtworkDto, file: UploadedFile | undefined) {
    if (!file) throw new ValidationError('Attach the proof as a PDF.');
    this.assertProofFile(file.originalname);
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer || customer.archivedAt) throw new NotFoundError('Customer');
    const sku = await this.prisma.customerSku.findUnique({ where: { id: dto.skuId } });
    if (!sku || sku.customerId !== customer.id || sku.archivedAt) throw new ValidationError("Choose one of this customer's active SKUs.");
    const accountManagerUserId = await this.resolveAccountManager(dto.accountManagerUserId, customer.salesRepUserId, user.id);

    const created = await this.prisma.$transaction(async (tx) => {
      const number = await this.numbering.next(tx, 'ARTWORK');
      const artwork = await tx.artwork.create({
        data: { number, customerId: customer.id, skuId: sku.id, title: dto.title.trim(), status: 'PROOF_IN_PREPARATION', accountManagerUserId, createdByUserId: user.id },
      });
      const version = await this.insertVersion(tx, user, artwork.id, artwork.number, customer.id, 1, {
        revisionDescription: dto.revisionDescription?.trim() || 'First proof',
        customerNotes: dto.customerNotes, internalNotes: dto.internalNotes,
      }, file, null);
      await tx.artwork.update({ where: { id: artwork.id }, data: { currentVersionId: version.id } });
      await this.audit.recordWithActivity(tx,
        { action: 'ARTWORK_CREATED', entityType: 'Artwork', entityId: artwork.id, after: { number, title: artwork.title, customerId: customer.id, skuId: artwork.skuId, versionId: version.id } },
        { customerId: customer.id, verb: 'artwork_created', summary: `Artwork ${number} created: ${artwork.title}`, visibility: 'INTERNAL' });
      if (dto.sendNow) await this.sendInTx(tx, user, version.id);
      return { artwork, version };
    });
    this.afterVersionUploaded(created.artwork.id, created.artwork.number, customer.id, 1);
    if (dto.sendNow) this.afterSent(created.artwork.id, created.artwork.number, created.artwork.title, customer.id, 1, dto.customerNotes);
    return this.get(created.artwork.id);
  }

  /** Upload a new revision; the previous in-flight one is superseded (§6.5). */
  async createVersion(user: AuthUser, artworkId: string, dto: CreateVersionDto, file: UploadedFile | undefined) {
    if (!file) throw new ValidationError('Attach the new proof as a PDF.');
    this.assertProofFile(file.originalname);
    const artwork = await this.prisma.artwork.findUnique({ where: { id: artworkId }, include: { customer: true } });
    if (!artwork) throw new NotFoundError('Artwork');
    if (artwork.archivedAt) throw new ConflictError('ARTWORK_ARCHIVED', `Artwork ${artwork.number} is archived.`);
    if (artwork.customer.archivedAt) throw new ConflictError('CUSTOMER_ARCHIVED', `Customer ${artwork.customer.number} is archived.`);

    const result = await this.prisma.$transaction(async (tx) => {
      // Serialise revision allocation on the artwork row.
      await tx.$executeRaw(Prisma.sql`SELECT 1 FROM "artwork" WHERE "id" = ${artworkId} FOR UPDATE`);
      const last = await tx.artworkVersion.aggregate({ where: { artworkId }, _max: { revisionNo: true } });
      const revisionNo = (last._max.revisionNo ?? 0) + 1;
      const head = await tx.artwork.findUniqueOrThrow({ where: { id: artworkId }, include: { currentVersion: true } });
      const version = await this.insertVersion(tx, user, artworkId, artwork.number, artwork.customerId, revisionNo, dto, file, head.currentVersionId);
      const prev = head.currentVersion;
      if (prev && SUPERSEDED_BY_NEW_VERSION.includes(prev.status)) {
        await tx.artworkVersion.update({ where: { id: prev.id }, data: { status: 'SUPERSEDED', supersededAt: new Date(), supersededByVersionId: version.id } });
      }
      await tx.artwork.update({ where: { id: artworkId }, data: { currentVersionId: version.id, status: 'PROOF_IN_PREPARATION', version: { increment: 1 } } });
      await this.audit.recordWithActivity(tx,
        { action: 'ARTWORK_VERSION_CREATED', entityType: 'ArtworkVersion', entityId: version.id, after: { artworkId, revisionNo, revisionDescription: dto.revisionDescription, supersededVersionId: prev?.id ?? null } },
        { customerId: artwork.customerId, verb: 'artwork_version', summary: `${artwork.number} version ${revisionNo} uploaded: ${dto.revisionDescription}`, visibility: 'INTERNAL' });
      if (dto.sendNow) await this.sendInTx(tx, user, version.id);
      return { version, revisionNo };
    });
    this.afterVersionUploaded(artworkId, artwork.number, artwork.customerId, result.revisionNo);
    if (dto.sendNow) this.afterSent(artworkId, artwork.number, artwork.title, artwork.customerId, result.revisionNo, dto.customerNotes);
    return this.get(artworkId);
  }

  async update(id: string, dto: UpdateArtworkDto) {
    const existing = await this.prisma.artwork.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Artwork');
    if (dto.skuId) {
      const sku = await this.prisma.customerSku.findUnique({ where: { id: dto.skuId } });
      if (!sku || sku.customerId !== existing.customerId) throw new ValidationError('The SKU does not belong to this customer.');
    }
    if (dto.accountManagerUserId) await this.resolveAccountManager(dto.accountManagerUserId, null, existing.createdByUserId);
    const { version, ...data } = dto;
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.artwork.updateMany({ where: { id, version }, data: { ...data, ...(data.title ? { title: data.title.trim() } : {}), version: version + 1 } });
      if (count === 0) throw new VersionConflictError('This artwork');
      const updated = await tx.artwork.findUniqueOrThrow({ where: { id } });
      await this.audit.record(tx, { action: 'ARTWORK_UPDATED', entityType: 'Artwork', entityId: id, before: existing, after: updated });
      return updated;
    });
  }

  /** Extra files (source, production, die-line, reference) before the proof is sent. */
  async addFile(user: AuthUser, versionId: string, dto: AddVersionFileDto, file: UploadedFile | undefined) {
    if (!file) throw new ValidationError('No file was uploaded (field name "file").');
    const v = await this.prisma.artworkVersion.findUnique({ where: { id: versionId }, include: { artwork: true } });
    if (!v) throw new NotFoundError('Artwork version');
    if (v.lockedAt) throw new InvalidTransitionError(`Version ${v.revisionNo} of ${v.artwork.number} has been sent and its files are frozen. Upload a new version instead.`);
    return this.prisma.$transaction(async (tx) => {
      const { file: stored, duplicateOf } = await this.storage.store(tx, {
        bucket: BUCKETS.ARTWORK, keyPrefix: `customers/${v.artwork.customerId}/artworks/${v.artwork.number}/v${v.revisionNo}`,
        originalName: file.originalname, body: file.buffer, purpose: 'artwork', actor: user, customerId: v.artwork.customerId,
      });
      const row = await tx.artworkFile.create({ data: { versionId, fileId: stored.id, kind: dto.kind, sha256: stored.sha256 }, include: { file: fileMeta } });
      await this.audit.record(tx, { action: 'ARTWORK_FILE_ADDED', entityType: 'ArtworkVersion', entityId: versionId, after: { fileId: stored.id, kind: dto.kind, name: stored.originalName, sha256: stored.sha256 } });
      return { ...row, duplicateOf: duplicateOf ? { id: duplicateOf.id, originalName: duplicateOf.originalName } : null };
    });
  }

  async send(user: AuthUser, versionId: string) {
    const v = await this.prisma.artworkVersion.findUnique({ where: { id: versionId }, include: { artwork: true } });
    if (!v) throw new NotFoundError('Artwork version');
    await this.prisma.$transaction((tx) => this.sendInTx(tx, user, versionId));
    this.afterSent(v.artworkId, v.artwork.number, v.artwork.title, v.artwork.customerId, v.revisionNo, v.customerNotes);
    return this.get(v.artworkId);
  }

  // ─────────────────────────── comments ───────────────────────────

  async staffComments(versionId: string) {
    await this.mustFindVersion(versionId);
    // Customer drafts stay private to the customer until they submit.
    return this.prisma.artworkComment.findMany({
      where: { versionId, OR: [{ authorType: { not: 'CUSTOMER' } }, { submittedAt: { not: null } }] },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addStaffComment(user: AuthUser, versionId: string, dto: StaffCommentDto) {
    const v = await this.mustFindVersion(versionId);
    const visibility = dto.visibility ?? 'SHARED';
    const need = visibility === 'INTERNAL' ? 'artwork.comment.internal' : 'artwork.comment';
    if (!hasPermission(user, need)) throw new PermissionDeniedError(visibility === 'INTERNAL' ? 'You cannot post internal artwork comments.' : 'You cannot post comments the customer can see.');
    if (visibility === 'SHARED' && !v.sentAt) throw new ValidationError('This version has not been sent yet, so the customer cannot see comments on it. Post an internal note instead.');
    if (dto.parentId) await this.assertParent(dto.parentId, versionId, false);
    const comment = await this.prisma.$transaction(async (tx) => {
      const c = await tx.artworkComment.create({
        data: {
          versionId, parentId: dto.parentId ?? null, authorType: 'STAFF', authorUserId: user.id, authorName: user.name,
          visibility, body: dto.body.trim(), annotation: annotationJson(dto.annotation), submittedAt: new Date(),
        },
      });
      await this.audit.record(tx, { action: 'ARTWORK_COMMENT_ADDED', entityType: 'ArtworkVersion', entityId: versionId, after: { commentId: c.id, visibility } });
      return c;
    });
    if (visibility === 'SHARED') {
      this.events.emit({
        type: 'artwork.comment.added', customerId: v.artwork.customerId, entityType: 'Artwork', entityId: v.artworkId,
        title: `Baris commented on ${v.artwork.number} (version ${v.revisionNo})`, body: truncate(dto.body),
        link: `/artworks/${v.artworkId}`, portalLink: `/portal/artworks/${v.artworkId}`,
      });
    }
    return comment;
  }

  async setCommentStatus(user: AuthUser, commentId: string, dto: ResolveCommentDto) {
    const c = await this.prisma.artworkComment.findUnique({ where: { id: commentId } });
    if (!c) throw new NotFoundError('Comment');
    if (c.authorType === 'CUSTOMER' && !c.submittedAt) throw new NotFoundError('Comment');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.artworkComment.update({
        where: { id: commentId },
        data: dto.status === 'RESOLVED' ? { status: 'RESOLVED', resolvedAt: new Date(), resolvedByName: user.name } : { status: 'OPEN', resolvedAt: null, resolvedByName: null },
      });
      await this.audit.record(tx, { action: dto.status === 'RESOLVED' ? 'ARTWORK_COMMENT_RESOLVED' : 'ARTWORK_COMMENT_REOPENED', entityType: 'ArtworkComment', entityId: commentId });
      return updated;
    });
  }

  // ─────────────────────────── portal ───────────────────────────

  /** Artworks with at least one version sent to this customer. */
  async portalList(user: AuthUser) {
    const artworks = await this.prisma.artwork.findMany({
      where: { customerId: user.customerId!, archivedAt: null, versions: { some: { sentAt: { not: null } } } },
      orderBy: { updatedAt: 'desc' },
      include: {
        sku: { select: { id: true, number: true, description: true, customerSkuCode: true } },
        versions: { where: { sentAt: { not: null } }, orderBy: { revisionNo: 'desc' }, take: 1, select: { id: true, revisionNo: true, status: true, sentAt: true, decidedAt: true } },
      },
    });
    return artworks.map((a) => {
      const latest = a.versions[0];
      return {
        id: a.id, number: a.number, title: a.title, sku: a.sku, updatedAt: a.updatedAt,
        latestVersion: latest,
        /** Baris is preparing a newer version than the one the customer last saw. */
        newVersionInPreparation: a.currentVersionId !== latest?.id,
        awaitingReview: !!latest && AWAITING_CUSTOMER.includes(latest.status) && a.currentVersionId === latest.id,
      };
    });
  }

  async portalGet(user: AuthUser, artworkId: string) {
    const a = await this.prisma.artwork.findFirst({
      where: { id: artworkId, customerId: user.customerId!, archivedAt: null },
      include: {
        sku: { select: { id: true, number: true, description: true, customerSkuCode: true } },
        accountManager: { select: { name: true, email: true } },
        versions: {
          where: { sentAt: { not: null } },
          orderBy: { revisionNo: 'desc' },
          include: {
            files: { where: { kind: 'PROOF' }, include: { file: fileMeta } },
            approvals: { orderBy: { decidedAt: 'desc' } },
          },
        },
      },
    });
    if (!a || a.versions.length === 0) throw new TenantMismatchError('Artwork');
    const settings = await this.prisma.companySettings.findUnique({ where: { id: 'default' } });
    const flags = user.contactFlags;
    return {
      ...a,
      newVersionInPreparation: a.currentVersionId !== a.versions[0].id,
      approvalStatement: settings ? { text: settings.approvalStatementText, statementVersion: settings.approvalStatementVersion } : null,
      canApprove: !!flags?.canApproveArtwork && hasPermission(user, 'portal.artwork.decide'),
      canComment: hasPermission(user, 'portal.artwork.comment'),
    };
  }

  /** First portal view of a sent proof moves it to CUSTOMER_REVIEWING. */
  async portalMarkViewed(user: AuthUser, versionId: string) {
    const v = await this.portalVersion(user, versionId);
    if (v.status !== 'PROOF_SENT') return { status: v.status };
    const { count } = await this.prisma.artworkVersion.updateMany({ where: { id: versionId, status: 'PROOF_SENT' }, data: { status: 'CUSTOMER_REVIEWING', firstViewedAt: new Date() } });
    if (count) {
      await this.prisma.artwork.updateMany({ where: { id: v.artworkId, currentVersionId: versionId }, data: { status: 'CUSTOMER_REVIEWING' } });
      await this.audit.record(this.prisma, { action: 'ARTWORK_PROOF_VIEWED', entityType: 'ArtworkVersion', entityId: versionId });
    }
    return { status: 'CUSTOMER_REVIEWING' as const };
  }

  async portalComments(user: AuthUser, versionId: string) {
    await this.portalVersion(user, versionId);
    // Shared comments only; customer drafts are visible to the whole organisation.
    const rows = await this.prisma.artworkComment.findMany({
      where: { versionId, visibility: 'SHARED', OR: [{ submittedAt: { not: null } }, { authorType: 'CUSTOMER' }] },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((c) => ({ ...c, isDraft: !c.submittedAt, isMine: c.authorCustomerUserId === user.id }));
  }

  async portalAddComment(user: AuthUser, versionId: string, dto: PortalCommentDto) {
    const v = await this.portalVersion(user, versionId);
    this.assertOpenForReview(v);
    if (dto.parentId) await this.assertParent(dto.parentId, versionId, true);
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.artworkComment.create({
        data: {
          versionId, parentId: dto.parentId ?? null, authorType: 'CUSTOMER', authorCustomerUserId: user.id, authorName: user.name,
          visibility: 'SHARED', body: dto.body.trim(), annotation: annotationJson(dto.annotation), submittedAt: null,
        },
      });
      await this.audit.record(tx, { action: 'ARTWORK_COMMENT_DRAFTED', entityType: 'ArtworkVersion', entityId: versionId, after: { commentId: c.id } });
      return { ...c, isDraft: true, isMine: true };
    });
  }

  async portalUpdateComment(user: AuthUser, commentId: string, dto: PortalCommentUpdateDto) {
    const c = await this.ownDraft(user, commentId);
    const updated = await this.prisma.artworkComment.update({
      where: { id: c.id },
      data: {
        ...(dto.body !== undefined ? { body: dto.body.trim() } : {}),
        ...(dto.annotation !== undefined ? { annotation: dto.annotation === null ? Prisma.DbNull : annotationJson(dto.annotation) } : {}),
      },
    });
    return { ...updated, isDraft: true, isMine: true };
  }

  async portalDeleteComment(user: AuthUser, commentId: string) {
    const c = await this.ownDraft(user, commentId);
    await this.prisma.$transaction(async (tx) => {
      await tx.artworkComment.updateMany({ where: { parentId: c.id }, data: { parentId: null } });
      await tx.artworkComment.delete({ where: { id: c.id } });
      await this.audit.record(tx, { action: 'ARTWORK_COMMENT_DRAFT_DELETED', entityType: 'ArtworkVersion', entityId: c.versionId, before: { commentId: c.id } });
    });
  }

  /**
   * Submit the review. CHANGES_REQUESTED: any portal user who may comment,
   * with a summary or at least one marked-up comment. APPROVED: the user's
   * linked contact must hold canApproveArtwork and they must accept the
   * approval statement. Both publish the organisation's draft comments.
   */
  async portalDecide(user: AuthUser, versionId: string, dto: PortalDecisionDto, meta: { ip?: string | null; userAgent?: string | null }) {
    const v = await this.portalVersion(user, versionId);
    this.assertOpenForReview(v);
    const summary = dto.summary?.trim() || null;
    const drafts = await this.prisma.artworkComment.count({ where: { versionId, authorType: 'CUSTOMER', submittedAt: null } });

    let statement: { text: string; version: number } | null = null;
    if (dto.decision === 'APPROVED') {
      if (!hasPermission(user, 'portal.artwork.decide') || !user.contactFlags?.canApproveArtwork) {
        throw new PermissionDeniedError('Your login is not authorised to approve artwork. You can still request changes, or ask your Baris contact to give you approval authority.');
      }
      if (!dto.acceptStatement) throw new ValidationError('Tick the approval statement to approve this proof.');
      const s = await this.prisma.companySettings.findUnique({ where: { id: 'default' } });
      statement = { text: s?.approvalStatementText ?? '', version: s?.approvalStatementVersion ?? 1 };
    } else if (!summary && drafts === 0) {
      throw new ValidationError('Describe the changes you need, or mark up the proof, before submitting.');
    }

    const proof = v.files.find((f) => f.kind === 'PROOF' && f.isPrimary) ?? v.files.find((f) => f.kind === 'PROOF');
    if (!proof) throw new ConflictError('NO_PROOF', 'This version has no proof file.');
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: v.artwork.customerId }, select: { name: true } });
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      ARTWORK_VERSION_MACHINE.assert(v.status, dto.decision, `Artwork ${v.artwork.number} version ${v.revisionNo}`, HUMAN_STATUS);
      // Status predicate: a concurrent decision on the same version loses.
      const { count } = await tx.artworkVersion.updateMany({
        where: { id: versionId, status: { in: AWAITING_CUSTOMER } },
        data: { status: dto.decision, decidedAt: now, changeRequestSummary: summary, ...(dto.decision === 'APPROVED' ? { approvedAt: now } : {}) },
      });
      if (count === 0) throw new InvalidTransitionError(`Version ${v.revisionNo} of ${v.artwork.number} has already been decided.`);
      await tx.artworkComment.updateMany({ where: { versionId, authorType: 'CUSTOMER', submittedAt: null }, data: { submittedAt: now } });
      await tx.artworkApproval.create({
        data: {
          versionId, decision: dto.decision, proofFileId: proof.fileId, proofFileSha256: proof.sha256,
          decidedByActorType: 'CUSTOMER', decidedByCustomerUserId: user.id, decidedByContactId: user.contactId ?? null,
          decidedByName: user.name, organisationName: customer.name,
          statement: statement?.text ?? null, statementVersion: statement?.version ?? null, comments: summary,
          ip: meta.ip ?? null, userAgent: meta.userAgent ?? null, decidedAt: now,
        },
      });
      await tx.artwork.updateMany({ where: { id: v.artworkId, currentVersionId: versionId }, data: { status: dto.decision } });
      await this.audit.recordWithActivity(tx,
        { action: dto.decision === 'APPROVED' ? 'ARTWORK_APPROVED' : 'ARTWORK_CHANGES_REQUESTED', entityType: 'ArtworkVersion', entityId: versionId, after: { decision: dto.decision, comments: drafts, proofFileSha256: proof.sha256, statementVersion: statement?.version ?? null } },
        {
          customerId: v.artwork.customerId, verb: dto.decision === 'APPROVED' ? 'artwork_approved' : 'artwork_changes_requested', visibility: 'SHARED',
          summary: dto.decision === 'APPROVED'
            ? `${user.name} approved ${v.artwork.number} version ${v.revisionNo}`
            : `${user.name} requested changes to ${v.artwork.number} version ${v.revisionNo}${drafts ? ` (${drafts} comment${drafts === 1 ? '' : 's'})` : ''}`,
        });
    });

    this.events.emit({
      type: dto.decision === 'APPROVED' ? 'artwork.approved' : 'artwork.changes_requested',
      customerId: v.artwork.customerId, entityType: 'Artwork', entityId: v.artworkId,
      title: dto.decision === 'APPROVED'
        ? `${customer.name} approved ${v.artwork.number} version ${v.revisionNo}`
        : `${customer.name} requested changes to ${v.artwork.number} version ${v.revisionNo}`,
      body: summary ? truncate(summary) : drafts ? `${drafts} marked-up comment${drafts === 1 ? '' : 's'} to review.` : undefined,
      link: `/artworks/${v.artworkId}`, portalLink: `/portal/artworks/${v.artworkId}`,
      targetUserId: v.artwork.accountManagerUserId ?? undefined,
    });
    return this.portalGet(user, v.artworkId);
  }

  // ─────────────────────────── internals ───────────────────────────

  private assertProofFile(name: string) {
    const ext = extensionOf(name);
    if (!PROOF_EXTENSIONS.includes(ext)) {
      throw new ValidationError(`Proofs must be PDF files (got .${ext || '?'}). Add source files such as .ai or .psd to the version after uploading.`);
    }
  }

  private async resolveAccountManager(requested: string | undefined | null, salesRepId: string | null, fallback: string) {
    if (requested) {
      const u = await this.prisma.user.findUnique({ where: { id: requested }, select: { id: true, isActive: true } });
      if (!u || !u.isActive) throw new ValidationError('The selected account manager is not an active staff user.');
      return u.id;
    }
    return salesRepId ?? fallback;
  }

  private async insertVersion(
    tx: Tx, user: AuthUser, artworkId: string, number: string, customerId: string, revisionNo: number,
    dto: { revisionDescription: string; customerNotes?: string; internalNotes?: string }, file: UploadedFile, parentVersionId: string | null,
  ) {
    const version = await tx.artworkVersion.create({
      data: {
        artworkId, revisionNo, status: 'PROOF_IN_PREPARATION', revisionDescription: dto.revisionDescription.trim(), parentVersionId,
        uploadedByUserId: user.id, uploadedByActorType: 'STAFF',
        customerNotes: dto.customerNotes?.trim() || null, internalNotes: dto.internalNotes?.trim() || null,
      },
    });
    const { file: stored } = await this.storage.store(tx, {
      bucket: BUCKETS.ARTWORK, keyPrefix: `customers/${customerId}/artworks/${number}/v${revisionNo}`,
      originalName: file.originalname, body: file.buffer, purpose: 'artwork', actor: user, customerId,
    });
    await tx.artworkFile.create({ data: { versionId: version.id, fileId: stored.id, kind: 'PROOF', isPrimary: true, sha256: stored.sha256 } });
    return version;
  }

  private async sendInTx(tx: Tx, user: AuthUser, versionId: string) {
    const v = await tx.artworkVersion.findUnique({ where: { id: versionId }, include: { artwork: { include: { customer: true } }, files: true } });
    if (!v) throw new NotFoundError('Artwork version');
    if (v.artwork.currentVersionId !== versionId) throw new InvalidTransitionError(`Version ${v.revisionNo} of ${v.artwork.number} is not the current version.`);
    if (v.artwork.customer.archivedAt) throw new ConflictError('CUSTOMER_ARCHIVED', `Customer ${v.artwork.customer.number} is archived.`);
    if (!v.files.some((f) => f.kind === 'PROOF')) throw new ConflictError('NO_PROOF', 'Attach a proof before sending.');
    ARTWORK_VERSION_MACHINE.assert(v.status, 'PROOF_SENT', `Artwork ${v.artwork.number} version ${v.revisionNo}`, HUMAN_STATUS);
    const now = new Date();
    const { count } = await tx.artworkVersion.updateMany({ where: { id: versionId, status: v.status }, data: { status: 'PROOF_SENT', lockedAt: now, sentAt: now, sentByUserId: user.id } });
    if (count === 0) throw new InvalidTransitionError(`Version ${v.revisionNo} of ${v.artwork.number} was changed by someone else. Reload and try again.`);
    await tx.artwork.update({ where: { id: v.artworkId }, data: { status: 'PROOF_SENT' } });
    await this.audit.recordWithActivity(tx,
      { action: 'ARTWORK_PROOF_SENT', entityType: 'ArtworkVersion', entityId: versionId, after: { revisionNo: v.revisionNo, proofSha256: v.files.find((f) => f.kind === 'PROOF')?.sha256 } },
      { customerId: v.artwork.customerId, verb: 'artwork_proof_sent', summary: `Proof ${v.artwork.number} version ${v.revisionNo} sent for review`, visibility: 'SHARED' });
  }

  private afterVersionUploaded(artworkId: string, number: string, customerId: string, revisionNo: number) {
    this.events.emit({
      type: 'artwork.version.uploaded', customerId, entityType: 'Artwork', entityId: artworkId,
      title: `${number} version ${revisionNo} uploaded`, link: `/artworks/${artworkId}`,
    });
  }

  private afterSent(artworkId: string, number: string, title: string, customerId: string, revisionNo: number, notes?: string | null) {
    this.events.emit({
      type: 'artwork.proof.sent', customerId, entityType: 'Artwork', entityId: artworkId,
      title: `Proof ready for review: ${title} (${number} version ${revisionNo})`,
      body: notes ? truncate(notes) : 'Review the proof, mark up anything that needs to change, and submit your response.',
      link: `/artworks/${artworkId}`, portalLink: `/portal/artworks/${artworkId}`,
    });
  }

  private async mustFindVersion(versionId: string) {
    const v = await this.prisma.artworkVersion.findUnique({ where: { id: versionId }, include: { artwork: true } });
    if (!v) throw new NotFoundError('Artwork version');
    return v;
  }

  /** A sent version of the caller's own customer, else NOT_FOUND. */
  private async portalVersion(user: AuthUser, versionId: string) {
    const v = await this.prisma.artworkVersion.findUnique({ where: { id: versionId }, include: { artwork: true, files: true } });
    if (!v || !v.sentAt || v.artwork.customerId !== user.customerId || v.artwork.archivedAt) throw new TenantMismatchError('Artwork');
    return v;
  }

  private assertOpenForReview(v: { status: ArtworkStatus; revisionNo: number; artwork: { number: string; currentVersionId: string | null }; id: string }) {
    if (v.artwork.currentVersionId !== v.id) throw new InvalidTransitionError(`Version ${v.revisionNo} of ${v.artwork.number} has been replaced by a newer version.`);
    if (!AWAITING_CUSTOMER.includes(v.status)) throw new InvalidTransitionError(`Version ${v.revisionNo} of ${v.artwork.number} is ${HUMAN_STATUS[v.status]} and is no longer open for review.`);
  }

  private async assertParent(parentId: string, versionId: string, portal: boolean) {
    const p = await this.prisma.artworkComment.findUnique({ where: { id: parentId } });
    if (!p || p.versionId !== versionId || (portal && p.visibility !== 'SHARED')) throw new NotFoundError('Comment');
  }

  private async ownDraft(user: AuthUser, commentId: string) {
    const c = await this.prisma.artworkComment.findUnique({ where: { id: commentId }, include: { version: { include: { artwork: true } } } });
    if (!c || c.version.artwork.customerId !== user.customerId) throw new TenantMismatchError('Comment');
    if (c.authorCustomerUserId !== user.id) throw new PermissionDeniedError('You can only change your own comments.');
    if (c.submittedAt) throw new InvalidTransitionError('This comment has been submitted to Baris and can no longer be changed.');
    return c;
  }
}

function annotationJson(a: AnnotationDto | undefined | null): Prisma.InputJsonValue | undefined {
  if (!a) return undefined;
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const x = clamp(a.x), y = clamp(a.y);
  return { page: a.page, x, y, w: clamp(Math.min(a.w, 1 - x)), h: clamp(Math.min(a.h, 1 - y)) };
}

function truncate(s: string, n = 180) {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}
