import { createHash } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  TransitCoverageStatus,
  TransitDisruptionSeverity,
  TransitDisruptionStatus,
  TransitReviewStatus,
} from '../../generated/prisma/client';
import {
  evaluateRouteForPublicUse,
  selectPublicFareEstimate,
} from './domain/transit-publication.policy';
import {
  planTransitJourneys,
  type TransitGraph,
  type TransitGraphEdge,
} from './domain/transit-planner';
import {
  buildPublicFareObservationWhere,
  buildPublicTransitRouteWhere,
} from './infrastructure/public-transit.query';
import type { PlanTransitJourneyDto, SearchTransitPlacesDto } from './transit-planner.dto';

@Injectable()
export class TransitPlannerService {
  constructor(private readonly prisma: PrismaService) {}

  async searchPlaces(input: SearchTransitPlacesDto): Promise<Record<string, unknown>> {
    const query = this.normalize(input.q);
    const places = await this.prisma.transitPlace.findMany({
      where: {
        areaId: input.areaId,
        verificationStatus: TransitReviewStatus.APPROVED,
        isActive: true,
        deletedAt: null,
        area: {
          is: {
            deletedAt: null,
            coverage: {
              is: {
                status: {
                  in: [TransitCoverageStatus.BETA, TransitCoverageStatus.VERIFIED],
                },
                deletedAt: null,
              },
            },
          },
        },
        OR: [
          { normalizedName: { contains: query, mode: 'insensitive' } },
          {
            aliases: {
              some: {
                normalizedAlias: { contains: query, mode: 'insensitive' },
                deletedAt: null,
              },
            },
          },
        ],
      },
      include: {
        area: { select: { id: true, name: true, type: true } },
        aliases: { where: { deletedAt: null }, orderBy: { isPrimary: 'desc' } },
        modes: { where: { deletedAt: null } },
      },
      orderBy: [{ normalizedName: 'asc' }, { name: 'asc' }],
      take: input.limit,
    });
    return {
      query: input.q,
      data: places.map((place) => ({
        id: place.id,
        code: place.code,
        name: place.name,
        type: place.type,
        area: place.area,
        coordinates: {
          latitude: Number(place.latitude),
          longitude: Number(place.longitude),
        },
        aliases: place.aliases.map((alias) => alias.alias),
        modes: place.modes.map((mode) => mode.mode),
      })),
    };
  }

  async plan(input: PlanTransitJourneyDto): Promise<Record<string, unknown>> {
    const now = new Date();
    const places = await this.prisma.transitPlace.findMany({
      where: {
        id: { in: [input.originPlaceId, input.destinationPlaceId] },
        verificationStatus: TransitReviewStatus.APPROVED,
        isActive: true,
        deletedAt: null,
        area: {
          is: {
            coverage: {
              is: {
                status: {
                  in: [TransitCoverageStatus.BETA, TransitCoverageStatus.VERIFIED],
                },
                deletedAt: null,
              },
            },
          },
        },
      },
      include: { area: true },
    });
    const origin = places.find((place) => place.id === input.originPlaceId);
    const destination = places.find((place) => place.id === input.destinationPlaceId);
    if (!origin || !destination) {
      throw new NotFoundException('Origin or destination is not publicly available');
    }

    const areaIds = new Set([
      ...(await this.ancestry(origin.areaId)),
      ...(await this.ancestry(destination.areaId)),
    ]);
    const routeWhere = buildPublicTransitRouteWhere();
    const routes = await this.prisma.transitRoute.findMany({
      where: {
        AND: [routeWhere, { areaId: { in: [...areaIds] } }],
      },
      include: {
        originPlace: true,
        destinationPlace: true,
        currentRevision: {
          include: { reviews: { where: { deletedAt: null } } },
        },
        stops: {
          where: { deletedAt: null },
          orderBy: { stopOrder: 'asc' },
          include: { place: true },
        },
        segments: {
          where: { deletedAt: null },
          orderBy: { segmentOrder: 'asc' },
        },
        fareObservations: {
          where: buildPublicFareObservationWhere(now),
          orderBy: [{ confidenceScore: 'desc' }, { observedAt: 'desc' }],
        },
      },
    });

    const blockedRouteIds = await this.blockedRouteIds(
      routes.map((route) => route.id),
      now,
    );
    const graph: TransitGraph = { places: [], edges: [] };
    const graphPlaces = new Map<string, string>();

    for (const route of routes) {
      if (blockedRouteIds.has(route.id)) continue;
      if (!evaluateRouteForPublicUse(route).publishable) continue;
      route.stops.forEach((stop) => graphPlaces.set(stop.place.id, stop.place.name));
      const stopById = new Map(route.stops.map((stop) => [stop.id, stop]));
      for (const segment of route.segments) {
        const fromStop = stopById.get(segment.fromStopId);
        const toStop = stopById.get(segment.toStopId);
        if (!fromStop || !toStop) continue;
        if (segment.durationMinMinutes === null || segment.durationMaxMinutes === null) {
          continue;
        }
        const matchingFares = route.fareObservations.filter(
          (fare) => fare.fromPlaceId === fromStop.placeId && fare.toPlaceId === toStop.placeId,
        );
        const observedFare = selectPublicFareEstimate(matchingFares, now);
        const edge: TransitGraphEdge = {
          id: segment.id,
          routeId: route.id,
          routeCode: route.code,
          routeName: route.name,
          routeDataVersion: route.dataVersion,
          fromPlaceId: fromStop.placeId,
          toPlaceId: toStop.placeId,
          mode: route.mode,
          destinationSign: route.destinationSign,
          instructions: fromStop.boardingInstructions ?? segment.roadDescription ?? null,
          durationMinMinutes: segment.durationMinMinutes,
          durationMaxMinutes: segment.durationMaxMinutes,
          fareMinKobo: segment.fareMinKobo ?? observedFare?.amountMinKobo ?? null,
          fareMaxKobo: segment.fareMaxKobo ?? observedFare?.amountMaxKobo ?? null,
          distanceM: segment.distanceM ?? 0,
        };
        graph.edges.push(edge);
      }
    }
    graph.places = [...graphPlaces].map(([id, name]) => ({ id, name }));

    const journeys = planTransitJourneys(graph, {
      originPlaceId: input.originPlaceId,
      destinationPlaceId: input.destinationPlaceId,
      preference: input.preference,
      maxTransfers: input.maxTransfers,
      maxAlternatives: input.maxAlternatives,
    }).map((journey) => ({
      ...journey,
      id: createHash('sha256').update(journey.id).digest('hex').slice(0, 24),
    }));
    if (journeys.length === 0) {
      throw new NotFoundException('No verified route is currently available');
    }
    return {
      generatedAt: now.toISOString(),
      dataFreshnessNotice:
        'Routes use approved data only. Fares are estimates and should be confirmed before boarding.',
      origin: { id: origin.id, name: origin.name },
      destination: { id: destination.id, name: destination.name },
      data: journeys,
    };
  }

  private async ancestry(areaId: string): Promise<string[]> {
    const ids: string[] = [];
    let current: string | null = areaId;
    for (let depth = 0; current && depth < 10; depth += 1) {
      ids.push(current);
      const area: { parentId: string | null } | null =
        await this.prisma.administrativeArea.findFirst({
          where: { id: current, deletedAt: null },
          select: { parentId: true },
        });
      current = area?.parentId ?? null;
    }
    return ids;
  }

  private async blockedRouteIds(routeIds: string[], now: Date): Promise<Set<string>> {
    if (routeIds.length === 0) return new Set();
    const disruptions = await this.prisma.transitDisruption.findMany({
      where: {
        routeId: { in: routeIds },
        status: {
          in: [TransitDisruptionStatus.SCHEDULED, TransitDisruptionStatus.ACTIVE],
        },
        severity: {
          in: [TransitDisruptionSeverity.MAJOR, TransitDisruptionSeverity.CRITICAL],
        },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        deletedAt: null,
      },
      select: { routeId: true },
    });
    return new Set(
      disruptions.flatMap((disruption) => (disruption.routeId ? [disruption.routeId] : [])),
    );
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
}
