import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit.service';
import { PrismaService } from '../../database/prisma.service';
import {
  FriendshipStatus,
  LocationShareStatus,
  NotificationType,
  UserStatus,
} from '../../generated/prisma/client';
import type { BlockUserDto, SendFriendRequestDto } from './friends.dto';

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string): Promise<Record<string, unknown>> {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: userId }, { addresseeId: userId }],
        status: { in: [FriendshipStatus.PENDING, FriendshipStatus.ACCEPTED] },
        deletedAt: null,
      },
      include: {
        requester: { include: { profile: true } },
        addressee: { include: { profile: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const mapped = friendships.map((friendship) => {
      const other = friendship.requesterId === userId ? friendship.addressee : friendship.requester;
      const profile = other.profile;
      return {
        id: friendship.id,
        status: friendship.status,
        direction: friendship.requesterId === userId ? 'OUTGOING' : 'INCOMING',
        friend: {
          id: other.id,
          displayName: profile?.displayName ?? 'Atlas member',
          handle: profile?.handle ?? null,
          avatarUrl: profile?.avatarUrl ?? null,
          lastSeenAt: profile?.showOnlineStatus ? (other.lastSeenAt?.toISOString() ?? null) : null,
          isOnline: Boolean(
            profile?.showOnlineStatus &&
            other.lastSeenAt &&
            Date.now() - other.lastSeenAt.getTime() < 60_000,
          ),
        },
        createdAt: friendship.createdAt.toISOString(),
      };
    });
    return {
      friends: mapped.filter((item) => item.status === FriendshipStatus.ACCEPTED),
      incoming: mapped.filter(
        (item) => item.status === FriendshipStatus.PENDING && item.direction === 'INCOMING',
      ),
      outgoing: mapped.filter(
        (item) => item.status === FriendshipStatus.PENDING && item.direction === 'OUTGOING',
      ),
    };
  }

  async sendRequest(userId: string, input: SendFriendRequestDto): Promise<Record<string, unknown>> {
    if (userId === input.userId) throw new BadRequestException('You cannot add yourself');
    const [target, blocked] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: input.userId, status: UserStatus.ACTIVE, deletedAt: null },
        include: { profile: true },
      }),
      this.prisma.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: userId, blockedUserId: input.userId },
            { blockerId: input.userId, blockedUserId: userId },
          ],
          deletedAt: null,
        },
      }),
    ]);
    if (!target?.profile) throw new NotFoundException('User not found');
    if (blocked) throw new ForbiddenException('This connection is unavailable');

    const pairKey = this.pairKey(userId, input.userId);
    const friendship = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.friendship.findUnique({ where: { pairKey } });
      if (existing?.status === FriendshipStatus.ACCEPTED && !existing.deletedAt) {
        throw new ConflictException('You are already friends');
      }
      if (existing?.status === FriendshipStatus.PENDING && !existing.deletedAt) {
        if (existing.addresseeId === userId) {
          return transaction.friendship.update({
            where: { id: existing.id },
            data: { status: FriendshipStatus.ACCEPTED, respondedAt: new Date() },
          });
        }
        throw new ConflictException('Friend request already sent');
      }

      const next = existing
        ? await transaction.friendship.update({
            where: { id: existing.id },
            data: {
              requesterId: userId,
              addresseeId: input.userId,
              status: FriendshipStatus.PENDING,
              respondedAt: null,
              deletedAt: null,
            },
          })
        : await transaction.friendship.create({
            data: { requesterId: userId, addresseeId: input.userId, pairKey },
          });
      await transaction.notification.create({
        data: {
          userId: input.userId,
          actorId: userId,
          type: NotificationType.FRIEND_REQUEST,
          title: 'New friend request',
          body: 'Someone wants to connect with you on Atlas AI.',
          data: { friendshipId: next.id },
        },
      });
      return next;
    });

    await this.audit.record({
      actorId: userId,
      action:
        friendship.status === FriendshipStatus.ACCEPTED
          ? 'FRIEND_AUTO_ACCEPTED'
          : 'FRIEND_REQUEST_SENT',
      entityType: 'Friendship',
      entityId: friendship.id,
    });
    return friendship;
  }

  async respond(
    userId: string,
    friendshipId: string,
    accept: boolean,
  ): Promise<Record<string, unknown>> {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        id: friendshipId,
        addresseeId: userId,
        status: FriendshipStatus.PENDING,
        deletedAt: null,
      },
    });
    if (!friendship) throw new NotFoundException('Pending request not found');

    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.friendship.update({
        where: { id: friendship.id },
        data: {
          status: accept ? FriendshipStatus.ACCEPTED : FriendshipStatus.DECLINED,
          respondedAt: new Date(),
        },
      });
      if (accept) {
        await transaction.notification.create({
          data: {
            userId: friendship.requesterId,
            actorId: userId,
            type: NotificationType.FRIEND_ACCEPTED,
            title: 'Friend request accepted',
            body: 'You can now choose to share your location with each other.',
            data: { friendshipId: friendship.id },
          },
        });
      }
      return result;
    });
    await this.audit.record({
      actorId: userId,
      action: accept ? 'FRIEND_REQUEST_ACCEPTED' : 'FRIEND_REQUEST_DECLINED',
      entityType: 'Friendship',
      entityId: friendship.id,
    });
    return updated;
  }

  async remove(userId: string, friendshipId: string): Promise<void> {
    const result = await this.prisma.friendship.updateMany({
      where: {
        id: friendshipId,
        status: FriendshipStatus.ACCEPTED,
        deletedAt: null,
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Friendship not found');
    await this.audit.record({
      actorId: userId,
      action: 'FRIEND_REMOVED',
      entityType: 'Friendship',
      entityId: friendshipId,
    });
  }

  async block(userId: string, input: BlockUserDto): Promise<void> {
    if (userId === input.userId) throw new BadRequestException('You cannot block yourself');
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.userBlock.upsert({
        where: { blockerId_blockedUserId: { blockerId: userId, blockedUserId: input.userId } },
        create: { blockerId: userId, blockedUserId: input.userId, reason: input.reason },
        update: { reason: input.reason, deletedAt: null },
      });
      await transaction.friendship.updateMany({
        where: {
          OR: [
            { requesterId: userId, addresseeId: input.userId },
            { requesterId: input.userId, addresseeId: userId },
          ],
          deletedAt: null,
        },
        data: { deletedAt: now },
      });
      await transaction.locationShare.updateMany({
        where: {
          OR: [
            { ownerId: userId, recipientId: input.userId },
            { ownerId: input.userId, recipientId: userId },
          ],
          status: { in: [LocationShareStatus.ACTIVE, LocationShareStatus.PAUSED] },
        },
        data: { status: LocationShareStatus.REVOKED, endedAt: now, revokedById: userId },
      });
    });
    await this.audit.record({
      actorId: userId,
      action: 'USER_BLOCKED',
      entityType: 'User',
      entityId: input.userId,
      severity: 'WARNING',
    });
  }

  async unblock(userId: string, blockedUserId: string): Promise<void> {
    const result = await this.prisma.userBlock.updateMany({
      where: { blockerId: userId, blockedUserId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Block not found');
    await this.audit.record({
      actorId: userId,
      action: 'USER_UNBLOCKED',
      entityType: 'User',
      entityId: blockedUserId,
    });
  }

  private pairKey(first: string, second: string): string {
    return [first, second].sort().join(':');
  }
}
