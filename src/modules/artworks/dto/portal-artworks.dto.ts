import { Expose, Type } from 'class-transformer';

/**
 * Portal artwork responses are ALLOW-LISTS (architecture §10): only @Expose()d
 * fields are serialised, and every nested object has its own class, so
 * internal notes, staff ids, IPs and user agents can never reach a customer.
 * test/unit/portal-dto-snapshot.spec.ts asserts the forbidden keys.
 */

export class PortalSkuRefView {
  @Expose() id: string;
  @Expose() number: string;
  @Expose() description: string;
  @Expose() customerSkuCode: string | null;
}

export class PortalPersonView {
  @Expose() name: string;
  @Expose() email: string;
}

export class PortalFileMetaView {
  @Expose() id: string;
  @Expose() originalName: string;
  @Expose() mimeType: string;
  @Expose() sizeBytes: number;
}

export class PortalArtworkFileView {
  @Expose() id: string;
  @Expose() kind: string;
  @Expose() isPrimary: boolean;
  @Expose() @Type(() => PortalFileMetaView) file: PortalFileMetaView;
}

export class PortalArtworkDecisionView {
  @Expose() id: string;
  @Expose() decision: string;
  @Expose() decidedByName: string;
  @Expose() comments: string | null;
  @Expose() statement: string | null;
  @Expose() statementVersion: number | null;
  @Expose() decidedAt: Date;
}

export class PortalArtworkVersionView {
  @Expose() id: string;
  @Expose() revisionNo: number;
  @Expose() status: string;
  @Expose() revisionDescription: string;
  @Expose() customerNotes: string | null;
  @Expose() changeRequestSummary: string | null;
  @Expose() sentAt: Date | null;
  @Expose() firstViewedAt: Date | null;
  @Expose() decidedAt: Date | null;
  @Expose() approvedAt: Date | null;
  @Expose() supersededAt: Date | null;
  @Expose() @Type(() => PortalArtworkFileView) files: PortalArtworkFileView[];
  @Expose() @Type(() => PortalArtworkDecisionView) approvals: PortalArtworkDecisionView[];
}

export class PortalApprovalStatementView {
  @Expose() text: string;
  @Expose() statementVersion: number;
}

export class PortalArtworkView {
  @Expose() id: string;
  @Expose() number: string;
  @Expose() title: string;
  @Expose() @Type(() => PortalSkuRefView) sku: PortalSkuRefView | null;
  @Expose() @Type(() => PortalPersonView) accountManager: PortalPersonView | null;
  @Expose() @Type(() => PortalArtworkVersionView) versions: PortalArtworkVersionView[];
  @Expose() newVersionInPreparation: boolean;
  @Expose() @Type(() => PortalApprovalStatementView) approvalStatement: PortalApprovalStatementView | null;
  @Expose() canApprove: boolean;
  @Expose() canComment: boolean;
  @Expose() updatedAt: Date;
}

export class PortalVersionSummaryView {
  @Expose() id: string;
  @Expose() revisionNo: number;
  @Expose() status: string;
  @Expose() sentAt: Date | null;
  @Expose() decidedAt: Date | null;
}

export class PortalArtworkListItemView {
  @Expose() id: string;
  @Expose() number: string;
  @Expose() title: string;
  @Expose() @Type(() => PortalSkuRefView) sku: PortalSkuRefView | null;
  @Expose() @Type(() => PortalVersionSummaryView) latestVersion: PortalVersionSummaryView | null;
  @Expose() newVersionInPreparation: boolean;
  @Expose() awaitingReview: boolean;
  @Expose() updatedAt: Date;
}

export class PortalAnnotationView {
  @Expose() page: number;
  @Expose() x: number;
  @Expose() y: number;
  @Expose() w: number;
  @Expose() h: number;
}

export class PortalArtworkCommentView {
  @Expose() id: string;
  @Expose() versionId: string;
  @Expose() parentId: string | null;
  @Expose() authorType: string;
  @Expose() authorName: string;
  @Expose() body: string;
  @Expose() @Type(() => PortalAnnotationView) annotation: PortalAnnotationView | null;
  @Expose() status: string;
  @Expose() submittedAt: Date | null;
  @Expose() resolvedAt: Date | null;
  @Expose() createdAt: Date;
  @Expose() isDraft: boolean;
  @Expose() isMine: boolean;
}
