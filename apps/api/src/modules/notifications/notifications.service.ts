import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { AuthPrincipal } from '../auth/auth.types';
import type { RegisterPushTokenDto, UpdateNotificationPreferencesDto } from './notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<Record<string, unknown>> {
    const [data, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null, deletedAt: null } }),
    ]);
    return { data, unread };
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null, deletedAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Unread notification not found');
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null, deletedAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async registerPushToken(principal: AuthPrincipal, input: RegisterPushTokenDto): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.device.update({
        where: { id: principal.deviceId },
        data: { pushToken: input.pushToken, pushEnabled: true },
      }),
      this.prisma.device.updateMany({
        where: {
          id: { not: principal.deviceId },
          pushToken: input.pushToken,
        },
        data: { pushToken: null },
      }),
    ]);
  }

  async preferences(userId: string): Promise<Record<string, unknown>> {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId },
      update: { deletedAt: null },
    });
  }

  async updatePreferences(
    userId: string,
    input: UpdateNotificationPreferencesDto,
  ): Promise<Record<string, unknown>> {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...input },
      update: { ...input, deletedAt: null },
    });
  }
}
