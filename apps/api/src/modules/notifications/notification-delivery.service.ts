import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import {
  CallInvitationStatus,
  NotificationChannel,
  NotificationType,
} from '../../generated/prisma/client';
import {
  buildExpoCallSafetyPushMessages,
  parseCallSafetyInvitationNotificationData,
} from './domain/call-safety-invitation-notification.policy';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CLAIM_TTL_MS = 2 * 60_000;
const MAX_DELIVERY_ATTEMPTS = 8;

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async deliverCallSafetyInvitation(notificationId: string): Promise<boolean> {
    const now = new Date();
    const claimed = await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        type: NotificationType.CALL_SAFETY_INVITATION,
        channel: NotificationChannel.PUSH,
        deliveredAt: null,
        deletedAt: null,
        OR: [
          { deliveryClaimedAt: null },
          { deliveryClaimedAt: { lt: new Date(now.getTime() - CLAIM_TTL_MS) } },
        ],
      },
      data: { deliveryClaimedAt: now },
    });
    if (claimed.count !== 1) return false;

    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, deletedAt: null },
      include: {
        user: {
          include: {
            devices: {
              where: { pushEnabled: true, pushToken: { not: null }, deletedAt: null },
              select: { id: true, pushToken: true },
            },
            notificationPreference: true,
          },
        },
      },
    });
    if (!notification) return false;

    const data = parseCallSafetyInvitationNotificationData(notification.data);
    if (!data || notification.entityId !== data.invitationId) {
      await this.finish(notification.id, 'INVALID_SAFE_PAYLOAD');
      return false;
    }

    const invitation = await this.prisma.callInvitation.findFirst({
      where: {
        id: data.invitationId,
        sessionId: data.sessionId,
        invitedUserId: notification.userId,
        status: CallInvitationStatus.PENDING,
        expiresAt: { gt: now },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!invitation) {
      await this.finish(notification.id, 'INVITATION_NO_LONGER_PENDING');
      return false;
    }

    const preference = notification.user.notificationPreference;
    if (
      preference?.pushEnabled === false ||
      preference?.callSafetyInvitations === false ||
      !this.config.get('EXPO_PUSH_ENABLED', { infer: true })
    ) {
      await this.finish(notification.id, 'PUSH_DISABLED');
      return false;
    }

    const devices = notification.user.devices.flatMap((device) =>
      device.pushToken ? [{ id: device.id, token: device.pushToken }] : [],
    );
    const messages = buildExpoCallSafetyPushMessages({
      tokens: devices.map((device) => device.token),
      notificationId: notification.id,
      data,
    }).slice(0, 100);
    if (messages.length === 0) {
      await this.retry(notification.id, notification.deliveryAttempts, 'NO_EXPO_PUSH_DEVICE');
      return false;
    }

    try {
      const accessToken = this.config.get('EXPO_ACCESS_TOKEN', { infer: true });
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        await this.retry(
          notification.id,
          notification.deliveryAttempts,
          `EXPO_HTTP_${response.status}`,
        );
        return false;
      }

      const payload: unknown = await response.json();
      const tickets = this.tickets(payload);
      const successful = tickets.some((ticket) => ticket.status === 'ok');
      const invalidTokens = tickets.flatMap((ticket, index) =>
        ticket.status === 'error' && ticket.error === 'DeviceNotRegistered'
          ? [messages[index]?.to]
          : [],
      );
      if (invalidTokens.length > 0) {
        await this.prisma.device.updateMany({
          where: {
            pushToken: { in: invalidTokens.filter((token): token is string => Boolean(token)) },
          },
          data: { pushToken: null, pushEnabled: false },
        });
      }
      if (!successful) {
        await this.retry(notification.id, notification.deliveryAttempts, 'EXPO_REJECTED');
        return false;
      }

      await this.prisma.notification.updateMany({
        where: { id: notification.id, deliveredAt: null },
        data: {
          deliveredAt: new Date(),
          deliveryAttempts: { increment: 1 },
          deliveryClaimedAt: null,
          nextDeliveryAt: null,
          deliveryError: null,
        },
      });
      return true;
    } catch {
      this.logger.warn(`Push provider unavailable for notification ${notification.id}`);
      await this.retry(notification.id, notification.deliveryAttempts, 'PROVIDER_UNAVAILABLE');
      return false;
    }
  }

  async deliverPendingForUser(userId: string): Promise<number> {
    const notifications = await this.pending({ userId });
    const results = await Promise.allSettled(
      notifications.map((notification) => this.deliverCallSafetyInvitation(notification.id)),
    );
    return results.filter((result) => result.status === 'fulfilled' && result.value).length;
  }

  async deliverPending(): Promise<number> {
    const notifications = await this.pending({});
    const results = await Promise.allSettled(
      notifications.map((notification) => this.deliverCallSafetyInvitation(notification.id)),
    );
    return results.filter((result) => result.status === 'fulfilled' && result.value).length;
  }

  private pending(where: { userId?: string }) {
    const now = new Date();
    return this.prisma.notification.findMany({
      where: {
        ...where,
        type: NotificationType.CALL_SAFETY_INVITATION,
        channel: NotificationChannel.PUSH,
        deliveredAt: null,
        deliveryAttempts: { lt: MAX_DELIVERY_ATTEMPTS },
        deletedAt: null,
        AND: [
          { OR: [{ nextDeliveryAt: null }, { nextDeliveryAt: { lte: now } }] },
          {
            OR: [
              { deliveryClaimedAt: null },
              { deliveryClaimedAt: { lt: new Date(now.getTime() - CLAIM_TTL_MS) } },
            ],
          },
        ],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' as const },
      take: 20,
    });
  }

  private async finish(notificationId: string, reason: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, deliveredAt: null },
      data: {
        deliveredAt: new Date(),
        deliveryAttempts: { increment: 1 },
        deliveryClaimedAt: null,
        nextDeliveryAt: null,
        deliveryError: reason.slice(0, 500),
      },
    });
  }

  private async retry(notificationId: string, attempts: number, reason: string): Promise<void> {
    const delayMs = Math.min(15 * 60_000, 30_000 * 2 ** Math.min(attempts, 5));
    await this.prisma.notification.updateMany({
      where: { id: notificationId, deliveredAt: null },
      data: {
        deliveryAttempts: { increment: 1 },
        deliveryClaimedAt: null,
        nextDeliveryAt: new Date(Date.now() + delayMs),
        deliveryError: reason.slice(0, 500),
      },
    });
  }

  private tickets(value: unknown): Array<{ status: 'ok' | 'error'; error: string | null }> {
    if (!this.isRecord(value) || !Array.isArray(value.data)) return [];
    return value.data.map((entry: unknown) => {
      if (!this.isRecord(entry) || (entry.status !== 'ok' && entry.status !== 'error')) {
        return { status: 'error' as const, error: 'MALFORMED_TICKET' };
      }
      const details = this.isRecord(entry.details) ? entry.details : null;
      return {
        status: entry.status,
        error: details && typeof details.error === 'string' ? details.error : null,
      };
    });
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
