import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../common/audit.service';
import { haversineDistanceM } from '../../common/utils/geo.util';
import { PrismaService } from '../../database/prisma.service';
import {
  GeofenceEventType,
  LocationPrecision,
  LocationShareStatus,
  NotificationType,
} from '../../generated/prisma/client';
import type { LocationUpdateDto } from '../locations/locations.dto';
import type { CreateGeofenceDto, UpdateGeofenceDto } from './geofences.dto';

@Injectable()
export class GeofencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(ownerId: string, input: CreateGeofenceDto): Promise<Record<string, unknown>> {
    if (input.subjectUserId !== ownerId) {
      const consent = await this.prisma.locationShare.findFirst({
        where: {
          ownerId: input.subjectUserId,
          recipientId: ownerId,
          status: LocationShareStatus.ACTIVE,
          precision: LocationPrecision.PRECISE,
          allowGeofences: true,
          startsAt: { lte: new Date() },
          expiresAt: { gt: new Date() },
          deletedAt: null,
        },
      });
      if (!consent) {
        throw new ForbiddenException('This person has not allowed geofence alerts for this share');
      }
    }
    const geofence = await this.prisma.geofence.create({
      data: {
        ownerId,
        subjectUserId: input.subjectUserId,
        type: input.type,
        name: input.name.trim(),
        latitude: input.latitude,
        longitude: input.longitude,
        radiusM: input.radiusM,
        notifyOnArrival: input.notifyOnArrival,
        notifyOnDeparture: input.notifyOnDeparture,
      },
    });
    await this.audit.record({
      actorId: ownerId,
      action: 'GEOFENCE_CREATED',
      entityType: 'Geofence',
      entityId: geofence.id,
      metadata: { subjectIsSelf: input.subjectUserId === ownerId, radiusM: input.radiusM },
    });
    return geofence;
  }

  async list(ownerId: string): Promise<Array<Record<string, unknown>>> {
    return this.prisma.geofence.findMany({
      where: { ownerId, deletedAt: null },
      include: { subjectUser: { include: { profile: true } }, state: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(ownerId: string, geofenceId: string, input: UpdateGeofenceDto): Promise<Record<string, unknown>> {
    const geofence = await this.prisma.geofence.findFirst({
      where: { id: geofenceId, ownerId, deletedAt: null },
    });
    if (!geofence) throw new NotFoundException('Geofence not found');
    return this.prisma.geofence.update({
      where: { id: geofence.id },
      data: { ...input, name: input.name?.trim() },
    });
  }

  async remove(ownerId: string, geofenceId: string): Promise<void> {
    const result = await this.prisma.geofence.updateMany({
      where: { id: geofenceId, ownerId, deletedAt: null },
      data: { isEnabled: false, deletedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Geofence not found');
    await this.audit.record({
      actorId: ownerId,
      action: 'GEOFENCE_REMOVED',
      entityType: 'Geofence',
      entityId: geofenceId,
    });
  }

  async evaluate(subjectUserId: string, location: LocationUpdateDto): Promise<void> {
    const geofences = await this.prisma.geofence.findMany({
      where: { subjectUserId, isEnabled: true, deletedAt: null },
    });
    if (geofences.length === 0) return;

    const permittedShares = await this.prisma.locationShare.findMany({
      where: {
        ownerId: subjectUserId,
        recipientId: { in: geofences.map((geofence) => geofence.ownerId) },
        status: LocationShareStatus.ACTIVE,
        precision: LocationPrecision.PRECISE,
        allowGeofences: true,
        expiresAt: { gt: new Date() },
        deletedAt: null,
      },
      select: { recipientId: true },
    });
    const permittedOwners = new Set(permittedShares.map((share) => share.recipientId));
    permittedOwners.add(subjectUserId);

    for (const geofence of geofences) {
      if (!permittedOwners.has(geofence.ownerId)) continue;
      const distance = haversineDistanceM(
        { latitude: location.latitude, longitude: location.longitude },
        { latitude: Number(geofence.latitude), longitude: Number(geofence.longitude) },
      );
      const isInside = distance <= geofence.radiusM;
      const existing = await this.prisma.geofenceState.findUnique({
        where: { geofenceId: geofence.id },
      });
      await this.prisma.geofenceState.upsert({
        where: { geofenceId: geofence.id },
        create: { geofenceId: geofence.id, isInside, evaluatedAt: new Date() },
        update: { isInside, evaluatedAt: new Date(), deletedAt: null },
      });
      if (!existing || existing.isInside === isInside) continue;

      const type = isInside ? GeofenceEventType.ARRIVAL : GeofenceEventType.DEPARTURE;
      const shouldNotify = isInside ? geofence.notifyOnArrival : geofence.notifyOnDeparture;
      await this.prisma.geofenceEvent.create({
        data: {
          geofenceId: geofence.id,
          type,
          latitude: location.latitude,
          longitude: location.longitude,
          occurredAt: new Date(location.recordedAt),
        },
      });
      if (shouldNotify) {
        await this.prisma.notification.create({
          data: {
            userId: geofence.ownerId,
            actorId: subjectUserId,
            type: isInside ? NotificationType.ARRIVAL : NotificationType.DEPARTURE,
            title: isInside ? `Arrival at ${geofence.name}` : `Departure from ${geofence.name}`,
            body: isInside ? 'Your trusted contact has arrived.' : 'Your trusted contact has left.',
            data: { geofenceId: geofence.id, eventType: type },
          },
        });
      }
    }
  }
}
