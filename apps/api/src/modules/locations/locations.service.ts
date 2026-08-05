import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { LocationUpdate } from '@atlas/contracts';
import { AuditService } from '../../common/audit.service';
import { approximateCoordinates } from '../../common/utils/geo.util';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import {
  FriendshipStatus,
  LocationPrecision,
  LocationShareStatus,
  NotificationType,
  type LiveLocation,
  type LocationShare,
} from '../../generated/prisma/client';
import type { AuthPrincipal } from '../auth/auth.types';
import { GeofencesService } from '../geofences/geofences.service';
import { TripsService } from '../trips/trips.service';
import type { LocationUpdateDto, StartLocationShareDto } from './locations.dto';
import { assertShareDuration } from './sharing-policy';

export interface LocationBroadcast {
  events: Array<{
    recipientId: string;
    payload: {
      userId: string;
      shareVersion: number;
      location: LocationUpdate;
    };
  }>;
}

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly trips: TripsService,
    private readonly geofences: GeofencesService,
  ) {}

  async startShares(userId: string, input: StartLocationShareDto): Promise<LocationShare[]> {
    assertShareDuration(input.durationMinutes);
    const recipientIds = [...new Set(input.recipientIds)].filter((id) => id !== userId);
    if (recipientIds.length !== input.recipientIds.length) {
      throw new BadRequestException('Recipients must be unique and cannot include yourself');
    }

    const relationships = await this.prisma.friendship.findMany({
      where: {
        status: FriendshipStatus.ACCEPTED,
        deletedAt: null,
        OR: [
          { requesterId: userId, addresseeId: { in: recipientIds } },
          { addresseeId: userId, requesterId: { in: recipientIds } },
        ],
      },
    });
    const authorized = new Set(
      relationships.map((friendship) =>
        friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId,
      ),
    );
    if (recipientIds.some((id) => !authorized.has(id))) {
      throw new ForbiddenException('Location can only be shared with accepted friends');
    }
    const blocked = await this.prisma.userBlock.count({
      where: {
        deletedAt: null,
        OR: [
          { blockerId: userId, blockedUserId: { in: recipientIds } },
          { blockedUserId: userId, blockerId: { in: recipientIds } },
        ],
      },
    });
    if (blocked > 0) throw new ForbiddenException('One or more recipients are unavailable');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + input.durationMinutes * 60_000);
    const shares = await this.prisma.$transaction(async (transaction) => {
      await transaction.locationShare.updateMany({
        where: {
          ownerId: userId,
          recipientId: { in: recipientIds },
          status: { in: [LocationShareStatus.ACTIVE, LocationShareStatus.PAUSED] },
          deletedAt: null,
        },
        data: { status: LocationShareStatus.REVOKED, endedAt: now, revokedById: userId },
      });
      const created = await Promise.all(
        recipientIds.map((recipientId) =>
          transaction.locationShare.create({
            data: {
              ownerId: userId,
              recipientId,
              status: LocationShareStatus.ACTIVE,
              precision: input.precision,
              shareBattery: input.shareBattery,
              shareSpeed: input.shareSpeed,
              allowGeofences: input.allowGeofences,
              startsAt: now,
              expiresAt,
            },
          }),
        ),
      );
      await transaction.notification.createMany({
        data: recipientIds.map((recipientId) => ({
          userId: recipientId,
          actorId: userId,
          type: NotificationType.SHARE_STARTED,
          title: 'Location shared with you',
          body: `Live location is available until ${expiresAt.toISOString()}.`,
          data: { ownerId: userId },
        })),
      });
      return created;
    });
    await this.audit.record({
      actorId: userId,
      action: 'LOCATION_SHARING_STARTED',
      entityType: 'LocationShare',
      metadata: {
        recipientCount: recipientIds.length,
        precision: input.precision,
        expiresAt: expiresAt.toISOString(),
      },
    });
    return shares;
  }

  async revokeShare(
    userId: string,
    shareId: string,
  ): Promise<{ id: string; ownerId: string; recipientId: string }> {
    const share = await this.prisma.locationShare.findFirst({
      where: {
        id: shareId,
        deletedAt: null,
        status: { in: [LocationShareStatus.ACTIVE, LocationShareStatus.PAUSED] },
        OR: [{ ownerId: userId }, { recipientId: userId }],
      },
    });
    if (!share) throw new NotFoundException('Active share not found');
    await this.prisma.locationShare.update({
      where: { id: share.id },
      data: {
        status: LocationShareStatus.REVOKED,
        revokedById: userId,
        endedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await this.audit.record({
      actorId: userId,
      action: 'LOCATION_SHARING_REVOKED',
      entityType: 'LocationShare',
      entityId: share.id,
    });
    return { id: share.id, ownerId: share.ownerId, recipientId: share.recipientId };
  }

  async revokeAllOwned(userId: string): Promise<number> {
    const result = await this.prisma.locationShare.updateMany({
      where: {
        ownerId: userId,
        status: { in: [LocationShareStatus.ACTIVE, LocationShareStatus.PAUSED] },
        deletedAt: null,
      },
      data: {
        status: LocationShareStatus.REVOKED,
        revokedById: userId,
        endedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (result.count > 0) {
      await this.audit.record({
        actorId: userId,
        action: 'ALL_LOCATION_SHARING_STOPPED',
        entityType: 'LocationShare',
        metadata: { shareCount: result.count },
      });
    }
    return result.count;
  }

  async listShares(userId: string): Promise<Record<string, unknown>> {
    await this.expireShares();
    const shares = await this.prisma.locationShare.findMany({
      where: {
        deletedAt: null,
        status: { in: [LocationShareStatus.ACTIVE, LocationShareStatus.PAUSED] },
        expiresAt: { gt: new Date() },
        OR: [{ ownerId: userId }, { recipientId: userId }],
      },
      include: {
        owner: { include: { profile: true } },
        recipient: { include: { profile: true } },
      },
      orderBy: { expiresAt: 'asc' },
    });
    const serializeParty = (user: (typeof shares)[number]['owner']): Record<string, unknown> => ({
      id: user.id,
      displayName: user.profile?.displayName ?? 'Atlas member',
      handle: user.profile?.handle ?? null,
      avatarUrl: user.profile?.avatarUrl ?? null,
    });
    return {
      outbound: shares
        .filter((share) => share.ownerId === userId)
        .map((share) => ({
          ...share,
          owner: undefined,
          recipient: serializeParty(share.recipient),
        })),
      inbound: shares
        .filter((share) => share.recipientId === userId)
        .map((share) => ({ ...share, recipient: undefined, owner: serializeParty(share.owner) })),
    };
  }

  async livePeople(userId: string): Promise<Array<Record<string, unknown>>> {
    await this.expireShares();
    const shares = await this.prisma.locationShare.findMany({
      where: {
        recipientId: userId,
        status: LocationShareStatus.ACTIVE,
        startsAt: { lte: new Date() },
        expiresAt: { gt: new Date() },
        deletedAt: null,
      },
      include: { owner: { include: { profile: true, liveLocation: true } } },
    });

    let presence: Array<[Error | null, unknown]> = [];
    try {
      await this.redis.connect();
      const pipeline = this.redis.client.pipeline();
      shares.forEach((share) => pipeline.exists(`presence:${share.ownerId}`));
      presence = (await pipeline.exec()) ?? [];
    } catch {
      presence = [];
    }

    return shares.map((share, index) => {
      const location = share.owner.liveLocation;
      const isStale = !location || Date.now() - location.recordedAt.getTime() > 120_000;
      return {
        user: {
          id: share.owner.id,
          displayName: share.owner.profile?.displayName ?? 'Atlas member',
          handle: share.owner.profile?.handle ?? null,
          avatarUrl: share.owner.profile?.avatarUrl ?? null,
          lastSeenAt: share.owner.lastSeenAt?.toISOString() ?? null,
          isOnline: presence[index]?.[1] === 1,
        },
        shareId: share.id,
        location: location ? this.serializeLocation(location, share) : null,
        precision: share.precision,
        expiresAt: share.expiresAt.toISOString(),
        isStale,
      };
    });
  }

  async ingest(
    principal: AuthPrincipal,
    input: LocationUpdateDto,
  ): Promise<LocationBroadcast | null> {
    const recordedAt = new Date(input.recordedAt);
    const age = Date.now() - recordedAt.getTime();
    if (age < -300_000 || age > 600_000) {
      throw new BadRequestException('Live location timestamp is outside the accepted window');
    }
    const activeShares = await this.prisma.locationShare.findMany({
      where: {
        ownerId: principal.userId,
        status: LocationShareStatus.ACTIVE,
        startsAt: { lte: new Date() },
        expiresAt: { gt: new Date() },
        deletedAt: null,
      },
    });
    if (activeShares.length === 0) {
      throw new ForbiddenException('Start location sharing before sending live updates');
    }

    const sequence = BigInt(input.sequence);
    const data = {
      sourceDeviceId: principal.deviceId,
      latitude: input.latitude,
      longitude: input.longitude,
      altitudeM: input.altitudeM,
      accuracyM: input.accuracyM,
      headingDeg: input.headingDeg,
      speedMps: input.speedMps,
      batteryPct: input.batteryPct,
      isCharging: input.isCharging,
      isMocked: input.isMocked,
      sequence,
      recordedAt,
      deletedAt: null,
    };
    let accepted = await this.prisma.liveLocation.updateMany({
      where: { userId: principal.userId, sequence: { lt: sequence } },
      data,
    });
    if (accepted.count === 0) {
      const current = await this.prisma.liveLocation.findUnique({
        where: { userId: principal.userId },
      });
      if (current && current.sequence >= sequence) return null;
      try {
        await this.prisma.liveLocation.create({ data: { userId: principal.userId, ...data } });
        accepted = { count: 1 };
      } catch (error) {
        if (!this.isUniqueViolation(error)) throw error;
        accepted = await this.prisma.liveLocation.updateMany({
          where: { userId: principal.userId, sequence: { lt: sequence } },
          data,
        });
      }
    }
    if (accepted.count === 0) return null;

    if (input.isMocked) {
      await this.audit.record({
        actorId: principal.userId,
        action: 'MOCK_LOCATION_REPORTED',
        entityType: 'Device',
        entityId: principal.deviceId,
        severity: 'WARNING',
      });
    }
    await Promise.all([
      this.prisma.user.update({
        where: { id: principal.userId },
        data: { lastSeenAt: new Date() },
      }),
      this.trips.appendLivePoint(principal.userId, principal.deviceId, input),
      this.geofences.evaluate(principal.userId, input),
    ]);

    return {
      events: activeShares.map((share) => {
        const original = { latitude: input.latitude, longitude: input.longitude };
        const coordinates =
          share.precision === LocationPrecision.APPROXIMATE
            ? approximateCoordinates(original, principal.userId)
            : original;
        return {
          recipientId: share.recipientId,
          payload: {
            userId: principal.userId,
            shareVersion: share.version,
            location: {
              ...coordinates,
              accuracyM:
                share.precision === LocationPrecision.APPROXIMATE
                  ? Math.max(input.accuracyM, 250)
                  : input.accuracyM,
              altitudeM: input.altitudeM,
              headingDeg: input.headingDeg,
              speedMps: share.shareSpeed ? input.speedMps : null,
              batteryPct: share.shareBattery ? input.batteryPct : null,
              isCharging: share.shareBattery ? input.isCharging : null,
              recordedAt: recordedAt.toISOString(),
              sequence: input.sequence,
              isMocked: input.isMocked,
            },
          },
        };
      }),
    };
  }

  async activeRecipients(userId: string): Promise<string[]> {
    const shares = await this.prisma.locationShare.findMany({
      where: {
        ownerId: userId,
        status: LocationShareStatus.ACTIVE,
        expiresAt: { gt: new Date() },
        deletedAt: null,
      },
      select: { recipientId: true },
    });
    return shares.map((share) => share.recipientId);
  }

  private serializeLocation(location: LiveLocation, share: LocationShare): LocationUpdate {
    const original = { latitude: Number(location.latitude), longitude: Number(location.longitude) };
    const coordinates =
      share.precision === LocationPrecision.APPROXIMATE
        ? approximateCoordinates(original, share.ownerId)
        : original;
    return {
      ...coordinates,
      accuracyM:
        share.precision === LocationPrecision.APPROXIMATE
          ? Math.max(Number(location.accuracyM), 250)
          : Number(location.accuracyM),
      altitudeM: location.altitudeM === null ? null : Number(location.altitudeM),
      headingDeg: location.headingDeg === null ? null : Number(location.headingDeg),
      speedMps: share.shareSpeed && location.speedMps !== null ? Number(location.speedMps) : null,
      batteryPct: share.shareBattery ? location.batteryPct : null,
      isCharging: share.shareBattery ? location.isCharging : null,
      recordedAt: location.recordedAt.toISOString(),
      sequence: Number(location.sequence),
      isMocked: location.isMocked,
    };
  }

  private async expireShares(): Promise<void> {
    await this.prisma.locationShare.updateMany({
      where: {
        status: LocationShareStatus.ACTIVE,
        expiresAt: { lte: new Date() },
        deletedAt: null,
      },
      data: { status: LocationShareStatus.EXPIRED, endedAt: new Date(), version: { increment: 1 } },
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
