import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { NotificationDispatcher } from './notification-dispatcher';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth-user';
import { NotificationRuleDto, PreferenceDto, UpdateNotificationRuleDto } from './dto/notifications.dto';

@ApiTags('notifications')
@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService, private readonly dispatcher: NotificationDispatcher) {}

  /** Any authenticated principal sees only their own notifications. */
  @RequirePermission('*') @Get('notifications')
  list(@CurrentUser() user: AuthUser, @Query('unread') unread?: string, @Query('take') take?: string) {
    return this.notifications.list(user, unread === '1' || unread === 'true', take ? Number(take) : 50);
  }

  @RequirePermission('*') @Get('notifications/unread-count')
  unreadCount(@CurrentUser() user: AuthUser) { return this.notifications.unreadCount(user); }

  @RequirePermission('*') @Post('notifications/:id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.notifications.markRead(user, id); }

  @RequirePermission('*') @Post('notifications/read-all')
  markAllRead(@CurrentUser() user: AuthUser) { return this.notifications.markAllRead(user); }

  @RequirePermission('*') @Get('notification-preferences')
  preferences(@CurrentUser() user: AuthUser) { return this.notifications.preferences(user); }

  @RequirePermission('*') @Put('notification-preferences')
  setPreference(@CurrentUser() user: AuthUser, @Body() dto: PreferenceDto) { return this.notifications.setPreference(user, dto); }

  @RequirePermission('notification_rule.edit') @Get('notification-rules')
  rules() { return this.notifications.listRules(); }

  @RequirePermission('notification_rule.edit') @Post('notification-rules')
  async createRule(@Body() dto: NotificationRuleDto) { const r = await this.notifications.createRule(dto); this.dispatcher.invalidate(); return r; }

  @RequirePermission('notification_rule.edit') @Patch('notification-rules/:id')
  async updateRule(@Param('id') id: string, @Body() dto: UpdateNotificationRuleDto) { const r = await this.notifications.updateRule(id, dto); this.dispatcher.invalidate(); return r; }
}
