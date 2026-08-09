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
import {
  AdminReviewDecisionDto,
  type CreateTransitDisruptionDto,
  type CreateTransitFareDto,
  type CreateTransitPlaceDto,
  type ReviewTransitFareDto,
  type ReviewTransitPlaceDto,
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
