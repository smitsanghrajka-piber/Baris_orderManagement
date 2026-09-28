import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationDispatcher } from './notification-dispatcher';
import { EmailOutboxService } from './email-outbox.service';
import { DomainEventsService } from './domain-events.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationDispatcher, EmailOutboxService, DomainEventsService],
  exports: [NotificationsService, EmailOutboxService, DomainEventsService],
})
export class NotificationsModule {}
