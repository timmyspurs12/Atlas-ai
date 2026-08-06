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
import { PUBLIC_ROUTE_MIN_CONFIDENCE } from './domain/transit-publication.policy';
import {
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
        this.assertRouteReadyForApproval(route);
        const currentSnapshot = this.buildSnapshot(route);
        if (this.checksum(currentSnapshot) !== revision.checksum) {
          throw new ConflictException('Route data changed after submission; submit a new revision');
        }
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

  private assertRouteReadyForApproval(route: SnapshotRoute): void {
    this.assertRouteShape(route);
    const approved = (place: SnapshotRoute['originPlace']): boolean =>
      place.verificationStatus === TransitReviewStatus.APPROVED &&
      place.isActive &&
      place.deletedAt === null;
    if (!approved(route.originPlace) || !approved(route.destinationPlace)) {
      throw new BadRequestException('Route origin and destination must be approved');
    }
    if (route.stops.some((stop) => !approved(stop.place))) {
      throw new BadRequestException('Every active route stop must be approved');
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
      segments: route.segments.map((segment) => ({
        id: segment.id,
        fromStopId: segment.fromStopId,
        toStopId: segment.toStopId,
        segmentOrder: segment.segmentOrder,
        distanceM: segment.distanceM,
        durationMinMinutes: segment.durationMinMinutes,
        durationMaxMinutes: segment.durationMaxMinutes,
        fareMinKobo: segment.fareMinKobo,
        fareMaxKobo: segment.fareMaxKobo,
        roadDescription: segment.roadDescription,
      })),
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
