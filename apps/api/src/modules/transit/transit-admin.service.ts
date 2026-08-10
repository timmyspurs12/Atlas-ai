import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  Prisma,
  TransitDisruptionStatus,
  TransitReviewStatus,
  TransitRouteStatus,
  UserRole,
  UserStatus,
} from '../../generated/prisma/client';
import { validateTransitCsv, type TransitCsvValidationResult } from './domain/transit-csv';
import { transitGraphValidationErrors } from './domain/transit-graph.policy';
import {
  AdminReviewDecisionDto,
  type CreateTransitDisruptionDto,
  type CreateTransitFareDto,
  type CreateTransitPlaceDto,
  type CreateTransitRouteDto,
  type ReviewTransitFareDto,
  type ReviewTransitPlaceDto,
  type SaveTransitRouteGraphDto,
  type TransitAdminListDto,
  type ValidateTransitCsvDto,
} from './transit-admin.dto';

@Injectable()
export class TransitAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(): Promise<Record<string, unknown>> {
    const [pendingPlaces, draftRoutes, pendingRevisions, activeDisruptions, imports] =
      await Promise.all([
        this.prisma.transitPlace.count({
          where: { verificationStatus: TransitReviewStatus.PENDING, deletedAt: null },
        }),
        this.prisma.transitRoute.count({
          where: {
            status: { in: [TransitRouteStatus.DRAFT, TransitRouteStatus.IN_REVIEW] },
            deletedAt: null,
          },
        }),
        this.prisma.transitRouteRevision.count({
          where: {
            submittedAt: { not: null },
            deletedAt: null,
            reviews: {
              none: {
                status: {
                  in: [
                    TransitReviewStatus.APPROVED,
                    TransitReviewStatus.REJECTED,
                    TransitReviewStatus.CHANGES_REQUESTED,
                  ],
                },
                deletedAt: null,
              },
            },
          },
        }),
        this.prisma.transitDisruption.count({
          where: { status: TransitDisruptionStatus.ACTIVE, deletedAt: null },
        }),
        this.prisma.transitImportJob.count({
          where: { status: { not: 'IMPORTED' }, deletedAt: null },
        }),
      ]);
    return { pendingPlaces, draftRoutes, pendingRevisions, activeDisruptions, imports };
  }

  async listPlaces(input: TransitAdminListDto): Promise<Record<string, unknown>> {
    const query = input.q ? this.normalize(input.q) : undefined;
    const data = await this.prisma.transitPlace.findMany({
      where: {
        verificationStatus: input.verificationStatus,
        deletedAt: null,
        ...(query
          ? {
              OR: [
                { normalizedName: { contains: query, mode: 'insensitive' as const } },
                { code: { contains: input.q?.toUpperCase(), mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: {
        area: { select: { id: true, name: true, type: true } },
        source: { select: { id: true, name: true, reliabilityScore: true } },
        aliases: { where: { deletedAt: null } },
        modes: { where: { deletedAt: null } },
      },
      orderBy: { updatedAt: 'desc' },
      take: input.limit,
    });
    return { data };
  }

  async listRoutes(input: TransitAdminListDto): Promise<Record<string, unknown>> {
    const data = await this.prisma.transitRoute.findMany({
      where: {
        status: input.routeStatus,
        deletedAt: null,
        ...(input.q
          ? {
              OR: [
                {
                  normalizedName: {
                    contains: this.normalize(input.q),
                    mode: 'insensitive' as const,
                  },
                },
                { code: { contains: input.q.toUpperCase(), mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: {
        area: { select: { id: true, name: true } },
        originPlace: { select: { id: true, name: true, verificationStatus: true } },
        destinationPlace: { select: { id: true, name: true, verificationStatus: true } },
        createdBy: { include: { profile: { select: { displayName: true } } } },
        _count: { select: { stops: true, segments: true, revisions: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: input.limit,
    });
    return { data };
  }

  async routeDetails(routeId: string): Promise<Record<string, unknown>> {
    const route = await this.prisma.transitRoute.findFirst({
      where: { id: routeId, deletedAt: null },
      include: {
        area: { select: { id: true, name: true } },
        originPlace: true,
        destinationPlace: true,
        stops: {
          where: { deletedAt: null },
          orderBy: { stopOrder: 'asc' },
          include: { place: true },
        },
        segments: { where: { deletedAt: null }, orderBy: { segmentOrder: 'asc' } },
        serviceWindows: {
          where: { deletedAt: null },
          orderBy: [{ day: 'asc' }, { startMinute: 'asc' }],
        },
      },
    });
    if (!route) throw new NotFoundException('Transit route not found');
    return route;
  }

  async createRoute(
    actorId: string,
    input: CreateTransitRouteDto,
  ): Promise<Record<string, unknown>> {
    if (input.originPlaceId === input.destinationPlaceId && input.direction !== 'LOOP') {
      throw new BadRequestException('Origin and destination must be different');
    }
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const actor = await this.requireActor(transaction, actorId, [
          UserRole.TRANSIT_EDITOR,
          UserRole.SUPER_ADMIN,
        ]);
        const [area, places] = await Promise.all([
          transaction.administrativeArea.findFirst({
            where: { id: input.areaId, isActive: true, deletedAt: null },
            select: { id: true },
          }),
          transaction.transitPlace.findMany({
            where: {
              id: { in: [input.originPlaceId, input.destinationPlaceId] },
              isActive: true,
              deletedAt: null,
            },
            select: { id: true },
          }),
        ]);
        if (
          !area ||
          places.length !== new Set([input.originPlaceId, input.destinationPlaceId]).size
        ) {
          throw new NotFoundException('Route area or endpoint place was not found');
        }
        const route = await transaction.transitRoute.create({
          data: {
            areaId: area.id,
            sourceId: input.sourceId,
            createdById: actor.id,
            originPlaceId: input.originPlaceId,
            destinationPlaceId: input.destinationPlaceId,
            code: input.code,
            name: input.name.trim(),
            normalizedName: this.normalize(input.name),
            scope: input.scope,
            mode: input.mode,
            status: TransitRouteStatus.DRAFT,
            direction: input.direction,
            destinationSign: input.destinationSign?.trim(),
            operatorName: input.operatorName?.trim(),
            publicDescription: input.publicDescription?.trim(),
          },
        });
        await transaction.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'TRANSIT_ROUTE_CREATED',
            entityType: 'TransitRoute',
            entityId: route.id,
            severity: 'INFO',
            outcome: 'SUCCESS',
            metadata: { code: route.code, areaId: route.areaId },
          },
        });
        return route;
      });
    } catch (error) {
      if (this.isUniqueViolation(error))
        throw new ConflictException('Transit route code already exists');
      throw error;
    }
  }

  async saveRouteGraph(
    actorId: string,
    routeId: string,
    input: SaveTransitRouteGraphDto,
  ): Promise<Record<string, unknown>> {
    const graphErrors = transitGraphValidationErrors(input);
    if (graphErrors[0]) throw new BadRequestException(graphErrors[0]);
    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.requireActor(transaction, actorId, [
        UserRole.TRANSIT_EDITOR,
        UserRole.SUPER_ADMIN,
      ]);
      const route = await transaction.transitRoute.findFirst({
        where: { id: routeId, deletedAt: null },
        include: {
          revisions: {
            where: {
              submittedAt: { not: null },
              deletedAt: null,
              reviews: {
                none: {
                  status: {
                    in: [
                      TransitReviewStatus.APPROVED,
                      TransitReviewStatus.REJECTED,
                      TransitReviewStatus.CHANGES_REQUESTED,
                    ],
                  },
                  deletedAt: null,
                },
              },
            },
          },
        },
      });
      if (!route) throw new NotFoundException('Transit route not found');
      if (route.createdById !== actor.id && actor.role !== UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('Editors may modify only routes assigned to them');
      }
      if (route.currentRevisionId || route.status === TransitRouteStatus.PUBLISHED) {
        throw new ConflictException('Published routes are immutable; create a new draft revision');
      }
      if (route.status === TransitRouteStatus.IN_REVIEW || route.revisions.length > 0) {
        throw new ConflictException('A submitted route cannot be edited until review finishes');
      }
      const placeIds = [...new Set(input.stops.map((stop) => stop.placeId))];
      const places = await transaction.transitPlace.findMany({
        where: { id: { in: placeIds }, isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (places.length !== placeIds.length) {
        throw new BadRequestException('One or more route stops are unavailable');
      }
      if (input.stops[0]?.placeId !== route.originPlaceId) {
        throw new BadRequestException('The first stop must match the route origin');
      }
      if (route.direction !== 'LOOP' && input.stops.at(-1)?.placeId !== route.destinationPlaceId) {
        throw new BadRequestException('The final stop must match the route destination');
      }

      await transaction.transitSegment.deleteMany({ where: { routeId: route.id } });
      await transaction.transitServiceWindow.deleteMany({ where: { routeId: route.id } });
      const savedStops: Array<{ id: string }> = [];
      for (const [stopOrder, stop] of input.stops.entries()) {
        const saved = await transaction.transitRouteStop.upsert({
          where: { routeId_stopOrder: { routeId: route.id, stopOrder } },
          create: {
            routeId: route.id,
            placeId: stop.placeId,
            stopOrder,
            platformName: stop.platformName?.trim(),
            pickupAllowed: stop.pickupAllowed,
            dropoffAllowed: stop.dropoffAllowed,
            boardingInstructions: stop.boardingInstructions?.trim(),
            alightingInstructions: stop.alightingInstructions?.trim(),
          },
          update: {
            placeId: stop.placeId,
            platformName: stop.platformName?.trim() || null,
            pickupAllowed: stop.pickupAllowed,
            dropoffAllowed: stop.dropoffAllowed,
            boardingInstructions: stop.boardingInstructions?.trim() || null,
            alightingInstructions: stop.alightingInstructions?.trim() || null,
            deletedAt: null,
          },
        });
        savedStops.push(saved);
      }
      await transaction.transitRouteStop.updateMany({
        where: { routeId: route.id, stopOrder: { gte: input.stops.length }, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      const segmentData = input.segments.map((segment, segmentOrder) => {
        const fromStop = savedStops[segment.fromStopOrder];
        const toStop = savedStops[segment.toStopOrder];
        if (!fromStop || !toStop) {
          throw new BadRequestException('Segment references an unavailable stop order');
        }
        return {
          routeId: route.id,
          fromStopId: fromStop.id,
          toStopId: toStop.id,
          segmentOrder,
          durationMinMinutes: segment.durationMinMinutes,
          durationMaxMinutes: segment.durationMaxMinutes,
          distanceM: segment.distanceM,
          fareMinKobo: segment.fareMinKobo,
          fareMaxKobo: segment.fareMaxKobo,
          roadDescription: segment.roadDescription?.trim(),
        };
      });
      await transaction.transitSegment.createMany({ data: segmentData });
      if (input.serviceWindows.length > 0) {
        await transaction.transitServiceWindow.createMany({
          data: input.serviceWindows.map((window) => ({
            routeId: route.id,
            day: window.day,
            startMinute: window.startMinute,
            endMinute: window.endMinute,
            endsNextDay: window.endsNextDay,
            frequencyMinMinutes: window.frequencyMinMinutes,
            frequencyMaxMinutes: window.frequencyMaxMinutes,
            isApproximate: window.isApproximate,
          })),
        });
      }
      const durationMinMinutes = input.segments.reduce(
        (total, segment) => total + segment.durationMinMinutes,
        0,
      );
      const durationMaxMinutes = input.segments.reduce(
        (total, segment) => total + segment.durationMaxMinutes,
        0,
      );
      await transaction.transitRoute.update({
        where: { id: route.id },
        data: { durationMinMinutes, durationMaxMinutes, status: TransitRouteStatus.DRAFT },
      });
      await transaction.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'TRANSIT_ROUTE_GRAPH_UPDATED',
          entityType: 'TransitRoute',
          entityId: route.id,
          severity: 'INFO',
          outcome: 'SUCCESS',
          metadata: {
            stops: input.stops.length,
            segments: input.segments.length,
            serviceWindows: input.serviceWindows.length,
          },
        },
      });
      return {
        routeId: route.id,
        status: TransitRouteStatus.DRAFT,
        stopCount: input.stops.length,
        segmentCount: input.segments.length,
        serviceWindowCount: input.serviceWindows.length,
        durationMinMinutes,
        durationMaxMinutes,
      };
    });
  }

  async pendingRevisions(limit = 50): Promise<Record<string, unknown>> {
    const data = await this.prisma.transitRouteRevision.findMany({
      where: {
        submittedAt: { not: null },
        deletedAt: null,
        reviews: {
          none: {
            status: {
              in: [
                TransitReviewStatus.APPROVED,
                TransitReviewStatus.REJECTED,
                TransitReviewStatus.CHANGES_REQUESTED,
              ],
            },
            deletedAt: null,
          },
        },
      },
      include: {
        route: { select: { id: true, code: true, name: true, status: true } },
        createdBy: { include: { profile: { select: { displayName: true } } } },
      },
      orderBy: { submittedAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return { data };
  }

  async createPlace(
    actorId: string,
    input: CreateTransitPlaceDto,
  ): Promise<Record<string, unknown>> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const actor = await this.requireActor(transaction, actorId, [
          UserRole.TRANSIT_EDITOR,
          UserRole.SUPER_ADMIN,
        ]);
        const area = await transaction.administrativeArea.findFirst({
          where: { id: input.areaId, isActive: true, deletedAt: null },
          select: { id: true },
        });
        if (!area) throw new NotFoundException('Administrative area not found');
        const aliases = [...new Set(input.aliases.map((alias) => alias.trim()).filter(Boolean))];
        const modes = [...new Set(input.modes)];
        const place = await transaction.transitPlace.create({
          data: {
            areaId: area.id,
            sourceId: input.sourceId,
            code: input.code,
            name: input.name.trim(),
            normalizedName: this.normalize(input.name),
            type: input.type,
            latitude: input.latitude,
            longitude: input.longitude,
            address: input.address?.trim(),
            landmarkDescription: input.landmarkDescription?.trim(),
            verificationStatus: TransitReviewStatus.PENDING,
            aliases: {
              create: aliases.map((alias, index) => ({
                alias,
                normalizedAlias: this.normalize(alias),
                isPrimary: index === 0,
              })),
            },
            modes: { create: modes.map((mode) => ({ mode })) },
          },
          include: { aliases: true, modes: true, area: true },
        });
        await transaction.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'TRANSIT_PLACE_CREATED',
            entityType: 'TransitPlace',
            entityId: place.id,
            severity: 'INFO',
            outcome: 'SUCCESS',
            metadata: { areaId: area.id, code: place.code },
          },
        });
        return place;
      });
    } catch (error) {
      if (this.isUniqueViolation(error))
        throw new ConflictException('Transit place code or alias already exists');
      throw error;
    }
  }

  async reviewPlace(
    actorId: string,
    placeId: string,
    input: ReviewTransitPlaceDto,
  ): Promise<Record<string, unknown>> {
    return this.prisma.$transaction(async (transaction) => {
      const reviewer = await this.requireActor(transaction, actorId, [
        UserRole.TRANSIT_REVIEWER,
        UserRole.SUPER_ADMIN,
      ]);
      const place = await transaction.transitPlace.findFirst({
        where: { id: placeId, deletedAt: null },
      });
      if (!place) throw new NotFoundException('Transit place not found');
      const creation = await transaction.auditLog.findFirst({
        where: {
          action: 'TRANSIT_PLACE_CREATED',
          entityType: 'TransitPlace',
          entityId: place.id,
        },
        orderBy: { createdAt: 'asc' },
        select: { actorId: true },
      });
      if (creation?.actorId === reviewer.id) {
        throw new ForbiddenException('A place editor cannot approve their own place');
      }
      if (input.decision !== AdminReviewDecisionDto.APPROVED && !input.notes?.trim()) {
        throw new BadRequestException('Review notes are required');
      }
      const approved = input.decision === AdminReviewDecisionDto.APPROVED;
      const updated = await transaction.transitPlace.update({
        where: { id: place.id },
        data: {
          verificationStatus: input.decision,
          verifiedAt: approved ? new Date() : null,
          isActive: input.decision !== AdminReviewDecisionDto.REJECTED,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorId: reviewer.id,
          action: `TRANSIT_PLACE_${input.decision}`,
          entityType: 'TransitPlace',
          entityId: place.id,
          severity: input.decision === AdminReviewDecisionDto.REJECTED ? 'WARNING' : 'INFO',
          outcome: 'SUCCESS',
          metadata: { notes: input.notes?.trim() || null },
        },
      });
      return updated;
    });
  }

  async createFare(actorId: string, input: CreateTransitFareDto): Promise<Record<string, unknown>> {
    if (input.amountMinKobo > input.amountMaxKobo) {
      throw new BadRequestException('Minimum fare cannot exceed maximum fare');
    }
    const observedAt = new Date(input.observedAt);
    const validUntil = input.validUntil ? new Date(input.validUntil) : null;
    if (validUntil && validUntil <= observedAt) {
      throw new BadRequestException('Fare validity must end after observation time');
    }
    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.requireActor(transaction, actorId, [
        UserRole.TRANSIT_EDITOR,
        UserRole.SUPER_ADMIN,
      ]);
      const fare = await transaction.transitFareObservation.create({
        data: {
          routeId: input.routeId,
          sourceId: input.sourceId,
          recordedById: actor.id,
          fromPlaceId: input.fromPlaceId,
          toPlaceId: input.toPlaceId,
          amountMinKobo: input.amountMinKobo,
          amountMaxKobo: input.amountMaxKobo,
          observedAt,
          validUntil,
          confidenceScore: 0,
          notes: input.notes?.trim(),
        },
      });
      await transaction.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'TRANSIT_FARE_RECORDED',
          entityType: 'TransitFareObservation',
          entityId: fare.id,
          severity: 'INFO',
          outcome: 'SUCCESS',
          metadata: { routeId: input.routeId },
        },
      });
      return fare;
    });
  }

  async reviewFare(
    actorId: string,
    fareId: string,
    input: ReviewTransitFareDto,
  ): Promise<Record<string, unknown>> {
    return this.prisma.$transaction(async (transaction) => {
      const reviewer = await this.requireActor(transaction, actorId, [
        UserRole.TRANSIT_REVIEWER,
        UserRole.SUPER_ADMIN,
      ]);
      const fare = await transaction.transitFareObservation.findFirst({
        where: { id: fareId, deletedAt: null },
      });
      if (!fare) throw new NotFoundException('Fare observation not found');
      if (fare.recordedById === reviewer.id) {
        throw new ForbiddenException('A fare recorder cannot approve their own observation');
      }
      const approved = input.decision === AdminReviewDecisionDto.APPROVED;
      if (approved && input.confidenceScore === undefined) {
        throw new BadRequestException('Approved fares require a confidence score');
      }
      if (!approved && !input.notes?.trim()) {
        throw new BadRequestException('Review notes are required');
      }
      const updated = await transaction.transitFareObservation.update({
        where: { id: fare.id },
        data: {
          confidenceScore: approved ? input.confidenceScore : 0,
          deletedAt: input.decision === AdminReviewDecisionDto.REJECTED ? new Date() : null,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorId: reviewer.id,
          action: `TRANSIT_FARE_${input.decision}`,
          entityType: 'TransitFareObservation',
          entityId: fare.id,
          severity: input.decision === AdminReviewDecisionDto.REJECTED ? 'WARNING' : 'INFO',
          outcome: 'SUCCESS',
          metadata: { notes: input.notes?.trim() || null },
        },
      });
      return updated;
    });
  }

  async publishDisruption(
    actorId: string,
    input: CreateTransitDisruptionDto,
  ): Promise<Record<string, unknown>> {
    const startsAt = new Date(input.startsAt);
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (endsAt && endsAt <= startsAt) {
      throw new BadRequestException('Disruption end must be after its start');
    }
    return this.prisma.$transaction(async (transaction) => {
      const reviewer = await this.requireActor(transaction, actorId, [
        UserRole.TRANSIT_REVIEWER,
        UserRole.SUPER_ADMIN,
      ]);
      const now = new Date();
      const disruption = await transaction.transitDisruption.create({
        data: {
          areaId: input.areaId,
          routeId: input.routeId,
          placeId: input.placeId,
          sourceId: input.sourceId,
          publishedById: reviewer.id,
          status:
            startsAt > now ? TransitDisruptionStatus.SCHEDULED : TransitDisruptionStatus.ACTIVE,
          severity: input.severity,
          title: input.title.trim(),
          description: input.description.trim(),
          startsAt,
          endsAt,
          publishedAt: now,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorId: reviewer.id,
          action: 'TRANSIT_DISRUPTION_PUBLISHED',
          entityType: 'TransitDisruption',
          entityId: disruption.id,
          severity: input.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
          outcome: 'SUCCESS',
          metadata: { areaId: input.areaId, routeId: input.routeId ?? null },
        },
      });
      return disruption;
    });
  }

  async validateCsv(
    actorId: string,
    input: ValidateTransitCsvDto,
  ): Promise<TransitCsvValidationResult> {
    const actor = await this.prisma.user.findFirst({
      where: {
        id: actorId,
        status: UserStatus.ACTIVE,
        role: { in: [UserRole.TRANSIT_EDITOR, UserRole.SUPER_ADMIN] },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!actor) throw new ForbiddenException('Only transit editors can validate imports');
    const result = validateTransitCsv(input.csvText);
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'TRANSIT_CSV_VALIDATED',
        entityType: 'TransitImportJob',
        severity: result.valid ? 'INFO' : 'WARNING',
        outcome: result.valid ? 'SUCCESS' : 'FAILURE',
        metadata: {
          areaId: input.areaId,
          checksum: createHash('sha256').update(input.csvText).digest('hex'),
          totalRows: result.totalRows,
          invalidRows: result.invalidRows,
        },
      },
    });
    return result;
  }

  private async requireActor(
    transaction: Prisma.TransactionClient,
    actorId: string,
    roles: UserRole[],
  ): Promise<{ id: string; role: UserRole }> {
    const actor = await transaction.user.findFirst({
      where: {
        id: actorId,
        status: UserStatus.ACTIVE,
        role: { in: roles },
        deletedAt: null,
      },
      select: { id: true, role: true },
    });
    if (!actor) throw new ForbiddenException('Transit administration access denied');
    return actor;
  }

  private normalize(value: string): string {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLocaleLowerCase('en-NG')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ');
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
