import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationRule } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService, Recipient } from './notifications.service';
import { EmailOutboxService } from './email-outbox.service';
import { DOMAIN_EVENT, DomainEvent } from './domain-events.service';
import { runWithContext, SYSTEM_CONTEXT } from '../../common/audit/audit-context';

const RULE_CACHE_MS = 30_000;

/**
 * Resolves a DomainEvent into recipients through NotificationRule rows,
 * applies per-user preferences, writes in-app notifications (deduped) and
 * queues emails. Never throws into the emitting request.
 */
@Injectable()
export class NotificationDispatcher {
  private readonly log = new Logger(NotificationDispatcher.name);
  private rulesCache: { at: number; rules: NotificationRule[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly outbox: EmailOutboxService,
  ) {}

  @OnEvent(DOMAIN_EVENT, { async: true })
  async handle(event: DomainEvent) {
    try {
      await runWithContext(SYSTEM_CONTEXT, () => this.dispatch(event));
    } catch (err) {
      this.log.warn(`dispatch of ${event.type} failed: ${(err as Error).message}`);
    }
  }

  async dispatch(event: DomainEvent) {
    const rules = (await this.rules()).filter((r) => r.isActive && r.eventType === event.type);
    if (!rules.length) return;
    const seen = new Set<string>();
    for (const rule of rules) {
      const recipients = await this.resolve(rule, event);
      for (const r of recipients) {
        const key = r.userId ? `u:${r.userId}` : `c:${r.customerUserId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const pref = await this.notifications.preferenceFor(r, event.type);
        const wantInApp = pref?.inApp ?? true;
        const wantEmail = (pref?.email ?? true) && (rule.channel === 'EMAIL' || rule.channel === 'BOTH');
        const link = r.customerUserId ? (event.portalLink ?? null) : (event.link ?? null);
        let notificationId: string | null = null;
        if (wantInApp || wantEmail) {
          const { notification, created } = await this.notifications.notify(r, {
            type: event.type, title: event.title, body: event.body ?? null, entityType: event.entityType, entityId: event.entityId, link,
            dedupeKey: `${event.type}:${event.entityId}`, debounceMinutes: rule.debounceMinutes,
          });
          notificationId = notification.id;
          if (!created) continue; // bumped or debounced — no second email
        }
        if (wantEmail && !rule.digest) {
          const to = await this.email(r);
          if (to) {
            const base = process.env.APP_URL ?? 'http://localhost:5173';
            const url = link ? `${base}${link}` : base;
            await this.outbox.enqueue({
              toEmail: to.email, toName: to.name, notificationId,
              subject: `[Baris IML] ${event.title}`,
              html: `<p>Hello ${esc(to.name)},</p><p>${esc(event.title)}</p>${event.body ? `<p>${esc(event.body)}</p>` : ''}<p><a href="${url}">Open in Baris IML</a></p>`,
              text: `${event.title}\n${event.body ?? ''}\n${url}`,
            });
          }
        }
      }
    }
  }

  private async rules(): Promise<NotificationRule[]> {
    if (this.rulesCache && Date.now() - this.rulesCache.at < RULE_CACHE_MS) return this.rulesCache.rules;
    const rules = await this.prisma.notificationRule.findMany();
    this.rulesCache = { at: Date.now(), rules };
    return rules;
  }

  invalidate() {
    this.rulesCache = null;
  }

  private async resolve(rule: NotificationRule, event: DomainEvent): Promise<Recipient[]> {
    switch (rule.audience) {
      case 'ROLE': {
        if (!rule.roleCode) return [];
        const users = await this.prisma.user.findMany({ where: { isActive: true, roles: { some: { role: { code: rule.roleCode } } } }, select: { id: true } });
        return users.map((u) => ({ userId: u.id }));
      }
      case 'CONTACT_FLAG': {
        if (!event.customerId || !rule.contactFlag) return [];
        const flag = rule.contactFlag as 'canApproveArtwork' | 'canAcceptQuotations' | 'canSubmitOrders' | 'receivesDispatchNotices';
        const users = await this.prisma.customerUser.findMany({ where: { customerId: event.customerId, isActive: true, contact: { archivedAt: null, [flag]: true } }, select: { id: true } });
        return users.map((u) => ({ customerUserId: u.id }));
      }
      case 'SALES_REP': {
        if (!event.customerId) return [];
        const c = await this.prisma.customer.findUnique({ where: { id: event.customerId }, select: { salesRepUserId: true } });
        return c?.salesRepUserId ? [{ userId: c.salesRepUserId }] : [];
      }
      case 'SPECIFIC_USER':
        return rule.userId ? [{ userId: rule.userId }] : [];
      case 'ACTOR_TARGET':
        if (event.targetUserId) return [{ userId: event.targetUserId }];
        if (event.targetCustomerUserId) return [{ customerUserId: event.targetCustomerUserId }];
        return [];
      default:
        return [];
    }
  }

  private async email(r: Recipient): Promise<{ email: string; name: string } | null> {
    if (r.userId) return this.prisma.user.findUnique({ where: { id: r.userId }, select: { email: true, name: true } });
    if (r.customerUserId) return this.prisma.customerUser.findUnique({ where: { id: r.customerUserId }, select: { email: true, name: true } });
    return null;
  }
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
