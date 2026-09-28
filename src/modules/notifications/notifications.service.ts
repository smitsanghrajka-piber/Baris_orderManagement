import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser } from '../../common/auth/auth-user';
import { NotFoundError, ValidationError } from '../../common/errors/domain-error';
import { NotificationRuleDto, PreferenceDto, UpdateNotificationRuleDto } from './dto/notifications.dto';
import { AuditService } from '../../common/audit/audit.service';

export interface Recipient { userId?: string; customerUserId?: string }

export interface NotifyInput {
  type: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  link?: string | null;
  dedupeKey?: string | null;
  debounceMinutes?: number;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /**
   * Create an in-app notification with dedupe: an unread notification with
   * the same dedupeKey for the recipient is bumped (occurrences+1, moved to
   * the top) instead of duplicated; a read one suppresses re-creation for
   * debounceMinutes. Returns the row, and whether it was newly created.
   */
  async notify(recipient: Recipient, input: NotifyInput): Promise<{ notification: { id: string }; created: boolean }> {
    const who: Prisma.NotificationWhereInput = recipient.userId ? { userId: recipient.userId } : { customerUserId: recipient.customerUserId };
    if (input.dedupeKey) {
      const existing = await this.prisma.notification.findFirst({ where: { ...who, dedupeKey: input.dedupeKey }, orderBy: { createdAt: 'desc' } });
      if (existing && !existing.readAt) {
        const bumped = await this.prisma.notification.update({ where: { id: existing.id }, data: { occurrences: { increment: 1 }, title: input.title, body: input.body ?? existing.body, createdAt: new Date() } });
        return { notification: bumped, created: false };
      }
      if (existing && existing.readAt && input.debounceMinutes && Date.now() - existing.createdAt.getTime() < input.debounceMinutes * 60_000) {
        return { notification: existing, created: false };
      }
    }
    const notification = await this.prisma.notification.create({
      data: {
        userId: recipient.userId ?? null,
        customerUserId: recipient.customerUserId ?? null,
        type: input.type, title: input.title, body: input.body ?? null,
        entityType: input.entityType ?? null, entityId: input.entityId ?? null, link: input.link ?? null,
        dedupeKey: input.dedupeKey ?? null,
      },
    });
    return { notification, created: true };
  }

  private mine(user: AuthUser): Prisma.NotificationWhereInput {
    return user.kind === 'CUSTOMER' ? { customerUserId: user.id } : { userId: user.id };
  }

  async list(user: AuthUser, unreadOnly: boolean, take = 50) {
    return this.prisma.notification.findMany({ where: { ...this.mine(user), ...(unreadOnly ? { readAt: null } : {}) }, orderBy: { createdAt: 'desc' }, take: Math.min(take, 200) });
  }

  async unreadCount(user: AuthUser) {
    return { count: await this.prisma.notification.count({ where: { ...this.mine(user), readAt: null } }) };
  }

  async markRead(user: AuthUser, id: string) {
    const { count } = await this.prisma.notification.updateMany({ where: { id, ...this.mine(user) }, data: { readAt: new Date() } });
    if (count === 0) throw new NotFoundError('Notification');
    return { ok: true };
  }

  async markAllRead(user: AuthUser) {
    await this.prisma.notification.updateMany({ where: { ...this.mine(user), readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  // ─── Rules ───

  listRules() {
    return this.prisma.notificationRule.findMany({ orderBy: [{ eventType: 'asc' }, { audience: 'asc' }], include: { user: { select: { id: true, name: true } } } });
  }

  async createRule(dto: NotificationRuleDto) {
    this.validateRule(dto);
    const rule = await this.prisma.notificationRule.create({ data: dto });
    await this.audit.record(this.prisma, { action: 'NOTIFICATION_RULE_CREATED', entityType: 'NotificationRule', entityId: rule.id, after: rule });
    return rule;
  }

  async updateRule(id: string, dto: UpdateNotificationRuleDto) {
    const existing = await this.prisma.notificationRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Notification rule');
    this.validateRule({ ...existing, ...dto } as NotificationRuleDto);
    const rule = await this.prisma.notificationRule.update({ where: { id }, data: dto });
    await this.audit.record(this.prisma, { action: 'NOTIFICATION_RULE_UPDATED', entityType: 'NotificationRule', entityId: id, before: existing, after: rule });
    return rule;
  }

  private validateRule(r: NotificationRuleDto) {
    if (r.audience === 'ROLE' && !r.roleCode) throw new ValidationError('A ROLE rule needs a role code.');
    if (r.audience === 'CONTACT_FLAG' && !r.contactFlag) throw new ValidationError('A CONTACT_FLAG rule needs a contact flag.');
    if (r.audience === 'SPECIFIC_USER' && !r.userId) throw new ValidationError('A SPECIFIC_USER rule needs a user.');
  }

  // ─── Preferences ───

  async preferences(user: AuthUser) {
    return this.prisma.notificationPreference.findMany({ where: user.kind === 'CUSTOMER' ? { customerUserId: user.id } : { userId: user.id }, orderBy: { eventType: 'asc' } });
  }

  async setPreference(user: AuthUser, dto: PreferenceDto) {
    const where = user.kind === 'CUSTOMER' ? { customerUserId_eventType: { customerUserId: user.id, eventType: dto.eventType } } : { userId_eventType: { userId: user.id, eventType: dto.eventType } };
    return this.prisma.notificationPreference.upsert({
      where: where as any,
      update: { inApp: dto.inApp, email: dto.email },
      create: { eventType: dto.eventType, inApp: dto.inApp, email: dto.email, ...(user.kind === 'CUSTOMER' ? { customerUserId: user.id } : { userId: user.id }) },
    });
  }

  async preferenceFor(recipient: Recipient, eventType: string) {
    return this.prisma.notificationPreference.findFirst({ where: { ...(recipient.userId ? { userId: recipient.userId } : { customerUserId: recipient.customerUserId }), eventType } });
  }
}
