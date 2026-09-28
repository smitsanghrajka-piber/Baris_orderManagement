/**
 * The single catalogue of permission codes and the default role → permission
 * matrix (architecture §10). Seeded into the database by prisma/seed.ts;
 * asserted at boot by assert-routes-annotated.ts (every @RequirePermission
 * code must exist here). Super Administrator can edit non-system roles in the
 * UI; this file only defines the defaults.
 *
 * Staff codes are `module.action`; customer (portal) codes are
 * `portal.module.action`. The whole matrix is labelled ASSUMPTION — REQUIRES
 * CONFIRMATION in the architecture document.
 */

export type PermissionDef = { code: string; module: string; action: string; description: string };

const P = (code: string, description: string): PermissionDef => {
  const parts = code.split('.');
  return { code, module: parts[0] === 'portal' ? `portal.${parts[1]}` : parts[0], action: parts.slice(parts[0] === 'portal' ? 2 : 1).join('.'), description };
};

export const PERMISSIONS: PermissionDef[] = [
  // customers
  P('customer.view', 'View customers'),
  P('customer.create', 'Create customers'),
  P('customer.edit', 'Edit customers, contacts and sites'),
  P('customer.archive', 'Archive customers'),
  P('customer.credit_hold', 'Place or lift credit hold'),
  P('customer_user.manage', 'Create and manage customer portal logins'),
  P('customer_user.unlock', 'Unlock locked customer portal logins'),
  // skus / specs
  P('sku.view', 'View SKUs and specifications'),
  P('sku.create', 'Create SKUs'),
  P('sku.edit', 'Edit SKUs'),
  P('sku.archive', 'Archive / discontinue SKUs'),
  P('spec.create_revision', 'Create specification revisions'),
  P('spec.approve', 'Approve specification revisions'),
  // tooling
  P('tooling.view', 'View tools and plate sets'),
  P('tooling.edit', 'Edit tools and plate sets'),
  // artwork (Phase 3 routes; codes seeded now)
  P('artwork.view', 'View artworks'),
  P('artwork.create', 'Create artworks'),
  P('artwork.upload_version', 'Upload artwork revisions'),
  P('artwork.comment', 'Comment on artworks (shared)'),
  P('artwork.comment.internal', 'Post internal artwork comments'),
  P('artwork.comment.resolve', 'Resolve artwork comments'),
  P('artwork.review', 'Perform prepress review'),
  P('artwork.send_proof', 'Send, cancel or resend proofs'),
  P('artwork.decide.override', 'Record an approval decision on the customer\'s behalf'),
  P('artwork.release', 'Release approved artwork for production'),
  P('artwork.archive', 'Archive artworks'),
  // pricing / quotations (Phase 4)
  P('pricing.view_rules', 'View pricing rules'),
  P('pricing.edit_rules', 'Edit pricing rules'),
  P('pricing.calculate', 'Run the price calculator'),
  P('quotation.view', 'View quotations'),
  P('quotation.create', 'Create quotations'),
  P('quotation.revise', 'Revise quotations'),
  P('quotation.issue', 'Issue quotations'),
  P('quotation.accept', 'Record quotation acceptance'),
  P('quotation.decline', 'Record quotation decline'),
  P('quotation.convert', 'Convert quotations to orders'),
  // orders (Phase 4)
  P('order.view', 'View orders'),
  P('order.create', 'Create orders'),
  P('order.edit', 'Edit orders'),
  P('order.submit', 'Submit orders'),
  P('order.hold', 'Place orders on hold'),
  P('order.release_hold', 'Release orders from hold'),
  P('order.cancel', 'Cancel orders without work in progress'),
  P('order.cancel.override', 'Cancel orders with work in progress'),
  P('order.complete', 'Complete orders'),
  // production (Phase 5)
  P('production.view', 'View production jobs'),
  P('production.release', 'Release jobs to production'),
  P('production.release.override', 'Release jobs bypassing the artwork gate'),
  P('production.schedule', 'Schedule jobs'),
  P('production.record_event', 'Record production events'),
  P('production.hold', 'Hold jobs'),
  P('production.release_hold', 'Release job holds'),
  P('production.stage.skip', 'Skip production stages'),
  P('production.cancel', 'Cancel jobs'),
  P('production.close', 'Close completed jobs'),
  // quality (Phase 5)
  P('quality.inspect', 'Record quality inspections'),
  P('quality.disposition', 'Disposition non-conformances'),
  // dispatch (Phase 5)
  P('dispatch.view', 'View dispatches'),
  P('dispatch.create', 'Create dispatches'),
  P('dispatch.confirm', 'Confirm dispatches'),
  P('dispatch.deliver', 'Mark dispatches delivered'),
  P('dispatch.cancel', 'Cancel unconfirmed dispatches'),
  // files
  P('attachment.create', 'Upload attachments'),
  P('file.view', 'Download files (subject to the owning record)'),
  // money
  P('money.view', 'See prices and totals'),
  // master data
  P('master_data.lookups.edit', 'Edit lookup tables'),
  P('master_data.checklists.edit', 'Edit checklist templates'),
  P('master_data.routes.edit', 'Edit production routes and stages'),
  P('master_data.machines.edit', 'Edit machines'),
  P('master_data.view', 'View master data'),
  // notifications / admin
  P('notification_rule.edit', 'Edit notification rules'),
  P('user.manage', 'Manage staff users'),
  P('role.manage', 'Manage roles and permissions'),
  P('audit.view', 'View the audit trail'),
  P('audit.export', 'Export the audit trail'),
  P('settings.edit', 'Edit company settings and numbering'),
  P('dashboard.view', 'View the staff dashboard'),
  P('search.use', 'Use global search'),
  P('report.view', 'View reports (each report may narrow further)'),
  // portal
  P('portal.dashboard.view', 'Portal dashboard'),
  P('portal.search.use', 'Portal search'),
  P('portal.customer.view', 'View own organisation'),
  P('portal.customer.edit', 'Edit own organisation details and sites'),
  P('portal.user.manage', 'Manage own organisation\'s portal users'),
  P('portal.sku.view', 'View own SKUs'),
  P('portal.artwork.view', 'View own artworks'),
  P('portal.artwork.upload', 'Upload artwork'),
  P('portal.artwork.comment', 'Comment on artwork'),
  P('portal.artwork.decide', 'Approve / request changes / reject proofs (contact flag required)'),
  P('portal.artwork.download_approved', 'Download approved artwork'),
  P('portal.quotation.view', 'View own quotations'),
  P('portal.quotation.request', 'Request quotations'),
  P('portal.quotation.accept', 'Accept quotations (contact flag required)'),
  P('portal.quotation.decline', 'Decline quotations (contact flag required)'),
  P('portal.order.view', 'View own orders'),
  P('portal.order.track', 'Track production status of own orders'),
  P('portal.order.create', 'Create orders (contact flag required)'),
  P('portal.order.submit', 'Submit orders (contact flag required)'),
  P('portal.order.reorder', 'Reorder (contact flag required)'),
  P('portal.dispatch.view', 'View own dispatches'),
  P('portal.file.download', 'Download own files'),
  P('portal.notification.view', 'View own notifications'),
];

export const PERMISSION_CODES = new Set(PERMISSIONS.map((p) => p.code));

export const STAFF_ROLES = {
  SUPER_ADMIN: 'Super Administrator',
  MANAGEMENT: 'Management',
  SALES: 'Sales',
  CUSTOMER_SERVICE: 'Customer Service',
  PREPRESS: 'Artwork / Prepress',
  PLANNER: 'Production Planner',
  OPERATOR: 'Production Operator',
  QUALITY: 'Quality',
  DISPATCH: 'Dispatch',
  FINANCE: 'Finance',
} as const;

export const CUSTOMER_ROLES = {
  CUSTOMER_ADMIN: 'Customer Administrator',
  CUSTOMER_USER: 'Customer User',
} as const;

export type StaffRoleCode = keyof typeof STAFF_ROLES;
export type CustomerRoleCode = keyof typeof CUSTOMER_ROLES;

const ALL_STAFF = PERMISSIONS.filter((p) => !p.code.startsWith('portal.')).map((p) => p.code);
const ALL_PORTAL = PERMISSIONS.filter((p) => p.code.startsWith('portal.')).map((p) => p.code);

const COMMON_STAFF = ['dashboard.view', 'search.use', 'attachment.create', 'file.view', 'master_data.view', 'customer.view', 'sku.view', 'tooling.view'];

export const ROLE_MATRIX: Record<StaffRoleCode | CustomerRoleCode, string[]> = {
  SUPER_ADMIN: ALL_STAFF,
  MANAGEMENT: ALL_STAFF.filter((c) => !['user.manage', 'role.manage', 'settings.edit', 'artwork.review', 'artwork.release', 'production.record_event', 'quality.inspect'].includes(c)),
  SALES: [
    ...COMMON_STAFF,
    'customer.create', 'customer.edit', 'customer_user.manage', 'customer_user.unlock',
    'sku.create', 'sku.edit',
    'artwork.view', 'artwork.create', 'artwork.upload_version', 'artwork.comment', 'artwork.comment.internal', 'artwork.comment.resolve', 'artwork.send_proof',
    'pricing.view_rules', 'pricing.calculate',
    'quotation.view', 'quotation.create', 'quotation.revise', 'quotation.issue', 'quotation.accept', 'quotation.decline', 'quotation.convert',
    'order.view', 'order.create', 'order.edit', 'order.submit', 'order.hold', 'order.release_hold', 'order.cancel', 'order.complete',
    'production.view', 'dispatch.view', 'money.view', 'report.view',
  ],
  CUSTOMER_SERVICE: [
    ...COMMON_STAFF,
    'customer.create', 'customer.edit', 'customer_user.manage', 'customer_user.unlock',
    'sku.create', 'sku.edit',
    'artwork.view', 'artwork.create', 'artwork.upload_version', 'artwork.comment', 'artwork.comment.internal', 'artwork.comment.resolve', 'artwork.send_proof',
    'pricing.view_rules', 'pricing.calculate',
    'quotation.view', 'quotation.create', 'quotation.revise', 'quotation.accept', 'quotation.decline', 'quotation.convert',
    'order.view', 'order.create', 'order.edit', 'order.submit', 'order.complete',
    'production.view', 'dispatch.view', 'money.view', 'report.view',
  ],
  PREPRESS: [
    ...COMMON_STAFF,
    'sku.create', 'sku.edit', 'spec.create_revision', 'spec.approve', 'tooling.edit',
    'artwork.view', 'artwork.create', 'artwork.upload_version', 'artwork.comment', 'artwork.comment.internal', 'artwork.comment.resolve',
    'artwork.review', 'artwork.send_proof', 'artwork.release', 'artwork.archive',
    'quotation.view', 'order.view', 'production.view', 'production.release',
    'master_data.checklists.edit', 'report.view',
  ],
  PLANNER: [
    ...COMMON_STAFF,
    'tooling.edit',
    'artwork.view', 'artwork.comment.internal', 'artwork.comment.resolve',
    'quotation.view', 'order.view', 'order.hold', 'order.release_hold',
    'production.view', 'production.release', 'production.schedule', 'production.record_event', 'production.hold', 'production.release_hold',
    'production.stage.skip', 'production.cancel', 'production.close',
    'dispatch.view', 'master_data.routes.edit', 'master_data.machines.edit', 'report.view',
  ],
  OPERATOR: ['dashboard.view', 'search.use', 'attachment.create', 'file.view', 'master_data.view', 'sku.view', 'tooling.view', 'artwork.view', 'order.view', 'production.view', 'production.record_event'],
  QUALITY: [
    ...COMMON_STAFF,
    'spec.create_revision',
    'artwork.view', 'artwork.comment', 'artwork.comment.internal', 'artwork.comment.resolve',
    'order.view', 'order.hold', 'order.release_hold',
    'production.view', 'production.record_event', 'production.hold', 'production.release_hold',
    'quality.inspect', 'quality.disposition', 'dispatch.view', 'master_data.checklists.edit', 'report.view',
  ],
  DISPATCH: [
    ...COMMON_STAFF,
    'artwork.view', 'order.view', 'order.complete', 'production.view',
    'dispatch.view', 'dispatch.create', 'dispatch.confirm', 'dispatch.deliver', 'dispatch.cancel', 'report.view',
  ],
  FINANCE: [
    ...COMMON_STAFF,
    'customer.credit_hold', 'pricing.view_rules', 'pricing.edit_rules', 'pricing.calculate',
    'quotation.view', 'order.view', 'production.view', 'dispatch.view', 'money.view', 'audit.view', 'audit.export', 'report.view',
  ],
  CUSTOMER_ADMIN: ALL_PORTAL,
  CUSTOMER_USER: ALL_PORTAL.filter((c) => !['portal.user.manage', 'portal.customer.edit'].includes(c)),
};

/** Codes that a route may declare besides the catalogue (none today). */
export function isKnownPermission(code: string): boolean {
  return PERMISSION_CODES.has(code);
}
