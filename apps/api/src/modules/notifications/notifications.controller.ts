import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../auth/auth.types';
import { RegisterPushTokenDto, UpdateNotificationPreferencesDto } from './notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() principal: AuthPrincipal): ReturnType<NotificationsService['list']> {
    return this.notifications.list(principal.userId);
  }

  @Patch(':notificationId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async read(
    @CurrentUser() principal: AuthPrincipal,
    @Param('notificationId') notificationId: string,
  ): Promise<void> {
    await this.notifications.markRead(principal.userId, notificationId);
  }

  @Patch('read-all')
  readAll(@CurrentUser() principal: AuthPrincipal): Promise<number> {
    return this.notifications.markAllRead(principal.userId);
  }

  @Post('push-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  async pushToken(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: RegisterPushTokenDto,
  ): Promise<void> {
    await this.notifications.registerPushToken(principal, input);
  }

  @Get('preferences')
  preferences(@CurrentUser() principal: AuthPrincipal): ReturnType<NotificationsService['preferences']> {
    return this.notifications.preferences(principal.userId);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: UpdateNotificationPreferencesDto,
  ): ReturnType<NotificationsService['updatePreferences']> {
    return this.notifications.updatePreferences(principal.userId, input);
  }
}
