import { ArtworkStatus } from '@prisma/client';
import { defineMachine } from '../../common/util/state-machine';

/**
 * ArtworkVersion lifecycle (architecture §7), the subset live in this slice.
 * The prepress-review and release states are declared so later slices add
 * edges without a migration.
 */
export const ARTWORK_VERSION_MACHINE = defineMachine<ArtworkStatus>({
  DRAFT: ['CUSTOMER_ARTWORK_RECEIVED', 'PROOF_IN_PREPARATION', 'SUPERSEDED', 'ARCHIVED'],
  CUSTOMER_ARTWORK_RECEIVED: ['PREPRESS_REVIEW', 'SUPERSEDED', 'ARCHIVED'],
  PREPRESS_REVIEW: ['CHANGES_REQUIRED', 'PROOF_IN_PREPARATION', 'SUPERSEDED', 'ARCHIVED'],
  CHANGES_REQUIRED: ['SUPERSEDED', 'ARCHIVED'],
  PROOF_IN_PREPARATION: ['PROOF_SENT', 'SUPERSEDED', 'ARCHIVED'],
  PROOF_SENT: ['CUSTOMER_REVIEWING', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED', 'SUPERSEDED'],
  CUSTOMER_REVIEWING: ['CHANGES_REQUESTED', 'REJECTED', 'APPROVED', 'SUPERSEDED'],
  CHANGES_REQUESTED: ['SUPERSEDED'],
  REJECTED: ['SUPERSEDED'],
  APPROVED: ['APPROVED_FOR_PRODUCTION', 'SUPERSEDED'],
  APPROVED_FOR_PRODUCTION: ['SUPERSEDED'],
  SUPERSEDED: [],
  ARCHIVED: [],
});

export const HUMAN_STATUS: Record<ArtworkStatus, string> = {
  DRAFT: 'draft',
  CUSTOMER_ARTWORK_RECEIVED: 'customer artwork received',
  PREPRESS_REVIEW: 'in prepress review',
  CHANGES_REQUIRED: 'changes required',
  PROOF_IN_PREPARATION: 'proof in preparation',
  PROOF_SENT: 'sent to the customer',
  CUSTOMER_REVIEWING: 'being reviewed by the customer',
  CHANGES_REQUESTED: 'changes requested',
  REJECTED: 'rejected',
  APPROVED: 'approved',
  APPROVED_FOR_PRODUCTION: 'approved for production',
  SUPERSEDED: 'superseded',
  ARCHIVED: 'archived',
};

/** States in which the customer can mark up and submit a review. */
export const AWAITING_CUSTOMER: ArtworkStatus[] = ['PROOF_SENT', 'CUSTOMER_REVIEWING'];

/** A newer version supersedes these; approved versions stay until a newer release (§6.5). */
export const SUPERSEDED_BY_NEW_VERSION: ArtworkStatus[] = [
  'DRAFT', 'CUSTOMER_ARTWORK_RECEIVED', 'PREPRESS_REVIEW', 'CHANGES_REQUIRED', 'PROOF_IN_PREPARATION',
  'PROOF_SENT', 'CUSTOMER_REVIEWING', 'CHANGES_REQUESTED', 'REJECTED',
];

/** Proofs are always PDF (rendered in the browser with pdf.js for markup). */
export const PROOF_EXTENSIONS = ['pdf'];
