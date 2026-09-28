import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { runWithContext } from '../../common/audit/audit-context';
import { PrincipalService } from '../../common/auth/principal.service';
import { AuthUser, JwtClaims, PrincipalKind } from '../../common/auth/auth-user';
import { LockedError, NotFoundError, UnauthorizedError, ValidationError } from '../../common/errors/domain-error';
import { RefreshTokenService } from './refresh-token.service';
import { EmailOutboxService } from '../notifications/email-outbox.service';

const MAX_FAILED = Math.max(1, Number(process.env.AUTH_MAX_FAILED_LOGINS ?? 5));
const RESET_TTL_MS = 60 * 60 * 1000;

export interface LoginResult { accessToken: string; refreshToken: string; user: AuthUser }

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly refresh: RefreshTokenService,
    private readonly principals: PrincipalService,
    private readonly audit: AuditService,
    private readonly outbox: EmailOutboxService,
  ) {}

  async login(kind: PrincipalKind, email: string, password: string): Promise<LoginResult> {
    const normalised = email.trim().toLowerCase();
    const account = kind === 'CUSTOMER'
      ? await this.prisma.customerUser.findUnique({ where: { email: normalised } })
      : await this.prisma.user.findUnique({ where: { email: normalised } });

    // Same response for unknown email and wrong password.
    if (!account) {
      await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid.');
      await this.authEvent('AUTH_LOGIN_FAILED', kind, normalised, { reason: 'unknown_email' });
      throw new UnauthorizedError('Email or password is incorrect.', 'BAD_CREDENTIALS');
    }
    if (account.lockedAt) {
      await this.authEvent('AUTH_LOGIN_LOCKED', kind, account.id, { email: normalised });
      throw new LockedError(kind === 'CUSTOMER' ? 'This account is locked. Ask your Baris contact to unlock it.' : 'This account is locked. Ask an administrator to unlock it.');
    }
    if (!account.isActive) throw new UnauthorizedError('This account is not active.', 'ACCOUNT_INACTIVE');

    const ok = await bcrypt.compare(password, account.passwordHash);
    if (!ok) {
      const failed = account.failedLogins + 1;
      const lock = failed >= MAX_FAILED;
      const data = { failedLogins: failed, ...(lock ? { lockedAt: new Date() } : {}) };
      if (kind === 'CUSTOMER') await this.prisma.customerUser.update({ where: { id: account.id }, data });
      else await this.prisma.user.update({ where: { id: account.id }, data });
      await this.authEvent(lock ? 'AUTH_LOCKOUT' : 'AUTH_LOGIN_FAILED', kind, account.id, { email: normalised, failed });
      if (lock) {
        this.principals.invalidate(kind, account.id);
        throw new LockedError('Too many failed attempts. This account is now locked.');
      }
      throw new UnauthorizedError('Email or password is incorrect.', 'BAD_CREDENTIALS');
    }

    const data = { failedLogins: 0, lastLoginAt: new Date() };
    if (kind === 'CUSTOMER') await this.prisma.customerUser.update({ where: { id: account.id }, data });
    else await this.prisma.user.update({ where: { id: account.id }, data });
    this.principals.invalidate(kind, account.id);

    const user = await this.principals.resolve({ sub: account.id, kind, email: account.email, name: account.name, customerId: (account as any).customerId });
    const accessToken = this.sign(user);
    const refreshToken = await this.refresh.issue({ kind, id: account.id });
    await this.authEvent('AUTH_LOGIN', kind, account.id, { email: normalised });
    return { accessToken, refreshToken, user };
  }

  async refreshSession(refreshToken: string): Promise<LoginResult> {
    const { principal, token } = await this.refresh.rotate(refreshToken);
    const user = await this.principals.resolve({ sub: principal.id, kind: principal.kind, email: '', name: '' });
    await this.authEvent('AUTH_REFRESH', principal.kind, principal.id, {});
    return { accessToken: this.sign(user), refreshToken: token, user };
  }

  async logout(user: AuthUser | undefined, refreshToken?: string) {
    if (refreshToken) await this.refresh.revoke(refreshToken, 'logout');
    if (user) await this.authEvent('AUTH_LOGOUT', user.kind, user.id, {});
  }

  sign(user: AuthUser): string {
    const claims: JwtClaims = { sub: user.id, kind: user.kind, email: user.email, name: user.name, ...(user.customerId ? { customerId: user.customerId } : {}) };
    return this.jwt.sign(claims);
  }

  /** Always resolves (no account enumeration). Queues the reset email when the account exists. */
  async forgotPassword(kind: PrincipalKind, email: string) {
    const normalised = email.trim().toLowerCase();
    const account = kind === 'CUSTOMER'
      ? await this.prisma.customerUser.findUnique({ where: { email: normalised } })
      : await this.prisma.user.findUnique({ where: { email: normalised } });
    if (!account || !account.isActive) return;
    const token = await this.createResetToken(kind, account.id);
    const base = process.env.APP_URL ?? 'http://localhost:5173';
    const link = `${base}/${kind === 'CUSTOMER' ? 'portal/' : ''}reset-password?token=${token}`;
    await this.outbox.enqueue({
      toEmail: account.email,
      toName: account.name,
      subject: 'Reset your Baris IML password',
      html: `<p>Hello ${escapeHtml(account.name)},</p><p>A password reset was requested for your account. This link is valid for one hour:</p><p><a href="${link}">${link}</a></p><p>If you did not request this, you can ignore this email.</p>`,
      text: `A password reset was requested for your account. This link is valid for one hour: ${link}`,
    });
    await this.authEvent('AUTH_PASSWORD_RESET_REQUESTED', kind, account.id, {});
  }

  /** Also used when a staff member creates a customer login: returns the raw token for the welcome email. */
  async createResetToken(kind: PrincipalKind, accountId: string, ttlMs = RESET_TTL_MS): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
        ...(kind === 'CUSTOMER' ? { customerUserId: accountId } : { userId: accountId }),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    return token;
  }

  async resetPassword(token: string, password: string) {
    const row = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: createHash('sha256').update(token).digest('hex') } });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) throw new ValidationError('This reset link is not valid or has expired. Request a new one.');
    const kind: PrincipalKind = row.customerUserId ? 'CUSTOMER' : 'STAFF';
    const id = row.customerUserId ?? row.userId!;
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
      const data = { passwordHash, mustChangePassword: false, failedLogins: 0, lockedAt: null };
      if (kind === 'CUSTOMER') await tx.customerUser.update({ where: { id }, data });
      else await tx.user.update({ where: { id }, data });
      await this.audit.record(tx, { action: 'AUTH_PASSWORD_RESET', entityType: 'AuthEvent', entityId: id, after: { kind } });
    });
    await this.refresh.revokeAll({ kind, id }, 'password_reset');
    this.principals.invalidate(kind, id);
  }

  async changePassword(user: AuthUser, currentPassword: string, newPassword: string) {
    const account = user.kind === 'CUSTOMER'
      ? await this.prisma.customerUser.findUnique({ where: { id: user.id } })
      : await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!account) throw new NotFoundError('Account');
    if (!(await bcrypt.compare(currentPassword, account.passwordHash))) throw new ValidationError('The current password is incorrect.');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const data = { passwordHash, mustChangePassword: false };
    if (user.kind === 'CUSTOMER') await this.prisma.customerUser.update({ where: { id: user.id }, data });
    else await this.prisma.user.update({ where: { id: user.id }, data });
    await this.authEvent('AUTH_PASSWORD_CHANGED', user.kind, user.id, {});
    this.principals.invalidate(user.kind, user.id);
  }

  private async authEvent(action: string, kind: PrincipalKind, id: string, after: Record<string, unknown>) {
    try {
      await this.audit.record(this.prisma, { action, entityType: 'AuthEvent', entityId: id, after: { kind, ...after } });
    } catch (e) {
      this.log.warn(`auth event ${action} not recorded: ${(e as Error).message}`);
    }
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export { runWithContext };
