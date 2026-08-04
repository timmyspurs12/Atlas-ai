import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { LocationShareStatus, SessionStatus, UserStatus } from '../../generated/prisma/client';
import type { AuthPrincipal } from '../auth/auth.types';
import type { SearchUsersDto, UpdateProfileDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async me(userId: string): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { profile: true, subscriptions: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!user?.profile) throw new NotFoundException('Profile not found');
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      emailVerified: Boolean(user.emailVerifiedAt),
      phoneVerified: Boolean(user.phoneVerifiedAt),
      profile: user.profile,
      subscription: user.subscriptions[0] ?? null,
      createdAt: user.createdAt,
    };
  }

  async updateProfile(userId: string, input: UpdateProfileDto): Promise<Record<string, unknown>> {
    try {
      const profile = await this.prisma.profile.update({
        where: { userId },
        data: {
          ...input,
          displayName: input.displayName?.trim(),
          handle: input.handle?.toLowerCase(),
        },
      });
      await this.audit.record({
        actorId: userId,
        action: 'PROFILE_UPDATED',
        entityType: 'Profile',
        entityId: profile.id,
      });
      return profile;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('That handle is already taken');
      }
      throw error;
    }
  }

  async search(userId: string, input: SearchUsersDto): Promise<Array<Record<string, unknown>>> {
    const query = input.q.trim().replace(/^@/, '');
    const profiles = await this.prisma.profile.findMany({
      where: {
        deletedAt: null,
        isDiscoverable: true,
        userId: { not: userId },
        OR: [
          { handle: { contains: query, mode: 'insensitive' } },
          { displayName: { contains: query, mode: 'insensitive' } },
        ],
        user: {
          status: UserStatus.ACTIVE,
          deletedAt: null,
          blocksInitiated: { none: { blockedUserId: userId, deletedAt: null } },
          blocksReceived: { none: { blockerId: userId, deletedAt: null } },
        },
      },
      include: { user: { select: { lastSeenAt: true } } },
      take: 20,
      orderBy: [{ handle: 'asc' }, { displayName: 'asc' }],
    });
    return profiles.map((profile) => ({
      id: profile.userId,
      displayName: profile.displayName,
      handle: profile.handle,
      avatarUrl: profile.avatarUrl,
      lastSeenAt: profile.showOnlineStatus ? profile.user.lastSeenAt : null,
      isOnline: false,
    }));
  }

  async exportData(userId: string): Promise<Record<string, unknown>> {
    const [user, friendships, shares, trips, messages, geofences, notifications, auditLogs] =
      await this.prisma.$transaction([
        this.prisma.user.findUnique({ where: { id: userId }, include: { profile: true, devices: true, subscriptions: true } }),
        this.prisma.friendship.findMany({ where: { OR: [{ requesterId: userId }, { addresseeId: userId }] } }),
        this.prisma.locationShare.findMany({ where: { OR: [{ ownerId: userId }, { recipientId: userId }] } }),
        this.prisma.trip.findMany({ where: { userId }, include: { points: true } }),
        this.prisma.message.findMany({ where: { senderId: userId }, select: { id: true, conversationId: true, type: true, sentAt: true, editedAt: true, createdAt: true } }),
        this.prisma.geofence.findMany({ where: { ownerId: userId } }),
        this.prisma.notification.findMany({ where: { userId } }),
        this.prisma.auditLog.findMany({ where: { actorId: userId } }),
      ]);
    await this.audit.record({ actorId: userId, action: 'DATA_EXPORTED', entityType: 'User', entityId: userId });
    return {
      format: 'atlas-portability-v1',
      exportedAt: new Date().toISOString(),
      user,
      friendships,
      locationShares: shares,
      trips,
      sentMessageMetadata: messages,
      geofences,
      notifications,
      auditLogs,
    };
  }

  async scheduleDeletion(principal: AuthPrincipal): Promise<void> {
    const deletionDate = new Date(Date.now() + 30 * 86_400_000);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: principal.userId },
        data: { status: UserStatus.PENDING_DELETION, deletionScheduledAt: deletionDate },
      }),
      this.prisma.session.updateMany({
        where: { userId: principal.userId, status: SessionStatus.ACTIVE },
        data: { status: SessionStatus.REVOKED, revokedAt: new Date(), revokeReason: 'ACCOUNT_DELETION' },
      }),
      this.prisma.locationShare.updateMany({
        where: {
          OR: [{ ownerId: principal.userId }, { recipientId: principal.userId }],
          status: { in: [LocationShareStatus.ACTIVE, LocationShareStatus.PAUSED] },
        },
        data: { status: LocationShareStatus.REVOKED, endedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      actorId: principal.userId,
      action: 'ACCOUNT_DELETION_SCHEDULED',
      entityType: 'User',
      entityId: principal.userId,
      severity: 'WARNING',
    });
  }
}
