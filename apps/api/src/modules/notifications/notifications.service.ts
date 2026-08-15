import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationChannel, NotificationType } from '../../generated/prisma/client';
import type { AuthPrincipal } from '../auth/auth.types';
import { NotificationDeliveryService } from './notification-delivery.service';
import type { RegisterPushTokenDto, UpdateNotificationPreferencesDto } from './notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  async list(userId: string): Promise<Record<string, unknown>> {
    const [data, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId, channel: NotificationChannel.IN_APP, deletedAt: null },
        select: {
          id: true,
          actorId: true,
          type: true,
          title: true,
          body: true,
          data: true,
          readAt: true,
          deliveredAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.notification.count({
        where: {
          userId,
          channel: NotificationChannel.IN_APP,
          readAt: null,
          deletedAt: null,
        },
      }),
    ]);
    return { data, unread };
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId,
        channel: NotificationChannel.IN_APP,
        readAt: null,
        deletedAt: null,
      },
      data: { readAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Unread notification not found');
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        channel: NotificationChannel.IN_APP,
        readAt: null,
        deletedAt: null,
      },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async registerPushToken(principal: AuthPrincipal, input: RegisterPushTokenDto): Promise<void> {
    const updated = await this.prisma.device.updateMany({
      where: {
        id: principal.deviceId,
        userId: principal.userId,
        deletedAt: null,
      },
      data: { pushToken: input.pushToken, pushEnabled: true },
    });
    if (updated.count !== 1) throw new NotFoundException('Active device not found');
    await this.prisma.device.updateMany({
      where: {
        id: { not: principal.deviceId },
        pushToken: input.pushToken,
      },
      data: { pushToken: null, pushEnabled: false },
    });
    await this.prisma.notification.updateMany({
      where: {
        userId: principal.userId,
        type: NotificationType.CALL_SAFETY_INVITATION,
        channel: NotificationChannel.PUSH,
        deliveredAt: null,
        deletedAt: null,
      },
      data: { nextDeliveryAt: new Date() },
    });
    await this.delivery.deliverPendingForUser(principal.userId);
  }

  deliverCallSafetyInvitation(notificationId: string): Promise<boolean> {
    return this.delivery.deliverCallSafetyInvitation(notificationId);
  }

  async unregisterPushToken(principal: AuthPrincipal): Promise<void> {
    const updated = await this.prisma.device.updateMany({
      where: {
        id: principal.deviceId,
        userId: principal.userId,
        deletedAt: null,
      },
      data: { pushToken: null, pushEnabled: false },
    });
    if (updated.count !== 1) throw new NotFoundException('Active device not found');
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
