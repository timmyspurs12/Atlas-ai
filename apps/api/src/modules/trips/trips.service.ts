import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { haversineDistanceM } from '../../common/utils/geo.util';
import { PrismaService } from '../../database/prisma.service';
import { TripSource, TripStatus } from '../../generated/prisma/client';
import type { LocationUpdateDto } from '../locations/locations.dto';
import { TripPeriodDto, type StartTripDto, type TripsQueryDto } from './trips.dto';

@Injectable()
export class TripsService {
  constructor(private readonly prisma: PrismaService) {}

  async start(userId: string, input: StartTripDto): Promise<Record<string, unknown>> {
    const active = await this.prisma.trip.findFirst({
      where: { userId, status: TripStatus.ACTIVE, deletedAt: null },
    });
    if (active) throw new ConflictException('A trip is already active');
    return this.prisma.trip.create({
      data: {
        userId,
        title: input.title?.trim() || null,
        source: TripSource.MANUAL,
        status: TripStatus.ACTIVE,
        startedAt: new Date(),
      },
    });
  }

  async complete(userId: string, tripId: string): Promise<Record<string, unknown>> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, userId, status: TripStatus.ACTIVE, deletedAt: null },
    });
    if (!trip) throw new NotFoundException('Active trip not found');
    const endedAt = new Date();
    return this.prisma.trip.update({
      where: { id: trip.id },
      data: {
        status: TripStatus.COMPLETED,
        endedAt,
        durationSeconds: Math.max(0, Math.round((endedAt.getTime() - trip.startedAt.getTime()) / 1000)),
      },
    });
  }

  async appendLivePoint(userId: string, deviceId: string, input: LocationUpdateDto): Promise<void> {
    const trip = await this.prisma.trip.findFirst({
      where: { userId, status: TripStatus.ACTIVE, deletedAt: null },
      include: { points: { where: { deletedAt: null }, orderBy: { sequence: 'desc' }, take: 1 } },
    });
    if (!trip) return;
    const last = trip.points[0];
    const nextSequence = (last?.sequence ?? 0) + 1;
    const distanceDelta = last
      ? Math.round(
          haversineDistanceM(
            { latitude: Number(last.latitude), longitude: Number(last.longitude) },
            { latitude: input.latitude, longitude: input.longitude },
          ),
        )
      : 0;
    if (distanceDelta > 5_000) return;

    await this.prisma.$transaction([
      this.prisma.tripPoint.create({
        data: {
          tripId: trip.id,
          sourceDeviceId: deviceId,
          latitude: input.latitude,
          longitude: input.longitude,
          altitudeM: input.altitudeM,
          accuracyM: input.accuracyM,
          headingDeg: input.headingDeg,
          speedMps: input.speedMps,
          sequence: nextSequence,
          recordedAt: new Date(input.recordedAt),
        },
      }),
      this.prisma.trip.update({
        where: { id: trip.id },
        data: {
          distanceM: { increment: distanceDelta },
          maxSpeedMps:
            input.speedMps !== undefined && input.speedMps !== null
              ? Math.max(Number(trip.maxSpeedMps ?? 0), input.speedMps)
              : undefined,
        },
      }),
    ]);
  }

  async list(userId: string, query: TripsQueryDto): Promise<Record<string, unknown>> {
    const range = this.range(query.period, query.anchor ? new Date(query.anchor) : new Date());
    const trips = await this.prisma.trip.findMany({
      where: {
        userId,
        startedAt: { gte: range.from, lt: range.to },
        deletedAt: null,
      },
      orderBy: { startedAt: 'desc' },
    });
    const distanceM = trips.reduce((sum, trip) => sum + trip.distanceM, 0);
    const durationSeconds = trips.reduce((sum, trip) => sum + trip.durationSeconds, 0);
    return {
      period: query.period,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      summary: {
        trips: trips.length,
        distanceM,
        durationSeconds,
        averageDailyDistanceM: Math.round(distanceM / range.days),
      },
      data: trips,
    };
  }

  async detail(userId: string, tripId: string): Promise<Record<string, unknown>> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, userId, deletedAt: null },
      include: { points: { where: { deletedAt: null }, orderBy: { sequence: 'asc' }, take: 5_000 } },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    return {
      ...trip,
      points: trip.points.map((point) => ({
        ...point,
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
        altitudeM: point.altitudeM === null ? null : Number(point.altitudeM),
        accuracyM: Number(point.accuracyM),
        headingDeg: point.headingDeg === null ? null : Number(point.headingDeg),
        speedMps: point.speedMps === null ? null : Number(point.speedMps),
      })),
    };
  }

  private range(period: TripPeriodDto, anchor: Date): { from: Date; to: Date; days: number } {
    const from = new Date(anchor);
    from.setUTCHours(0, 0, 0, 0);
    if (period === TripPeriodDto.WEEK) {
      const weekday = (from.getUTCDay() + 6) % 7;
      from.setUTCDate(from.getUTCDate() - weekday);
    } else if (period === TripPeriodDto.MONTH) {
      from.setUTCDate(1);
    }
    const to = new Date(from);
    if (period === TripPeriodDto.DAY) to.setUTCDate(to.getUTCDate() + 1);
    if (period === TripPeriodDto.WEEK) to.setUTCDate(to.getUTCDate() + 7);
    if (period === TripPeriodDto.MONTH) to.setUTCMonth(to.getUTCMonth() + 1);
    return {
      from,
      to,
      days: Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000)),
    };
  }
}
