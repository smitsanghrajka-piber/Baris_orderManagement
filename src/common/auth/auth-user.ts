/**
 * The principal attached to req.user after JWT validation. Built by
 * PrincipalService from the token claims plus a short-cached DB lookup, so a
 * disabled/locked account or a changed role set takes effect within the
 * cache TTL, not at token expiry.
 */
export type PrincipalKind = 'STAFF' | 'CUSTOMER';

export interface ContactFlags {
  canApproveArtwork: boolean;
  canAcceptQuotations: boolean;
  canSubmitOrders: boolean;
}

export interface AuthUser {
  kind: PrincipalKind;
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  /** Tenant — present for CUSTOMER principals only. */
  customerId?: string;
  /** Linked contact — present for CUSTOMER principals with a contact link. */
  contactId?: string | null;
  contactFlags?: ContactFlags;
  mustChangePassword: boolean;
}

export interface JwtClaims {
  sub: string;
  kind: PrincipalKind;
  email: string;
  name: string;
  customerId?: string;
  iat?: number;
  exp?: number;
}

export function hasPermission(user: AuthUser | undefined, ...codes: string[]): boolean {
  if (!user) return false;
  return codes.some((c) => user.permissions.includes(c));
}
