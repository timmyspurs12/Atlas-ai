import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  TransitReviewStatus,
  TransitRouteStatus,
  UserRole,
  UserStatus,
} from '../../generated/prisma/client';
import { evaluateCoveragePromotion, type CoverageMetrics } from './domain/transit-coverage.policy';
import { CoverageTargetStatusDto, type ReviewTransitCoverageDto } from './transit-coverage.dto';

@Injectable()
export class TransitCoverageService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<Record<string, unknown>> {
    const data = await this.prisma.transitCoverage.findMany({
      where: { deletedAt: null },
      include: {
        area: {
          select: {
            id: true,
            parentId: true,
            name: true,
            slug: true,
            code: true,
            type: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { area: { name: 'asc' } }],
      take: 500,
    });
    return { data };
  }

  async metrics(areaId: string, surveyedAt?: Date): Promise<CoverageMetrics> {
    const area = await this.prisma.administrativeArea.findFirst({
      where: { id: areaId, isActive: true, deletedAt: null },
      include: { coverage: true },
    });
    if (!area) throw new NotFoundException('Administrative area not found');
    const areaIds = await this.descendantIds(area.id);
    const approvedPlaceCount = await this.prisma.transitPlace.count({
      where: {
        areaId: { in: areaIds },
        verificationStatus: TransitReviewStatus.APPROVED,
        isActive: true,
        deletedAt: null,
      },
    });
    const routes = await this.prisma.transitRoute.findMany({
      where: {
        status: TransitRouteStatus.PUBLISHED,
        deletedAt: null,
        OR: [
          { areaId: { in: areaIds } },
          {
            stops: {
              some: {
                deletedAt: null,
                place: { is: { areaId: { in: areaIds }, deletedAt: null } },
              },
            },
          },
        ],
      },
      include: {
        stops: { where: { deletedAt: null } },
        segments: { where: { deletedAt: null } },
        fareObservations: {
          where: {
            deletedAt: null,
            confidenceScore: { gte: 50 },
            observedAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
            OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
          },
          take: 1,
        },
      },
    });
    const completeRouteCount = routes.filter(
      (route) =>
        route.stops.length >= 2 &&
        route.segments.length >= route.stops.length - 1 &&
        route.durationMinMinutes !== null &&
        route.durationMaxMinutes !== null &&
        route.segments.every(
          (segment) => segment.durationMinMinutes !== null && segment.durationMaxMinutes !== null,
        ),
    ).length;
    const staleCutoff = Date.now() - 90 * 86_400_000;
    return {
      approvedPlaceCount,
      publishedRouteCount: routes.length,
      completeRouteCount,
      freshFareRouteCount: routes.filter((route) => route.fareObservations.length > 0).length,
      lowestRouteConfidence:
        routes.length > 0 ? Math.min(...routes.map((route) => route.confidenceScore)) : null,
      staleRouteCount: routes.filter(
        (route) => route.lastVerifiedAt === null || route.lastVerifiedAt.getTime() < staleCutoff,
      ).length,
      lastSurveyedAt: surveyedAt ?? area.coverage?.lastSurveyedAt ?? null,
    };
  }

  async review(
    actorId: string,
    areaId: string,
    input: ReviewTransitCoverageDto,
  ): Promise<Record<string, unknown>> {
    const reviewer = await this.prisma.user.findFirst({
      where: {
        id: actorId,
        status: UserStatus.ACTIVE,
        role: { in: [UserRole.TRANSIT_REVIEWER, UserRole.SUPER_ADMIN] },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!reviewer) throw new ForbiddenException('Transit reviewer access required');
    const surveyedAt = input.lastSurveyedAt ? new Date(input.lastSurveyedAt) : undefined;
    const metrics = await this.metrics(areaId, surveyedAt);
    const decision = evaluateCoveragePromotion(input.status, metrics, new Date());
    if (!decision.allowed) {
      throw new BadRequestException(
        `Coverage cannot move to ${input.status}: ${decision.reasons.join('; ')}`,
      );
    }
    const publicStatus = ['BETA', 'VERIFIED'].includes(input.status);
    const qualityScore = this.qualityScore(metrics);
    const now = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.transitCoverage.findUnique({
        where: { areaId },
      });
      const coverage = await transaction.transitCoverage.upsert({
        where: { areaId },
        create: {
          areaId,
          status: input.status,
          qualityScore,
          dataVersion: 1,
          lastSurveyedAt: surveyedAt,
          lastVerifiedAt: publicStatus ? now : null,
          publishedAt: publicStatus ? now : null,
          notes: input.notes?.trim(),
        },
        update: {
          status: input.status,
          qualityScore,
          dataVersion: { increment: 1 },
          lastSurveyedAt: surveyedAt ?? existing?.lastSurveyedAt,
          lastVerifiedAt: publicStatus ? now : existing?.lastVerifiedAt,
          publishedAt: publicStatus ? (existing?.publishedAt ?? now) : existing?.publishedAt,
          notes: input.notes?.trim() ?? existing?.notes,
          deletedAt: null,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorId: reviewer.id,
          action: `TRANSIT_COVERAGE_${input.status}`,
          entityType: 'TransitCoverage',
          entityId: coverage.id,
          severity: input.status === CoverageTargetStatusDto.SUSPENDED ? 'WARNING' : 'INFO',
          outcome: 'SUCCESS',
          metadata: {
            areaId,
            qualityScore,
            metrics: {
              ...metrics,
              lastSurveyedAt: metrics.lastSurveyedAt?.toISOString() ?? null,
            },
          },
        },
      });
      return { coverage, metrics, decision };
    });
  }

  private async descendantIds(rootId: string): Promise<string[]> {
    const ids = [rootId];
    let frontier = [rootId];
    for (let depth = 0; frontier.length > 0 && depth < 10; depth += 1) {
      const children = await this.prisma.administrativeArea.findMany({
        where: { parentId: { in: frontier }, isActive: true, deletedAt: null },
        select: { id: true },
      });
      frontier = children.map((child) => child.id).filter((id) => !ids.includes(id));
      ids.push(...frontier);
    }
    return ids;
  }

  private qualityScore(metrics: CoverageMetrics): number {
    const placeScore = Math.min(metrics.approvedPlaceCount * 20, 20);
    const routeScore = Math.min(metrics.publishedRouteCount * 30, 30);
    const completeScore =
      metrics.publishedRouteCount > 0
        ? Math.round((metrics.completeRouteCount / metrics.publishedRouteCount) * 30)
        : 0;
    const confidenceScore = Math.min(metrics.lowestRouteConfidence ?? 0, 20);
    return Math.min(100, placeScore + routeScore + completeScore + confidenceScore);
  }
}
