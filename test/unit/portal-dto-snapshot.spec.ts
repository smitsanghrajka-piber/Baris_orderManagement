import 'reflect-metadata';
import { PortalCustomerView, PortalSkuView, PortalUserView, toPortal } from '../../src/modules/portal/dto/portal.dto';

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
