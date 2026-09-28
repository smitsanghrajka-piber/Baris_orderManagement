import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { createMailProvider, MailProvider } from './mail-providers';

const MAX_ATTEMPTS = 5;

/**
 * Durable outbox: rows are written inside business transactions, a
 * scheduler delivers them with retry. Transport is pluggable and defaults
 * to `none`, so nothing leaves the box until EMAIL_TRANSPORT is set.
 */
@Injectable()
export class EmailOutboxService {
  private readonly log = new Logger(EmailOutboxService.name);
  private readonly provider: MailProvider;
  private running = false;

  constructor(private readonly prisma: PrismaService) {
    this.provider = createMailProvider();
  }

  async enqueue(input: { toEmail: string; toName?: string | null; subject: string; html: string; text?: string | null; notificationId?: string | null }) {
    return this.prisma.emailOutbox.create({
      data: { toEmail: input.toEmail, toName: input.toName ?? null, subject: input.subject, htmlBody: input.html, textBody: input.text ?? null, notificationId: input.notificationId ?? null },
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async process() {
    if (this.running || process.env.OUTBOX_DISABLED === '1') return;
    this.running = true;
    try {
      const batch = await this.prisma.emailOutbox.findMany({ where: { status: 'PENDING', attempts: { lt: MAX_ATTEMPTS } }, orderBy: { createdAt: 'asc' }, take: 25 });
      for (const row of batch) {
        try {
          await this.provider.send({ to: row.toEmail, toName: row.toName, subject: row.subject, html: row.htmlBody, text: row.textBody });
          await this.prisma.emailOutbox.update({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 } } });
          if (row.notificationId) await this.prisma.notification.updateMany({ where: { id: row.notificationId }, data: { emailedAt: new Date() } });
        } catch (err) {
          const attempts = row.attempts + 1;
          await this.prisma.emailOutbox.update({ where: { id: row.id }, data: { attempts, lastError: String((err as Error).message).slice(0, 1000), status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING' } });
          this.log.warn(`email to ${row.toEmail} failed (attempt ${attempts}): ${(err as Error).message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
