import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { getAuditContext } from '../../common/audit/audit-context';
import { AuditService } from '../../common/audit/audit.service';
import { ConflictError, UnauthorizedError } from '../../common/errors/domain-error';
import { PrincipalKind } from '../../common/auth/auth-user';

const TTL_DAYS = 30;
const ROTATION_GRACE_MS = 60_000;

export interface Principal { kind: PrincipalKind; id: string }

/**
 * Server-side refresh tokens, rotated on every exchange (architecture
 * Appendix A.1). A replay of an already-rotated token outside the 60 s grace
 * window is treated as theft and revokes every session of that principal.
 * Inside the window (a multi-tab race the client lock did not catch) the
 * caller gets 409 REFRESH_RACE and re-reads the token the winning tab stored.
 */
@Injectable()
export class RefreshTokenService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private principalWhere(p: Principal) {
    return p.kind === 'CUSTOMER' ? { customerUserId: p.id } : { userId: p.id };
  }

  async issue(p: Principal): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const ctx = getAuditContext();
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hash(token),
        ...this.principalWhere(p),
        expiresAt: new Date(Date.now() + TTL_DAYS * 24 * 3600 * 1000),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    });
    return token;
  }

  /** Validate + rotate. Returns the principal and the new token. */
  async rotate(token: string): Promise<{ principal: Principal; token: string }> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hash(token) } });
    if (!row) throw new UnauthorizedError('Session is not valid. Sign in again.', 'REFRESH_INVALID');
    const principal: Principal = row.customerUserId ? { kind: 'CUSTOMER', id: row.customerUserId } : { kind: 'STAFF', id: row.userId! };

    if (row.revokedAt) {
      if (row.rotatedToId && Date.now() - row.revokedAt.getTime() < ROTATION_GRACE_MS) {
        throw new ConflictError('REFRESH_RACE', 'Another tab refreshed this session. Retry with the stored token.');
      }
      await this.revokeAll(principal, 'replay_detected');
      await this.audit.record(this.prisma, { action: 'AUTH_REFRESH_REPLAY', entityType: 'AuthEvent', entityId: principal.id, after: { kind: principal.kind } });
      throw new UnauthorizedError('Session is not valid. Sign in again.', 'REFRESH_REPLAY');
    }
    if (row.expiresAt.getTime() < Date.now()) throw new UnauthorizedError('Session has expired. Sign in again.', 'REFRESH_EXPIRED');

    const newToken = randomBytes(32).toString('base64url');
    const ctx = getAuditContext();
    await this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          tokenHash: this.hash(newToken),
          ...this.principalWhere(principal),
          expiresAt: new Date(Date.now() + TTL_DAYS * 24 * 3600 * 1000),
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
        },
      });
      // Status-predicate update: if two requests race on the same token only one wins.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: row.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'rotated', rotatedToId: created.id },
      });
      if (count === 0) throw new ConflictError('REFRESH_RACE', 'Another tab refreshed this session. Retry with the stored token.');
    });
    return { principal, token: newToken };
  }

  async revoke(token: string, reason = 'logout') {
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: this.hash(token), revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
  }

  async revokeAll(p: Principal, reason: string) {
    await this.prisma.refreshToken.updateMany({ where: { ...this.principalWhere(p), revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
  }
}
