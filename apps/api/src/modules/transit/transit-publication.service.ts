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
  TransitReviewStatus,
  TransitRouteStatus,
  UserRole,
  UserStatus,
} from '../../generated/prisma/client';
import { transitGraphValidationErrors } from './domain/transit-graph.policy';
import { PUBLIC_ROUTE_MIN_CONFIDENCE } from './domain/transit-publication.policy';
import type { SaveTransitRouteGraphDto } from './transit-admin.dto';
import {
  type CreateTransitRouteRevisionDto,
  type ReviewTransitRouteDto,
  type SubmitTransitRouteDto,
  TransitReviewDecisionDto,
} from './transit-publication.dto';

const routeSnapshotInclude = {
  source: { select: { id: true, reliabilityScore: true } },
  originPlace: true,
  destinationPlace: true,
  stops: {
    where: { deletedAt: null },
    orderBy: { stopOrder: 'asc' },
    include: { place: true },
  },
  segments: {
    where: { deletedAt: null },
    orderBy: { segmentOrder: 'asc' },
  },
  serviceWindows: {
    where: { deletedAt: null },
    orderBy: [{ day: 'asc' }, { startMinute: 'asc' }],
  },
} satisfies Prisma.TransitRouteInclude;

type SnapshotRoute = Prisma.TransitRouteGetPayload<{
  include: typeof routeSnapshotInclude;
}>;

interface RevisionSnapshot {
  schemaVersion: number;
  route: Record<string, unknown>;
  stops: Array<Record<string, unknown> & { placeId: string; stopOrder: number }>;
  segments: Array<
    Record<string, unknown> & {
      fromStopId?: string;
      toStopId?: string;
      fromStopOrder?: number;
      toStopOrder?: number;
      segmentOrder: number;
      durationMinMinutes: number | null;
      durationMaxMinutes: number | null;
    }
  >;
  serviceWindows: Array<Record<string, unknown>>;
}

interface SubmitResult {
  routeId: string;
  revisionId: string;
  version: number;
  routeStatus: TransitRouteStatus;
}

interface ReviewResult {
  routeId: string;
  revisionId: string;
  decision: TransitReviewDecisionDto;
  routeStatus: TransitRouteStatus;
}

@Injectable()
export class TransitPublicationService {
  constructor(private readonly prisma: PrismaService) {}

  async createWorkingRevision(
    actorId: string,
    routeId: string,
    input: CreateTransitRouteRevisionDto,
  ): Promise<Record<string, unknown>> {
    return this.withSerializableRetry(async (transaction) => {
      const actor = await this.requireActor(
        transaction,
        actorId,
        [UserRole.TRANSIT_EDITOR, UserRole.SUPER_ADMIN],
        'Only a transit editor can create a route revision',
      );
      const route = await transaction.transitRoute.findFirst({
        where: { id: routeId, status: TransitRouteStatus.PUBLISHED, deletedAt: null },
        include: routeSnapshotInclude,
      });
      if (!route?.currentRevisionId) {
        throw new ConflictException('Only a published route can be cloned into a new revision');
      }
      if (route.createdById !== actor.id && actor.role !== UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('Editors may revise only routes assigned to them');
      }
      const existing = await transaction.transitRouteRevision.findFirst({
        where: {
          routeId: route.id,
          version: { gt: route.dataVersion },
          deletedAt: null,
          OR: [
            { submittedAt: null },
            {
              submittedAt: { not: null },
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
          ],
        },
      });
      if (existing) throw new ConflictException('This route already has an open revision');
      const aggregate = await transaction.transitRouteRevision.aggregate({
        where: { routeId: route.id },
        _max: { version: true },
      });
      const snapshot = this.buildSnapshot(route);
      const revision = await transaction.transitRouteRevision.create({
        data: {
          routeId: route.id,
          createdById: actor.id,
          version: (aggregate._max.version ?? route.dataVersion) + 1,
          snapshot,
          checksum: this.checksum(snapshot),
          changeSummary: input.changeSummary?.trim() || null,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'TRANSIT_ROUTE_WORKING_REVISION_CREATED',
          entityType: 'TransitRouteRevision',
          entityId: revision.id,
          severity: 'INFO',
          outcome: 'SUCCESS',
          metadata: { routeId: route.id, version: revision.version },
        },
      });
      return { routeId: route.id, revisionId: revision.id, version: revision.version };
    });
  }

  async workingRevisionDetails(
    actorId: string,
    revisionId: string,
  ): Promise<Record<string, unknown>> {
    const actor = await this.prisma.user.findFirst({
      where: {
        id: actorId,
        status: UserStatus.ACTIVE,
        role: { in: [UserRole.TRANSIT_EDITOR, UserRole.SUPER_ADMIN] },
        deletedAt: null,
      },
      select: { id: true, role: true },
    });
    const revision = await this.prisma.transitRouteRevision.findFirst({
      where: { id: revisionId, submittedAt: null, deletedAt: null },
      include: { route: { include: routeSnapshotInclude } },
    });
    if (!actor || !revision) throw new NotFoundException('Working revision not found');
    if (revision.createdById !== actor.id && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Working revision access denied');
    }
    const snapshot = this.parseSnapshot(revision.snapshot);
    const placeIds = [...new Set(snapshot.stops.map((stop) => stop.placeId))];
    const places = await this.prisma.transitPlace.findMany({
      where: { id: { in: placeIds } },
    });
    const placeById = new Map(places.map((place) => [place.id, place]));
    return {
      ...revision.route,
      revisionId: revision.id,
      revisionVersion: revision.version,
      stops: snapshot.stops.map((stop) => ({
        ...stop,
        place: placeById.get(stop.placeId) ?? null,
      })),
      segments: snapshot.segments,
      serviceWindows: snapshot.serviceWindows,
    };
  }

  async updateWorkingRevisionGraph(
    actorId: string,
    revisionId: string,
    input: SaveTransitRouteGraphDto,
  ): Promise<Record<string, unknown>> {
    const errors = transitGraphValidationErrors(input);
    if (errors[0]) throw new BadRequestException(errors[0]);
    return this.withSerializableRetry(async (transaction) => {
      const actor = await this.requireActor(
        transaction,
        actorId,
        [UserRole.TRANSIT_EDITOR, UserRole.SUPER_ADMIN],
        'Only a transit editor can edit a working revision',
      );
      const revision = await transaction.transitRouteRevision.findFirst({
        where: { id: revisionId, submittedAt: null, deletedAt: null },
        include: { route: true },
      });
      if (!revision) throw new NotFoundException('Working revision not found');
      if (revision.createdById !== actor.id && actor.role !== UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('Working revision access denied');
      }
      if (revision.version <= revision.route.dataVersion) {
        throw new ConflictException('This revision is older than the public route');
      }
      if (input.stops[0]?.placeId !== revision.route.originPlaceId) {
        throw new BadRequestException('The first stop must match the route origin');
      }
      if (
        revision.route.direction !== 'LOOP' &&
        input.stops.at(-1)?.placeId !== revision.route.destinationPlaceId
      ) {
        throw new BadRequestException('The final stop must match the route destination');
      }
      const placeIds = [...new Set(input.stops.map((stop) => stop.placeId))];
      const placeCount = await transaction.transitPlace.count({
        where: { id: { in: placeIds }, isActive: true, deletedAt: null },
      });
      if (placeCount !== placeIds.length) {
        throw new BadRequestException('One or more revision stops are unavailable');
      }
      const previous = this.parseSnapshot(revision.snapshot);
      const stopIds = input.stops.map((_, index) => `draft-stop-${revision.id}-${index}`);
      const snapshot: RevisionSnapshot = {
        ...previous,
        stops: input.stops.map((stop, stopOrder) => ({
          id: stopIds[stopOrder] as string,
          placeId: stop.placeId,
          stopOrder,
          platformName: stop.platformName?.trim() || null,
          pickupAllowed: stop.pickupAllowed,
          dropoffAllowed: stop.dropoffAllowed,
          boardingInstructions: stop.boardingInstructions?.trim() || null,
          alightingInstructions: stop.alightingInstructions?.trim() || null,
        })),
        segments: input.segments.map((segment, segmentOrder) => ({
          id: `draft-segment-${revision.id}-${segmentOrder}`,
          fromStopId: stopIds[segment.fromStopOrder] as string,
          toStopId: stopIds[segment.toStopOrder] as string,
          fromStopOrder: segment.fromStopOrder,
          toStopOrder: segment.toStopOrder,
          segmentOrder,
          durationMinMinutes: segment.durationMinMinutes,
          durationMaxMinutes: segment.durationMaxMinutes,
          distanceM: segment.distanceM ?? null,
          fareMinKobo: segment.fareMinKobo ?? null,
          fareMaxKobo: segment.fareMaxKobo ?? null,
          roadDescription: segment.roadDescription?.trim() || null,
        })),
        serviceWindows: input.serviceWindows.map((window, index) => ({
          id: `draft-window-${revision.id}-${index}`,
          day: window.day,
          startMinute: window.startMinute,
          endMinute: window.endMinute,
          endsNextDay: window.endsNextDay,
          frequencyMinMinutes: window.frequencyMinMinutes ?? null,
          frequencyMaxMinutes: window.frequencyMaxMinutes ?? null,
          isApproximate: window.isApproximate,
        })),
      };
      await transaction.transitRouteRevision.update({
        where: { id: revision.id },
        data: {
          snapshot: snapshot as unknown as Prisma.InputJsonObject,
          checksum: this.checksum(snapshot),
        },
      });
      return { revisionId: revision.id, version: revision.version, saved: true };
    });
  }

  async submitWorkingRevision(actorId: string, revisionId: string): Promise<SubmitResult> {
    return this.withSerializableRetry(async (transaction) => {
      const actor = await this.requireActor(
        transaction,
        actorId,
        [UserRole.TRANSIT_EDITOR, UserRole.SUPER_ADMIN],
        'Only a transit editor can submit a working revision',
      );
      const revision = await transaction.transitRouteRevision.findFirst({
        where: { id: revisionId, submittedAt: null, deletedAt: null },
        include: { route: true },
      });
      if (!revision) throw new NotFoundException('Working revision not found');
      if (revision.createdById !== actor.id && actor.role !== UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('Working revision access denied');
      }
      this.parseSnapshot(revision.snapshot);
      const submittedAt = new Date();
      await transaction.transitRouteRevision.update({
        where: { id: revision.id },
        data: { submittedAt },
      });
      await transaction.transitRoute.update({
        where: { id: revision.routeId },
        data: { submittedAt },
      });
      await transaction.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'TRANSIT_ROUTE_WORKING_REVISION_SUBMITTED',
          entityType: 'TransitRouteRevision',
          entityId: revision.id,
          severity: 'INFO',
          outcome: 'SUCCESS',
          metadata: { routeId: revision.routeId, version: revision.version },
        },
      });
      return {
        routeId: revision.routeId,
        revisionId: revision.id,
        version: revision.version,
        routeStatus: revision.route.status,
      };
    });
  }

  async submitRouteRevision(
    actorId: string,
    routeId: string,
    input: SubmitTransitRouteDto,
  ): Promise<SubmitResult> {
    return this.withSerializableRetry(async (transaction) => {
      const actor = await this.requireActor(
        transaction,
        actorId,
        [UserRole.TRANSIT_EDITOR, UserRole.SUPER_ADMIN],
        'Only a transit editor can submit a route',
      );
      const route = await transaction.transitRoute.findFirst({
        where: { id: routeId, deletedAt: null },
        include: routeSnapshotInclude,
      });
      if (!route) throw new NotFoundException('Transit route not found');
      if (route.status === TransitRouteStatus.RETIRED) {
        throw new ConflictException('A retired route cannot be submitted');
      }
      if (route.createdById !== actor.id && actor.role !== UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('Editors may submit only routes assigned to them');
      }
      this.assertRouteShape(route);

      const pending = await transaction.transitRouteRevision.findFirst({
        where: {
          routeId: route.id,
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
        select: { id: true },
      });
      if (pending) throw new ConflictException('This route already has a pending revision');

      const aggregate = await transaction.transitRouteRevision.aggregate({
        where: { routeId: route.id },
        _max: { version: true },
      });
      const version = (aggregate._max.version ?? 0) + 1;
      const snapshot = this.buildSnapshot(route);
      const now = new Date();
      const revision = await transaction.transitRouteRevision.create({
        data: {
          routeId: route.id,
          createdById: actor.id,
          version,
          snapshot,
          checksum: this.checksum(snapshot),
          changeSummary: input.changeSummary?.trim() || null,
          submittedAt: now,
        },
      });
      const nextStatus = route.currentRevisionId ? route.status : TransitRouteStatus.IN_REVIEW;
      await transaction.transitRoute.update({
        where: { id: route.id },
        data: { status: nextStatus, submittedAt: now },
      });
      await transaction.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'TRANSIT_ROUTE_REVISION_SUBMITTED',
          entityType: 'TransitRouteRevision',
          entityId: revision.id,
          severity: 'INFO',
          outcome: 'SUCCESS',
          metadata: { routeId: route.id, version },
        },
      });
      return {
        routeId: route.id,
        revisionId: revision.id,
        version,
        routeStatus: nextStatus,
      };
    });
  }

  async reviewRouteRevision(
    actorId: string,
    revisionId: string,
    input: ReviewTransitRouteDto,
  ): Promise<ReviewResult> {
    return this.withSerializableRetry(async (transaction) => {
      const reviewer = await this.requireActor(
        transaction,
        actorId,
        [UserRole.TRANSIT_REVIEWER, UserRole.SUPER_ADMIN],
        'Only a transit reviewer can review a route',
      );
      const revision = await transaction.transitRouteRevision.findFirst({
        where: { id: revisionId, submittedAt: { not: null }, deletedAt: null },
        include: {
          route: { include: routeSnapshotInclude },
          reviews: { where: { deletedAt: null } },
        },
      });
      if (!revision) throw new NotFoundException('Submitted route revision not found');
      if (revision.createdById === reviewer.id) {
        throw new ForbiddenException('A route editor cannot review their own revision');
      }
      if (revision.reviews.some((review) => review.status !== TransitReviewStatus.PENDING)) {
        throw new ConflictException('This revision already has a final review');
      }
      if (this.checksum(revision.snapshot) !== revision.checksum) {
        throw new ConflictException('Revision integrity verification failed');
      }
      if (input.decision !== TransitReviewDecisionDto.APPROVED && !input.notes?.trim()) {
        throw new BadRequestException('Review notes are required for rejected changes');
      }

      const route = revision.route;
      let nextStatus = route.currentRevisionId
        ? TransitRouteStatus.PUBLISHED
        : TransitRouteStatus.DRAFT;
      const now = new Date();

      if (input.decision === TransitReviewDecisionDto.APPROVED) {
        if (
          input.confidenceScore === undefined ||
          input.confidenceScore < PUBLIC_ROUTE_MIN_CONFIDENCE
        ) {
          throw new BadRequestException(
            `Approved routes require a confidence score of at least ${PUBLIC_ROUTE_MIN_CONFIDENCE}`,
          );
        }
        if (revision.version <= route.dataVersion && route.currentRevisionId) {
          throw new ConflictException('A newer or equal route revision is already published');
        }
        const snapshot = this.parseSnapshot(revision.snapshot);
        await this.assertSnapshotReadyForApproval(transaction, route, snapshot);
        await this.materializeSnapshot(transaction, route.id, snapshot);
        nextStatus = TransitRouteStatus.PUBLISHED;
      }

      await transaction.transitRouteReview.create({
        data: {
          revisionId: revision.id,
          reviewerId: reviewer.id,
          status: input.decision,
          notes: input.notes?.trim() || null,
          reviewedAt: now,
        },
      });

      await transaction.transitRoute.update({
        where: { id: route.id },
        data:
          input.decision === TransitReviewDecisionDto.APPROVED
            ? {
                status: TransitRouteStatus.PUBLISHED,
                currentRevisionId: revision.id,
                publishedById: reviewer.id,
                publishedAt: now,
                lastVerifiedAt: now,
                confidenceScore: input.confidenceScore,
                dataVersion: revision.version,
                submittedAt: null,
              }
            : {
                status: nextStatus,
                submittedAt: null,
              },
      });

      await transaction.auditLog.create({
        data: {
          actorId: reviewer.id,
          action: `TRANSIT_ROUTE_REVISION_${input.decision}`,
          entityType: 'TransitRouteRevision',
          entityId: revision.id,
          severity: input.decision === TransitReviewDecisionDto.REJECTED ? 'WARNING' : 'INFO',
          outcome: 'SUCCESS',
          metadata: { routeId: route.id, version: revision.version },
        },
      });

      return {
        routeId: route.id,
        revisionId: revision.id,
        decision: input.decision,
        routeStatus: nextStatus,
      };
    });
  }

  private async requireActor(
    transaction: Prisma.TransactionClient,
    actorId: string,
    allowedRoles: UserRole[],
    message: string,
  ): Promise<{ id: string; role: UserRole }> {
    const actor = await transaction.user.findFirst({
      where: { id: actorId, status: UserStatus.ACTIVE, deletedAt: null },
      select: { id: true, role: true },
    });
    if (!actor || !allowedRoles.includes(actor.role)) {
      throw new ForbiddenException(message);
    }
    return actor;
  }

  private assertRouteShape(route: SnapshotRoute): void {
    if (route.stops.length < 2) {
      throw new BadRequestException('A route requires at least two active stops');
    }
    route.stops.forEach((stop, index) => {
      if (stop.stopOrder !== index) {
        throw new BadRequestException('Route stop order must be contiguous from zero');
      }
    });
    const firstStop = route.stops[0];
    const lastStop = route.stops.at(-1);
    if (!firstStop || !lastStop) {
      throw new BadRequestException('Route endpoints are missing');
    }
    if (firstStop.placeId !== route.originPlaceId) {
      throw new BadRequestException('The first stop must match the route origin');
    }
    if (route.direction !== 'LOOP' && lastStop.placeId !== route.destinationPlaceId) {
      throw new BadRequestException('The final stop must match the route destination');
    }
    const segmentPairs = new Set(
      route.segments.map((segment) => `${segment.fromStopId}:${segment.toStopId}`),
    );
    for (let index = 0; index < route.stops.length - 1; index += 1) {
      const from = route.stops[index];
      const to = route.stops[index + 1];
      if (!from || !to || !segmentPairs.has(`${from.id}:${to.id}`)) {
        throw new BadRequestException('Every consecutive stop requires a segment');
      }
    }
  }

  private buildSnapshot(route: SnapshotRoute): Prisma.InputJsonObject {
    return {
      schemaVersion: 1,
      route: {
        id: route.id,
        code: route.code,
        name: route.name,
        normalizedName: route.normalizedName,
        areaId: route.areaId,
        sourceId: route.sourceId,
        originPlaceId: route.originPlaceId,
        destinationPlaceId: route.destinationPlaceId,
        scope: route.scope,
        mode: route.mode,
        direction: route.direction,
        destinationSign: route.destinationSign,
        operatorName: route.operatorName,
        publicDescription: route.publicDescription,
        boardingSummary: route.boardingSummary,
        durationMinMinutes: route.durationMinMinutes,
        durationMaxMinutes: route.durationMaxMinutes,
      },
      stops: route.stops.map((stop) => ({
        id: stop.id,
        placeId: stop.placeId,
        stopOrder: stop.stopOrder,
        platformName: stop.platformName,
        pickupAllowed: stop.pickupAllowed,
        dropoffAllowed: stop.dropoffAllowed,
        boardingInstructions: stop.boardingInstructions,
        alightingInstructions: stop.alightingInstructions,
      })),
      segments: route.segments.map((segment) => {
        const fromStopOrder = route.stops.find((stop) => stop.id === segment.fromStopId)?.stopOrder;
        const toStopOrder = route.stops.find((stop) => stop.id === segment.toStopId)?.stopOrder;
        return {
          id: segment.id,
          fromStopId: segment.fromStopId,
          toStopId: segment.toStopId,
          fromStopOrder,
          toStopOrder,
          segmentOrder: segment.segmentOrder,
          distanceM: segment.distanceM,
          durationMinMinutes: segment.durationMinMinutes,
          durationMaxMinutes: segment.durationMaxMinutes,
          fareMinKobo: segment.fareMinKobo,
          fareMaxKobo: segment.fareMaxKobo,
          roadDescription: segment.roadDescription,
        };
      }),
      serviceWindows: route.serviceWindows.map((window) => ({
        id: window.id,
        day: window.day,
        startMinute: window.startMinute,
        endMinute: window.endMinute,
        endsNextDay: window.endsNextDay,
        frequencyMinMinutes: window.frequencyMinMinutes,
        frequencyMaxMinutes: window.frequencyMaxMinutes,
        isApproximate: window.isApproximate,
      })),
    };
  }

  private parseSnapshot(value: Prisma.JsonValue): RevisionSnapshot {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Route revision snapshot is invalid');
    }
    const candidate = value as Record<string, unknown>;
    if (
      !candidate.route ||
      typeof candidate.route !== 'object' ||
      !Array.isArray(candidate.stops) ||
      !Array.isArray(candidate.segments) ||
      !Array.isArray(candidate.serviceWindows)
    ) {
      throw new BadRequestException('Route revision snapshot is incomplete');
    }
    const stops = candidate.stops as RevisionSnapshot['stops'];
    const stopOrderById = new Map(
      stops
        .filter((stop) => typeof stop.id === 'string' && typeof stop.stopOrder === 'number')
        .map((stop) => [stop.id as string, stop.stopOrder]),
    );
    const segments = (candidate.segments as RevisionSnapshot['segments']).map((segment) => ({
      ...segment,
      fromStopOrder:
        segment.fromStopOrder ??
        (segment.fromStopId ? stopOrderById.get(segment.fromStopId) : undefined),
      toStopOrder:
        segment.toStopOrder ?? (segment.toStopId ? stopOrderById.get(segment.toStopId) : undefined),
    }));
    if (
      stops.some(
        (stop) => typeof stop.placeId !== 'string' || typeof stop.stopOrder !== 'number',
      ) ||
      segments.some(
        (segment) =>
          typeof segment.fromStopOrder !== 'number' ||
          typeof segment.toStopOrder !== 'number' ||
          typeof segment.segmentOrder !== 'number',
      )
    ) {
      throw new BadRequestException('Route revision graph references are invalid');
    }
    return {
      schemaVersion: typeof candidate.schemaVersion === 'number' ? candidate.schemaVersion : 1,
      route: candidate.route as Record<string, unknown>,
      stops,
      segments,
      serviceWindows: candidate.serviceWindows as RevisionSnapshot['serviceWindows'],
    };
  }

  private async assertSnapshotReadyForApproval(
    transaction: Prisma.TransactionClient,
    route: SnapshotRoute,
    snapshot: RevisionSnapshot,
  ): Promise<void> {
    const graphErrors = transitGraphValidationErrors({
      stops: snapshot.stops,
      segments: snapshot.segments.map((segment) => ({
        fromStopOrder: segment.fromStopOrder as number,
        toStopOrder: segment.toStopOrder as number,
        durationMinMinutes: segment.durationMinMinutes ?? 0,
        durationMaxMinutes: segment.durationMaxMinutes ?? 0,
        fareMinKobo: typeof segment.fareMinKobo === 'number' ? segment.fareMinKobo : undefined,
        fareMaxKobo: typeof segment.fareMaxKobo === 'number' ? segment.fareMaxKobo : undefined,
      })),
      serviceWindows: snapshot.serviceWindows.map((window) => ({
        startMinute: Number(window.startMinute),
        endMinute: Number(window.endMinute),
        endsNextDay: Boolean(window.endsNextDay),
        frequencyMinMinutes:
          typeof window.frequencyMinMinutes === 'number' ? window.frequencyMinMinutes : undefined,
        frequencyMaxMinutes:
          typeof window.frequencyMaxMinutes === 'number' ? window.frequencyMaxMinutes : undefined,
      })),
    });
    if (graphErrors[0]) throw new BadRequestException(graphErrors[0]);
    if (snapshot.stops[0]?.placeId !== route.originPlaceId) {
      throw new BadRequestException('Revision first stop must match route origin');
    }
    if (route.direction !== 'LOOP' && snapshot.stops.at(-1)?.placeId !== route.destinationPlaceId) {
      throw new BadRequestException('Revision final stop must match route destination');
    }
    const placeIds = [...new Set(snapshot.stops.map((stop) => stop.placeId))];
    const approvedPlaces = await transaction.transitPlace.count({
      where: {
        id: { in: placeIds },
        verificationStatus: TransitReviewStatus.APPROVED,
        isActive: true,
        deletedAt: null,
      },
    });
    if (approvedPlaces !== placeIds.length) {
      throw new BadRequestException('Every revision stop must be an approved place');
    }
  }

  private async materializeSnapshot(
    transaction: Prisma.TransactionClient,
    routeId: string,
    snapshot: RevisionSnapshot,
  ): Promise<void> {
    await transaction.transitSegment.deleteMany({ where: { routeId } });
    await transaction.transitServiceWindow.deleteMany({ where: { routeId } });
    const savedStops: Array<{ id: string }> = [];
    for (const stop of [...snapshot.stops].sort((a, b) => a.stopOrder - b.stopOrder)) {
      const saved = await transaction.transitRouteStop.upsert({
        where: { routeId_stopOrder: { routeId, stopOrder: stop.stopOrder } },
        create: {
          routeId,
          placeId: stop.placeId,
          stopOrder: stop.stopOrder,
          platformName: this.stringOrNull(stop.platformName),
          pickupAllowed: stop.pickupAllowed !== false,
          dropoffAllowed: stop.dropoffAllowed !== false,
          boardingInstructions: this.stringOrNull(stop.boardingInstructions),
          alightingInstructions: this.stringOrNull(stop.alightingInstructions),
        },
        update: {
          placeId: stop.placeId,
          platformName: this.stringOrNull(stop.platformName),
          pickupAllowed: stop.pickupAllowed !== false,
          dropoffAllowed: stop.dropoffAllowed !== false,
          boardingInstructions: this.stringOrNull(stop.boardingInstructions),
          alightingInstructions: this.stringOrNull(stop.alightingInstructions),
          deletedAt: null,
        },
      });
      savedStops[stop.stopOrder] = saved;
    }
    await transaction.transitRouteStop.updateMany({
      where: {
        routeId,
        stopOrder: { gte: snapshot.stops.length },
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
    const segmentData = snapshot.segments
      .sort((a, b) => a.segmentOrder - b.segmentOrder)
      .map((segment) => {
        const from = savedStops[segment.fromStopOrder as number];
        const to = savedStops[segment.toStopOrder as number];
        if (!from || !to) throw new BadRequestException('Revision segment stop is missing');
        return {
          routeId,
          fromStopId: from.id,
          toStopId: to.id,
          segmentOrder: segment.segmentOrder,
          durationMinMinutes: segment.durationMinMinutes,
          durationMaxMinutes: segment.durationMaxMinutes,
          distanceM: this.numberOrNull(segment.distanceM),
          fareMinKobo: this.numberOrNull(segment.fareMinKobo),
          fareMaxKobo: this.numberOrNull(segment.fareMaxKobo),
          roadDescription: this.stringOrNull(segment.roadDescription),
        };
      });
    await transaction.transitSegment.createMany({ data: segmentData });
    if (snapshot.serviceWindows.length > 0) {
      await transaction.transitServiceWindow.createMany({
        data: snapshot.serviceWindows.map((window) => ({
          routeId,
          day: String(window.day) as Prisma.TransitServiceWindowCreateManyInput['day'],
          startMinute: Number(window.startMinute),
          endMinute: Number(window.endMinute),
          endsNextDay: Boolean(window.endsNextDay),
          frequencyMinMinutes: this.numberOrNull(window.frequencyMinMinutes),
          frequencyMaxMinutes: this.numberOrNull(window.frequencyMaxMinutes),
          isApproximate: window.isApproximate !== false,
        })),
      });
    }
    const durationMinMinutes = segmentData.reduce(
      (total, segment) => total + (segment.durationMinMinutes ?? 0),
      0,
    );
    const durationMaxMinutes = segmentData.reduce(
      (total, segment) => total + (segment.durationMaxMinutes ?? 0),
      0,
    );
    await transaction.transitRoute.update({
      where: { id: routeId },
      data: { durationMinMinutes, durationMaxMinutes },
    });
  }

  private stringOrNull(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private numberOrNull(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private checksum(value: unknown): string {
    return createHash('sha256').update(this.stableSerialize(value)).digest('hex');
  }

  private stableSerialize(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map((entry) => this.stableSerialize(entry)).join(',')}]`;
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${this.stableSerialize(record[key])}`)
      .join(',')}}`;
  }

  private async withSerializableRetry<T>(
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 15_000,
        });
      } catch (error) {
        const retryable =
          typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034';
        if (!retryable || attempt === 3) throw error;
      }
    }
    throw new ConflictException('Transaction could not be completed');
  }
}
