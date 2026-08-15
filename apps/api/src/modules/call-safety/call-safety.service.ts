import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../config/environment';
import { approximateCoordinates } from '../../common/utils/geo.util';
import { PrismaService } from '../../database/prisma.service';
import {
  CallConsentStatus,
  CallInvitationStatus,
  CallParticipantRole,
  CallSessionEventType,
  CallSessionStatus,
  FriendshipStatus,
  NotificationChannel,
  NotificationType,
  Prisma,
  UserStatus,
} from '../../generated/prisma/client';
import type { AuthPrincipal } from '../auth/auth.types';
import { buildCallSafetyInvitationNotificationData } from '../notifications/domain/call-safety-invitation-notification.policy';
import { NotificationsService } from '../notifications/notifications.service';
import { SafetyService } from '../safety/safety.service';
import type {
  CallSafetyLocationDto,
  CallSafetySosDto,
  CreateCallSafetySessionDto,
  GrantCallConsentDto,
} from './call-safety.dto';

@Injectable()
export class CallSafetyService {
  private readonly logger = new Logger(CallSafetyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Environment, true>,
    private readonly emergency: SafetyService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(actorId: string, input: CreateCallSafetySessionDto) {
    if (actorId === input.invitedUserId) {
      throw new BadRequestException('You cannot invite yourself');
    }
    await this.expireDueSessions();
    const since = new Date(Date.now() - 60 * 60_000);
    const recentInvites = await this.prisma.callSafetySession.count({
      where: { initiatorId: actorId, createdAt: { gte: since }, deletedAt: null },
    });
    if (recentInvites >= 10) throw new ConflictException('Invitation limit reached');
    const [initiator, invitee, blocked, friendship] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: actorId, status: UserStatus.ACTIVE, deletedAt: null },
        include: { profile: true },
      }),
      this.prisma.user.findFirst({
        where: { id: input.invitedUserId, status: UserStatus.ACTIVE, deletedAt: null },
        include: { profile: true },
      }),
      this.prisma.userBlock.findFirst({
        where: {
          deletedAt: null,
          OR: [
            { blockerId: actorId, blockedUserId: input.invitedUserId },
            { blockerId: input.invitedUserId, blockedUserId: actorId },
          ],
        },
      }),
      this.prisma.friendship.findFirst({
        where: {
          status: FriendshipStatus.ACCEPTED,
          deletedAt: null,
          OR: [
            { requesterId: actorId, addresseeId: input.invitedUserId },
            { requesterId: input.invitedUserId, addresseeId: actorId },
          ],
        },
      }),
    ]);
    if (!initiator || (!initiator.emailVerifiedAt && !initiator.phoneVerifiedAt)) {
      throw new ForbiddenException('Verify your account before creating a session');
    }
    if (!invitee || (!invitee.emailVerifiedAt && !invitee.phoneVerifiedAt)) {
      throw new NotFoundException('Verified invitee not found');
    }
    if (blocked) throw new ForbiddenException('This invitation is unavailable');
    if (!friendship && !invitee.profile?.isDiscoverable) {
      throw new ForbiddenException('Invitee is not discoverable');
    }
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + input.durationMinutes * 60_000);
    const result = await this.prisma.$transaction(async (tx) => {
      const created = await tx.callSafetySession.create({
        data: {
          initiatorId: actorId,
          mode: input.mode,
          mutualRequired: true,
          expiresAt,
          participants: {
            create: [
              {
                userId: actorId,
                role: CallParticipantRole.INITIATOR,
                joinedAt: now,
                consent: {
                  create: {
                    status: CallConsentStatus.NOT_GRANTED,
                    policyVersion: '2026-01',
                    expiresAt,
                  },
                },
              },
              {
                userId: invitee.id,
                role: CallParticipantRole.INVITEE,
                consent: {
                  create: {
                    status: CallConsentStatus.NOT_GRANTED,
                    policyVersion: '2026-01',
                    expiresAt,
                  },
                },
              },
            ],
          },
        },
      });
      const invitation = await tx.callInvitation.create({
        data: {
          sessionId: created.id,
          invitedUserId: invitee.id,
          tokenHash: this.hashToken(token),
          expiresAt,
        },
      });
      await tx.callSessionEvent.createMany({
        data: [
          {
            sessionId: created.id,
            actorId,
            type: CallSessionEventType.CREATED,
            occurredAt: now,
          },
          {
            sessionId: created.id,
            actorId,
            type: CallSessionEventType.INVITED,
            occurredAt: now,
          },
        ],
      });
      const notificationData = buildCallSafetyInvitationNotificationData({
        invitationId: invitation.id,
        sessionId: created.id,
        expiresAt,
      });
      const commonNotification = {
        userId: invitee.id,
        actorId,
        type: NotificationType.CALL_SAFETY_INVITATION,
        title: 'Stay With Me invitation',
        body: `${initiator.profile?.displayName ?? 'A verified Atlas user'} invited you to a private, time-limited safety session.`,
        data: { ...notificationData },
        entityType: 'CallInvitation',
        entityId: invitation.id,
      } as const;
      await tx.notification.create({
        data: {
          ...commonNotification,
          channel: NotificationChannel.IN_APP,
          dedupeKey: `call-safety:${invitation.id}:in-app`,
          deliveredAt: now,
        },
      });
      const pushNotification = await tx.notification.create({
        data: {
          ...commonNotification,
          channel: NotificationChannel.PUSH,
          dedupeKey: `call-safety:${invitation.id}:push`,
          nextDeliveryAt: now,
        },
      });
      return { session: created, pushNotificationId: pushNotification.id };
    });
    void this.notifications
      .deliverCallSafetyInvitation(result.pushNotificationId)
      .catch(() =>
        this.logger.warn(`Invitation push queued for later delivery: ${result.pushNotificationId}`),
      );
    return { sessionId: result.session.id, invitationToken: token, expiresAt };
  }

  async accept(userId: string, token: string) {
    return this.acceptInvitation(userId, await this.invitation(token, userId));
  }

  async acceptById(userId: string, invitationId: string) {
    return this.acceptInvitation(userId, await this.invitationById(invitationId, userId));
  }

  async decline(userId: string, token: string): Promise<{ sessionId: string }> {
    const invitation = await this.invitation(token, userId);
    await this.declineInvitation(userId, invitation);
    return { sessionId: invitation.sessionId };
  }

  async declineById(userId: string, invitationId: string): Promise<{ sessionId: string }> {
    const invitation = await this.invitationById(invitationId, userId);
    await this.declineInvitation(userId, invitation);
    return { sessionId: invitation.sessionId };
  }

  async grantConsent(userId: string, sessionId: string, input: GrantCallConsentDto) {
    const participant = await this.participant(sessionId, userId);
    const now = new Date();
    if (participant.session.expiresAt <= now) throw new ConflictException('Session expired');
    await this.prisma.callConsent.update({
      where: { participantId: participant.id },
      data: {
        status: CallConsentStatus.ACTIVE,
        precision: input.precision,
        shareBattery: input.shareBattery,
        shareSpeed: input.shareSpeed,
        grantedAt: now,
        revokedAt: null,
      },
    });
    const activeConsents = await this.prisma.callConsent.count({
      where: {
        participant: { is: { sessionId } },
        status: CallConsentStatus.ACTIVE,
        expiresAt: { gt: now },
        deletedAt: null,
      },
    });
    if (activeConsents === 2) {
      await this.prisma.callSafetySession.update({
        where: { id: sessionId },
        data: { status: CallSessionStatus.ACTIVE, startsAt: now },
      });
    }
    await this.prisma.callSessionEvent.create({
      data: {
        sessionId,
        actorId: userId,
        type: CallSessionEventType.CONSENT_GRANTED,
        occurredAt: now,
      },
    });
    return { sessionId, active: activeConsents === 2 };
  }

  async revokeConsent(userId: string, sessionId: string): Promise<void> {
    await this.participant(sessionId, userId);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.callConsent.updateMany({
        where: {
          participant: { is: { sessionId } },
          status: CallConsentStatus.ACTIVE,
          deletedAt: null,
        },
        data: { status: CallConsentStatus.REVOKED, revokedAt: now },
      }),
      this.prisma.callSafetySession.update({
        where: { id: sessionId },
        data: { status: CallSessionStatus.ENDED, endedAt: now },
      }),
      this.prisma.callSessionEvent.create({
        data: {
          sessionId,
          actorId: userId,
          type: CallSessionEventType.CONSENT_REVOKED,
          occurredAt: now,
        },
      }),
    ]);
  }

  async updateLocation(userId: string, sessionId: string, input: CallSafetyLocationDto) {
    const participant = await this.participant(sessionId, userId);
    const consent = participant.consent;
    const now = new Date();
    if (
      participant.session.status !== CallSessionStatus.ACTIVE ||
      participant.session.expiresAt <= now ||
      consent?.status !== CallConsentStatus.ACTIVE ||
      consent.expiresAt <= now
    ) {
      throw new ForbiddenException('Active consent is required');
    }
    const coordinates =
      consent.precision === 'APPROXIMATE'
        ? approximateCoordinates({ latitude: input.latitude, longitude: input.longitude }, userId)
        : { latitude: input.latitude, longitude: input.longitude };
    try {
      const saved = await this.prisma.callSessionLocation.create({
        data: {
          sessionId,
          userId,
          ...coordinates,
          accuracyM:
            consent.precision === 'APPROXIMATE' ? Math.max(input.accuracyM, 250) : input.accuracyM,
          headingDeg: input.headingDeg,
          speedMps: consent.shareSpeed ? input.speedMps : null,
          batteryPct: consent.shareBattery ? input.batteryPct : null,
          sequence: BigInt(input.sequence),
          recordedAt: new Date(input.recordedAt),
          purgeAt: new Date(now.getTime() + 24 * 60 * 60_000),
        },
        select: {
          userId: true,
          latitude: true,
          longitude: true,
          accuracyM: true,
          headingDeg: true,
          speedMps: true,
          batteryPct: true,
          sequence: true,
          recordedAt: true,
        },
      });
      return {
        ...saved,
        latitude: Number(saved.latitude),
        longitude: Number(saved.longitude),
        accuracyM: Number(saved.accuracyM),
        headingDeg: saved.headingDeg === null ? null : Number(saved.headingDeg),
        speedMps: saved.speedMps === null ? null : Number(saved.speedMps),
        sequence: Number(saved.sequence),
        recordedAt: saved.recordedAt.toISOString(),
      };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Location sequence already processed');
      }
      throw error;
    }
  }

  async list(userId: string) {
    await this.expireDueSessions();
    return this.prisma.callSafetySession.findMany({
      where: {
        deletedAt: null,
        participants: { some: { userId, deletedAt: null } },
      },
      include: {
        participants: {
          where: { deletedAt: null },
          include: { user: { include: { profile: true } }, consent: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async details(userId: string, sessionId: string) {
    await this.participant(sessionId, userId);
    const session = await this.prisma.callSafetySession.findUnique({
      where: { id: sessionId },
      include: {
        participants: {
          where: { deletedAt: null },
          include: { user: { include: { profile: true } }, consent: true },
        },
        locations: {
          where: { deletedAt: null },
          orderBy: { recordedAt: 'desc' },
          distinct: ['userId'],
        },
      },
    });
    return session
      ? {
          ...session,
          locations: session.locations.map((location) => ({
            ...location,
            latitude: Number(location.latitude),
            longitude: Number(location.longitude),
            accuracyM: Number(location.accuracyM),
            headingDeg: location.headingDeg === null ? null : Number(location.headingDeg),
            speedMps: location.speedMps === null ? null : Number(location.speedMps),
            sequence: Number(location.sequence),
          })),
        }
      : null;
  }

  async end(userId: string, sessionId: string): Promise<void> {
    await this.participant(sessionId, userId);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.callSafetySession.update({
        where: { id: sessionId },
        data: { status: CallSessionStatus.ENDED, endedAt: now },
      }),
      this.prisma.callConsent.updateMany({
        where: { participant: { is: { sessionId } }, status: CallConsentStatus.ACTIVE },
        data: { status: CallConsentStatus.REVOKED, revokedAt: now },
      }),
      this.prisma.callSessionEvent.create({
        data: {
          sessionId,
          actorId: userId,
          type: CallSessionEventType.SESSION_ENDED,
          occurredAt: now,
        },
      }),
    ]);
  }

  async purgeMyLocation(userId: string, sessionId: string): Promise<number> {
    const participant = await this.participant(sessionId, userId);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.callSessionLocation.deleteMany({
        where: { sessionId, userId },
      });
      if (participant.consent) {
        await tx.callConsent.updateMany({
          where: {
            participant: { is: { sessionId } },
            status: CallConsentStatus.ACTIVE,
            deletedAt: null,
          },
          data: { status: CallConsentStatus.REVOKED, revokedAt: now },
        });
      }
      if (participant.session.mutualRequired) {
        await tx.callSafetySession.update({
          where: { id: sessionId },
          data: { status: CallSessionStatus.ENDED, endedAt: now },
        });
      }
      await tx.callSessionEvent.createMany({
        data: [
          {
            sessionId,
            actorId: userId,
            type: CallSessionEventType.LOCATION_STOPPED,
            occurredAt: now,
            metadata: { purge: 'IMMEDIATE', deletedCount: deleted.count },
          },
          {
            sessionId,
            actorId: userId,
            type: CallSessionEventType.CONSENT_REVOKED,
            occurredAt: now,
          },
        ],
      });
      return deleted.count;
    });
  }

  async escalateSos(principal: AuthPrincipal, sessionId: string, input: CallSafetySosDto) {
    const participant = await this.participant(sessionId, principal.userId);
    if (
      participant.session.status !== CallSessionStatus.ACTIVE ||
      participant.session.expiresAt <= new Date()
    ) {
      throw new ForbiddenException('SOS escalation requires an active session');
    }
    const alert = await this.emergency.trigger(principal, input);
    await this.prisma.auditLog.create({
      data: {
        actorId: principal.userId,
        action: 'CALL_SAFETY_SOS_TRIGGERED',
        entityType: 'CallSafetySession',
        entityId: sessionId,
        severity: 'CRITICAL',
        outcome: 'SUCCESS',
        metadata: {
          sosAlertId: typeof alert.id === 'string' ? alert.id : null,
        },
      },
    });
    return alert;
  }

  async expireDueSessions(): Promise<number> {
    const now = new Date();
    const sessions = await this.prisma.callSafetySession.findMany({
      where: {
        status: { in: [CallSessionStatus.PENDING, CallSessionStatus.ACTIVE] },
        expiresAt: { lte: now },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (sessions.length === 0) return 0;
    const ids = sessions.map((session) => session.id);
    await this.prisma.$transaction([
      this.prisma.callSafetySession.updateMany({
        where: { id: { in: ids } },
        data: { status: CallSessionStatus.EXPIRED, endedAt: now },
      }),
      this.prisma.callConsent.updateMany({
        where: { participant: { is: { sessionId: { in: ids } } } },
        data: { status: CallConsentStatus.EXPIRED },
      }),
      this.prisma.callSessionEvent.createMany({
        data: ids.map((sessionId) => ({
          sessionId,
          type: CallSessionEventType.SESSION_EXPIRED,
          occurredAt: now,
        })),
      }),
    ]);
    return ids.length;
  }

  async participantIds(sessionId: string, userId: string): Promise<string[]> {
    await this.participant(sessionId, userId);
    const participants = await this.prisma.callParticipant.findMany({
      where: { sessionId, deletedAt: null },
      select: { userId: true },
    });
    return participants.map((participant) => participant.userId);
  }

  async purgeExpiredLocations(): Promise<number> {
    const result = await this.prisma.callSessionLocation.deleteMany({
      where: { purgeAt: { lte: new Date() } },
    });
    return result.count;
  }

  private async acceptInvitation(userId: string, invitation: { id: string; sessionId: string }) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const accepted = await tx.callInvitation.updateMany({
        where: {
          id: invitation.id,
          invitedUserId: userId,
          status: CallInvitationStatus.PENDING,
          expiresAt: { gt: now },
          deletedAt: null,
        },
        data: { status: CallInvitationStatus.ACCEPTED, acceptedAt: now },
      });
      if (accepted.count !== 1) throw new ConflictException('Invitation is no longer pending');
      await tx.callParticipant.updateMany({
        where: { sessionId: invitation.sessionId, userId, deletedAt: null },
        data: { joinedAt: now },
      });
      await tx.callSessionEvent.create({
        data: {
          sessionId: invitation.sessionId,
          actorId: userId,
          type: CallSessionEventType.ACCEPTED,
          occurredAt: now,
        },
      });
      await this.completeInvitationNotifications(tx, userId, invitation.id, now, 'ACCEPTED');
      return { sessionId: invitation.sessionId, accepted: true };
    });
  }

  private async declineInvitation(
    userId: string,
    invitation: { id: string; sessionId: string },
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const declined = await tx.callInvitation.updateMany({
        where: {
          id: invitation.id,
          invitedUserId: userId,
          status: CallInvitationStatus.PENDING,
          expiresAt: { gt: now },
          deletedAt: null,
        },
        data: { status: CallInvitationStatus.DECLINED, declinedAt: now },
      });
      if (declined.count !== 1) throw new ConflictException('Invitation is no longer pending');
      await tx.callSafetySession.update({
        where: { id: invitation.sessionId },
        data: { status: CallSessionStatus.CANCELLED, endedAt: now },
      });
      await tx.callConsent.updateMany({
        where: {
          participant: { is: { sessionId: invitation.sessionId } },
          status: CallConsentStatus.ACTIVE,
          deletedAt: null,
        },
        data: { status: CallConsentStatus.REVOKED, revokedAt: now },
      });
      await tx.callSessionEvent.create({
        data: {
          sessionId: invitation.sessionId,
          actorId: userId,
          type: CallSessionEventType.DECLINED,
          occurredAt: now,
        },
      });
      await this.completeInvitationNotifications(tx, userId, invitation.id, now, 'DECLINED');
    });
  }

  private async completeInvitationNotifications(
    tx: Prisma.TransactionClient,
    userId: string,
    invitationId: string,
    now: Date,
    outcome: 'ACCEPTED' | 'DECLINED',
  ): Promise<void> {
    await tx.notification.updateMany({
      where: {
        userId,
        entityType: 'CallInvitation',
        entityId: invitationId,
        deletedAt: null,
      },
      data: { readAt: now },
    });
    await tx.notification.updateMany({
      where: {
        userId,
        entityType: 'CallInvitation',
        entityId: invitationId,
        channel: NotificationChannel.PUSH,
        deliveredAt: null,
        deletedAt: null,
      },
      data: {
        deliveredAt: now,
        deliveryClaimedAt: null,
        nextDeliveryAt: null,
        deliveryError: `INVITATION_${outcome}`,
      },
    });
  }

  private async participant(sessionId: string, userId: string) {
    const participant = await this.prisma.callParticipant.findFirst({
      where: {
        sessionId,
        userId,
        deletedAt: null,
        session: { deletedAt: null },
      },
      include: { session: true, consent: true },
    });
    if (!participant) throw new ForbiddenException('Session access denied');
    return participant;
  }

  private async invitationById(invitationId: string, userId: string) {
    const invitation = await this.prisma.callInvitation.findFirst({
      where: {
        id: invitationId,
        invitedUserId: userId,
        status: CallInvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
        deletedAt: null,
      },
      select: { id: true, sessionId: true },
    });
    if (!invitation) throw new NotFoundException('Invitation is invalid or expired');
    return invitation;
  }

  private async invitation(token: string, userId: string) {
    const invitation = await this.prisma.callInvitation.findFirst({
      where: {
        invitedUserId: userId,
        tokenHash: this.hashToken(token),
        status: CallInvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
        deletedAt: null,
      },
    });
    if (!invitation) throw new NotFoundException('Invitation is invalid or expired');
    return invitation;
  }

  private hashToken(token: string): string {
    return createHash('sha256')
      .update(`${this.config.get('REFRESH_TOKEN_PEPPER', { infer: true })}:${token}`)
      .digest('hex');
  }
}
