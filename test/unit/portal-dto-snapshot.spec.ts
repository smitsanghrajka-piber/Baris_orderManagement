import 'reflect-metadata';
import { PortalCustomerView, PortalSkuView, PortalUserView, toPortal } from '../../src/modules/portal/dto/portal.dto';
import { PortalArtworkCommentView, PortalArtworkView } from '../../src/modules/artworks/dto/portal-artworks.dto';

/**
 * Portal serialisation is allow-list only. This test feeds fully-populated
 * records (every internal column set) through the portal DTOs and asserts
 * that none of the forbidden keys survive.
 */
const FORBIDDEN = [
  'notes', 'internalNotes', 'prepressNotes', 'colourNotes', 'rejectionReason', 'releaseOverrideReason', 'holdReason', 'cancelReason',
  'creditHold', 'creditHoldReason', 'creditHoldAt', 'creditHoldByUserId', 'salesRepUserId', 'salesRep', 'priority', 'machineId', 'machineCode',
  'operatorName', 'operatorUserId', 'rejectQty', 'wasteQty', 'pricingSnapshot', 'passwordHash', 'failedLogins', 'mustChangePassword',
  'paymentTermsId', 'poNotRequired', 'deliveryTolerancePct', 'oversPct', 'version', 'archivedAt', 'defaultMaterialId', 'defaultFinishId',
];

function keysDeep(v: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, acc));
  else if (v && typeof v === 'object' && !(v instanceof Date)) for (const [k, x] of Object.entries(v)) { acc.add(k); keysDeep(x, acc); }
  return acc;
}

const fullCustomer = {
  id: 'c1', number: 'CUS-000001', name: 'Piber Plastics', tradingName: null, abn: '123', taxStatus: 'GST', currency: 'AUD', status: 'ACTIVE',
  paymentTermsId: 'pt', salesRepUserId: 'u1', salesRep: { id: 'u1', name: 'Sam' }, billingStreet: '1 St', billingSuburb: 'X', billingState: 'VIC', billingPostcode: '3000', billingCountry: 'Australia',
  phone: '03', email: 'a@b.c', website: null, notes: 'INTERNAL SECRET', requirements: 'Pallet wrap', defaultMaterialId: 'm', defaultFinishId: 'f',
  poNotRequired: false, allowPartialDispatch: true, deliveryTolerancePct: 5, oversPct: 2, creditHold: true, creditHoldReason: 'Overdue', creditHoldAt: new Date(), creditHoldByUserId: 'u1',
  version: 3, archivedAt: null, createdAt: new Date(), updatedAt: new Date(),
  contacts: [{ id: 'k1', customerId: 'c1', name: 'Jo', email: 'jo@b.c', phone: null, position: 'Buyer', isPrimary: true, canApproveArtwork: true, canAcceptQuotations: false, canSubmitOrders: true, receivesDispatchNotices: true, archivedAt: null, createdAt: new Date(), updatedAt: new Date(), portalUser: { id: 'pu', passwordHash: 'x' } }],
  sites: [{ id: 's1', customerId: 'c1', name: 'Main', street: '1 St', suburb: 'X', state: 'VIC', postcode: '3000', country: 'Australia', deliveryInstructions: 'Dock 2', isDefault: true, archivedAt: null, createdAt: new Date(), updatedAt: new Date() }],
};

const fullSku = {
  id: 'k', number: 'SKU-000001', customerId: 'c1', customerSkuCode: 'X1', description: '10L pail front', labelTypeId: 'lt', applicationId: 'ap', mouldedProduct: 'Pail', status: 'ACTIVE',
  currentSpecificationId: 'sp', routeId: 'r', oversPct: 3, version: 2, archivedAt: null, createdAt: new Date(), updatedAt: new Date(),
  currentSpecification: {
    id: 'sp', skuId: 'k', revisionNo: 2, status: 'APPROVED', changeSummary: 'x', widthMm: '100.000', heightMm: '50.000', shape: 'rect', dieLineFileId: null, materialId: 'm', materialCode: 'PP_WHITE_57', micron: '57', labelWeightG: null,
    colourCount: 4, whiteInk: 'BACKING', printOrientation: null, unwindDirection: null, printDirection: null, varnish: true, lacquer: false, finishId: 'f', finishCode: 'GLOSS', metallic: false, specialInks: null,
    transparency: false, barrierRequirements: null, staticRequirements: null, surfaceTreatment: null, toolId: 't', toolCode: 'DIE-1', plateSetId: null, plateSetCode: null, routeId: 'r', routeCode: 'STD_IML',
    packingMethod: 'Cartons', labelsPerCarton: 1000, labelsPerPallet: 20000, cartonsPerPallet: 20, customerRequirements: 'Visible', internalNotes: 'INTERNAL SECRET', requiresCustomerReapproval: false,
    approvedAt: new Date(), approvedByUserId: 'u1', supersededAt: null, createdByUserId: 'u1', createdAt: new Date(), updatedAt: new Date(),
  },
};

const fullUser = { id: 'pu', customerId: 'c1', email: 'jo@b.c', name: 'Jo', isActive: true, mustChangePassword: true, failedLogins: 2, lockedAt: null, lastLoginAt: null, contactId: 'k1', createdAt: new Date(), roles: ['CUSTOMER_USER'], roleNames: ['Customer User'], passwordHash: 'x' };

describe('portal DTO allow-list', () => {
  it.each([
    ['customer', PortalCustomerView, fullCustomer],
    ['sku', PortalSkuView, fullSku],
    ['user', PortalUserView, fullUser],
  ])('%s view exposes no forbidden keys', (_label, cls, fixture) => {
    const out = JSON.parse(JSON.stringify(toPortal(cls as any, fixture)));
    const keys = keysDeep(out);
    const leaked = FORBIDDEN.filter((k) => keys.has(k));
    expect(leaked).toEqual([]);
    expect(JSON.stringify(out)).not.toContain('INTERNAL SECRET');
  });

  it('keeps the fields the customer needs', () => {
    const c = toPortal(PortalCustomerView, fullCustomer);
    expect(c.number).toBe('CUS-000001');
    expect(c.requirements).toBe('Pallet wrap');
    expect(c.contacts[0].canApproveArtwork).toBe(true);
    expect(c.sites[0].deliveryInstructions).toBe('Dock 2');
    const s = toPortal(PortalSkuView, fullSku);
    expect(s.currentSpecification?.customerRequirements).toBe('Visible');
    expect((s.currentSpecification as any).internalNotes).toBeUndefined();
  });
});

describe('portal artwork DTO allow-list', () => {
  const ARTWORK_FORBIDDEN = [...FORBIDDEN, 'ip', 'userAgent', 'authorUserId', 'authorCustomerUserId', 'uploadedByUserId', 'sentByUserId',
    'decidedByUserId', 'decidedByCustomerUserId', 'accountManagerUserId', 'createdByUserId', 'sha256', 'storageKey', 'bucket', 'proofFileSha256'];

  const fullArtwork = {
    id: 'a1', number: 'ART-000001', customerId: 'c1', skuId: 'k', title: 'Lid', status: 'APPROVED', currentVersionId: 'v1', accountManagerUserId: 'u1',
    createdByUserId: 'u1', version: 2, archivedAt: null, createdAt: new Date(), updatedAt: new Date(),
    sku: { id: 'k', number: 'SKU-1', description: 'Lid', customerSkuCode: null, internalNotes: 'INTERNAL SECRET' },
    accountManager: { name: 'Sam', email: 'sam@baris', id: 'u1', passwordHash: 'x' },
    newVersionInPreparation: false, canApprove: true, canComment: true, approvalStatement: { text: 'I approve', statementVersion: 1 },
    versions: [{
      id: 'v1', artworkId: 'a1', revisionNo: 1, status: 'APPROVED', revisionDescription: 'First', parentVersionId: null, uploadedByUserId: 'u1',
      uploadedByActorType: 'STAFF', customerNotes: 'See logo', internalNotes: 'INTERNAL SECRET', changeRequestSummary: null, lockedAt: new Date(), sentAt: new Date(),
      sentByUserId: 'u1', firstViewedAt: new Date(), decidedAt: new Date(), approvedAt: new Date(), supersededAt: null, supersededByVersionId: null,
      files: [{ id: 'f1', versionId: 'v1', fileId: 'file1', kind: 'PROOF', isPrimary: true, sha256: 'abc', file: { id: 'file1', originalName: 'p.pdf', mimeType: 'application/pdf', sizeBytes: 10, sha256: 'abc', storageKey: 'k', bucket: 'b' } }],
      approvals: [{ id: 'd1', versionId: 'v1', decision: 'APPROVED', proofFileId: 'file1', proofFileSha256: 'abc', decidedByActorType: 'CUSTOMER', decidedByCustomerUserId: 'pu',
        decidedByContactId: 'k1', decidedByUserId: null, decidedByName: 'Jo', organisationName: 'Piber', statement: 'I approve', statementVersion: 1, comments: null,
        ip: '10.0.0.1', userAgent: 'Mozilla', decidedAt: new Date() }],
    }],
  };

  const fullComment = {
    id: 'c', versionId: 'v1', parentId: null, authorType: 'STAFF', authorUserId: 'u1', authorCustomerUserId: null, authorName: 'Sam', visibility: 'SHARED',
    body: 'Fixed', annotation: { page: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, status: 'OPEN', submittedAt: new Date(), resolvedAt: null, resolvedByName: null,
    createdAt: new Date(), updatedAt: new Date(), isDraft: false, isMine: false,
  };

  it.each([
    ['artwork', PortalArtworkView, fullArtwork],
    ['comment', PortalArtworkCommentView, fullComment],
  ])('%s view exposes no forbidden keys', (_label, cls, fixture) => {
    const out = JSON.parse(JSON.stringify(toPortal(cls as any, fixture)));
    const keys = keysDeep(out);
    expect(ARTWORK_FORBIDDEN.filter((k) => keys.has(k))).toEqual([]);
    expect(JSON.stringify(out)).not.toContain('INTERNAL SECRET');
  });

  it('keeps what the reviewer needs, including annotations and the statement', () => {
    const a = JSON.parse(JSON.stringify(toPortal(PortalArtworkView, fullArtwork)));
    expect(a.versions[0].files[0].file).toEqual({ id: 'file1', originalName: 'p.pdf', mimeType: 'application/pdf', sizeBytes: 10 });
    expect(a.versions[0].approvals[0]).toMatchObject({ decision: 'APPROVED', decidedByName: 'Jo', statement: 'I approve' });
    expect(a.approvalStatement).toEqual({ text: 'I approve', statementVersion: 1 });
    const c = JSON.parse(JSON.stringify(toPortal(PortalArtworkCommentView, fullComment)));
    expect(c.annotation).toEqual({ page: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
  });
});
