import { CUSTOMER_ROLES, PERMISSIONS, PERMISSION_CODES, ROLE_MATRIX, STAFF_ROLES, isKnownPermission } from '../../src/common/auth/permission-catalogue';

describe('permission catalogue', () => {
  it('has unique, well-formed codes', () => {
    const codes = PERMISSIONS.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^(portal\.)?[a-z_]+(\.[a-z_]+)+$/);
  });

  it('every role in the matrix references only known codes', () => {
    for (const [role, codes] of Object.entries(ROLE_MATRIX)) {
      const unknown = codes.filter((c) => !isKnownPermission(c));
      expect({ role, unknown }).toEqual({ role, unknown: [] });
    }
  });

  it('customer roles hold only portal codes and staff roles only staff codes', () => {
    for (const role of Object.keys(CUSTOMER_ROLES)) {
      expect(ROLE_MATRIX[role as keyof typeof ROLE_MATRIX].every((c) => c.startsWith('portal.'))).toBe(true);
    }
    for (const role of Object.keys(STAFF_ROLES)) {
      expect(ROLE_MATRIX[role as keyof typeof ROLE_MATRIX].every((c) => !c.startsWith('portal.'))).toBe(true);
    }
  });

  it('super admin holds every staff code; customer admin every portal code', () => {
    const staff = [...PERMISSION_CODES].filter((c) => !c.startsWith('portal.'));
    const portal = [...PERMISSION_CODES].filter((c) => c.startsWith('portal.'));
    expect(new Set(ROLE_MATRIX.SUPER_ADMIN)).toEqual(new Set(staff));
    expect(new Set(ROLE_MATRIX.CUSTOMER_ADMIN)).toEqual(new Set(portal));
  });

  it('sensitive actions are not granted to operators or customer users', () => {
    for (const c of ['user.manage', 'role.manage', 'settings.edit', 'artwork.release', 'production.release.override', 'order.cancel.override', 'audit.view']) {
      expect(ROLE_MATRIX.OPERATOR).not.toContain(c);
    }
    expect(ROLE_MATRIX.CUSTOMER_USER).not.toContain('portal.user.manage');
    expect(ROLE_MATRIX.CUSTOMER_USER).not.toContain('portal.customer.edit');
  });
});
