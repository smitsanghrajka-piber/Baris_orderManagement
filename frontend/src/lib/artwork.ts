// Artwork proof review: shared types and labels for the staff and portal pages.

export type ArtworkStatus =
  | "DRAFT" | "CUSTOMER_ARTWORK_RECEIVED" | "PREPRESS_REVIEW" | "CHANGES_REQUIRED" | "PROOF_IN_PREPARATION"
  | "PROOF_SENT" | "CUSTOMER_REVIEWING" | "CHANGES_REQUESTED" | "REJECTED" | "APPROVED"
  | "APPROVED_FOR_PRODUCTION" | "SUPERSEDED" | "ARCHIVED";

/** An area of the proof, normalised to 0..1 of the page. w = h = 0 is a pin. */
export interface Annotation { page: number; x: number; y: number; w: number; h: number }

export interface ArtworkComment {
  id: string;
  versionId: string;
  parentId: string | null;
  authorType: "STAFF" | "CUSTOMER" | "SYSTEM";
  authorName: string;
  visibility?: "SHARED" | "INTERNAL";
  body: string;
  annotation: Annotation | null;
  status: "OPEN" | "RESOLVED";
  submittedAt: string | null;
  resolvedAt: string | null;
  resolvedByName?: string | null;
  createdAt: string;
  isDraft?: boolean;
  isMine?: boolean;
}

export interface ArtworkFileRow {
  id: string;
  kind: "SOURCE" | "PROOF" | "PRODUCTION" | "DIE_LINE" | "REFERENCE";
  isPrimary: boolean;
  file: { id: string; originalName: string; mimeType: string; sizeBytes: number };
}

export interface ArtworkDecision {
  id: string;
  decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
  decidedByName: string;
  comments: string | null;
  statement: string | null;
  statementVersion: number | null;
  decidedAt: string;
}

export interface ArtworkVersion {
  id: string;
  revisionNo: number;
  status: ArtworkStatus;
  revisionDescription: string;
  customerNotes: string | null;
  internalNotes?: string | null;
  changeRequestSummary: string | null;
  sentAt: string | null;
  firstViewedAt: string | null;
  decidedAt: string | null;
  approvedAt: string | null;
  supersededAt: string | null;
  createdAt?: string;
  uploadedByUser?: { id: string; name: string } | null;
  sentBy?: { id: string; name: string } | null;
  files: ArtworkFileRow[];
  approvals: ArtworkDecision[];
  openCustomerComments?: number;
}

export const STATUS_LABEL: Record<ArtworkStatus, string> = {
  DRAFT: "Draft",
  CUSTOMER_ARTWORK_RECEIVED: "Artwork received",
  PREPRESS_REVIEW: "Prepress review",
  CHANGES_REQUIRED: "Changes required",
  PROOF_IN_PREPARATION: "In preparation",
  PROOF_SENT: "Sent to customer",
  CUSTOMER_REVIEWING: "Customer reviewing",
  CHANGES_REQUESTED: "Changes requested",
  REJECTED: "Rejected",
  APPROVED: "Approved",
  APPROVED_FOR_PRODUCTION: "Released to production",
  SUPERSEDED: "Superseded",
  ARCHIVED: "Archived",
};

/** Customer-facing wording for the same states. */
export const PORTAL_STATUS_LABEL: Partial<Record<ArtworkStatus, string>> = {
  PROOF_SENT: "Awaiting your review",
  CUSTOMER_REVIEWING: "Awaiting your review",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  APPROVED_FOR_PRODUCTION: "Approved",
  SUPERSEDED: "Replaced by a newer version",
};

export const STATUS_TONE: Record<ArtworkStatus, string> = {
  DRAFT: "neutral",
  CUSTOMER_ARTWORK_RECEIVED: "info",
  PREPRESS_REVIEW: "info",
  CHANGES_REQUIRED: "warning",
  PROOF_IN_PREPARATION: "neutral",
  PROOF_SENT: "info",
  CUSTOMER_REVIEWING: "info",
  CHANGES_REQUESTED: "warning",
  REJECTED: "danger",
  APPROVED: "success",
  APPROVED_FOR_PRODUCTION: "success",
  SUPERSEDED: "neutral",
  ARCHIVED: "neutral",
};

export const AWAITING_CUSTOMER: ArtworkStatus[] = ["PROOF_SENT", "CUSTOMER_REVIEWING"];

export const dateTime = (v?: string | null) =>
  v
    ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Australia/Sydney" }).format(new Date(v))
    : "—";

/** Top-level comments with an area get stable 1-based numbers, in creation order. */
export function numberAnnotated(comments: ArtworkComment[]): Map<string, number> {
  const map = new Map<string, number>();
  let n = 0;
  for (const c of comments) if (!c.parentId && c.annotation) map.set(c.id, ++n);
  return map;
}

/** Proofs are always PDF. */
export const PROOF_ACCEPT = ".pdf,application/pdf";
