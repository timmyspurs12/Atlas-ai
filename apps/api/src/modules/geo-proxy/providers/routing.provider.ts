import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../../config/environment';
import { GeoCacheService, type LoadResult } from '../geo-cache.service';
import { UpstreamHttpService } from '../upstream-http.service';
import {
  DEFAULT_UPSTREAM_BOUNDS,
  assertCoordinatesWithinBounds,
  cacheCellKey,
  isValidLatitude,
  isValidLongitude,
} from '../domain/upstream.policy';

export type RoutingProfile = 'driving' | 'cycling' | 'walking';

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface RouteLegSummary {
  readonly distanceM: number;
  readonly durationS: number;
}

export interface RouteSummary {
  readonly profile: RoutingProfile;
  readonly distanceM: number;
  readonly durationS: number;
  readonly etaMinutes: number;
  readonly legs: RouteLegSummary[];
  readonly attribution: string;
  /** 'stale' means this came from cache after an upstream failure — never present it as live. */
  readonly dataState: 'live' | 'stale';
  readonly ageSeconds?: number;
}

export const OSM_ATTRIBUTION =
  'Routes © OpenStreetMap contributors (ODbL), computed by the public OSRM instances operated by FOSSGIS e.V.';

interface OsrmLeg {
  distance?: unknown;
  duration?: unknown;
}

interface OsrmRoute {
  distance?: unknown;
  duration?: unknown;
  legs?: unknown;
}

interface OsrmResponse {
  code?: unknown;
  routes?: unknown;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Build the OSRM coordinate path segment.
 *
 * OSRM takes `longitude,latitude` — the reverse of almost every other API in this codebase,
 * which is exactly the kind of detail that silently produces routes in the wrong hemisphere.
 */
export function buildOsrmCoordinatePath(coordinates: readonly Coordinate[]): string {
  return coordinates
    .map((point) => `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`)
    .join(';');
}

/** Query string values for a route request. `steps` is opt-in because it is much larger. */
export function buildOsrmQuery(withSteps: boolean): Record<string, string | boolean> {
  return {
    overview: 'false',
    alternatives: 'false',
    annotations: 'false',
    steps: withSteps,
  };
}

/**
 * Narrow an OSRM response into a RouteSummary.
 *
 * Written defensively because this parses bytes from a third party: every field is checked
 * before use, and anything unexpected yields null rather than a plausible-looking zero.
 */
export function parseOsrmResponse(
  body: unknown,
  profile: RoutingProfile,
): Omit<RouteSummary, 'dataState' | 'ageSeconds'> | null {
  if (typeof body !== 'object' || body === null) return null;
  const response = body as OsrmResponse;

  if (response.code !== 'Ok') return null;
  if (!Array.isArray(response.routes)) return null;

  const route = response.routes[0] as OsrmRoute | undefined;
  if (!route) return null;
  if (!isFiniteNumber(route.distance) || !isFiniteNumber(route.duration)) return null;
  if (route.distance < 0 || route.duration < 0) return null;

  const legs: RouteLegSummary[] = [];
  if (Array.isArray(route.legs)) {
    for (const rawLeg of route.legs) {
      if (typeof rawLeg !== 'object' || rawLeg === null) continue;
      const leg = rawLeg as OsrmLeg;
      if (!isFiniteNumber(leg.distance) || !isFiniteNumber(leg.duration)) continue;
      legs.push({
        distanceM: Math.round(leg.distance),
        durationS: Math.round(leg.duration),
      });
    }
  }

  return {
    profile,
    distanceM: Math.round(route.distance),
    durationS: Math.round(route.duration),
    etaMinutes: Math.max(1, Math.ceil(route.duration / 60)),
    legs,
    attribution: OSM_ATTRIBUTION,
  };
}

@Injectable()
export class RoutingProvider {
  private readonly logger = new Logger(RoutingProvider.name);

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly http: UpstreamHttpService,
    private readonly cache: GeoCacheService,
  ) {}

  private baseUrlFor(profile: RoutingProfile): string {
    switch (profile) {
      case 'driving':
        return this.config.get('GEO_PROXY_OSRM_CAR_BASE_URL', { infer: true });
      case 'cycling':
        return this.config.get('GEO_PROXY_OSRM_BIKE_BASE_URL', { infer: true });
      case 'walking':
        return this.config.get('GEO_PROXY_OSRM_FOOT_BASE_URL', { infer: true });
    }
  }

  async route(
    coordinates: readonly Coordinate[],
    profile: RoutingProfile,
    withSteps = false,
  ): Promise<LoadResult<RouteSummary>> {
    for (const point of coordinates) {
      if (!isValidLatitude(point.latitude) || !isValidLongitude(point.longitude)) {
        return { ok: false, reason: 'A coordinate is out of range', kind: 'invalid' };
      }
    }

    const bounds = assertCoordinatesWithinBounds(coordinates);
    if (!bounds.ok) return { ok: false, reason: bounds.reason, kind: 'invalid' };

    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    if (!first || !last)
      return { ok: false, reason: 'At least two coordinates are required', kind: 'invalid' };

    const key = `${cacheCellKey('route', first.latitude, first.longitude)}>${cacheCellKey(
      'route',
      last.latitude,
      last.longitude,
    )}:${profile}:${withSteps ? 'steps' : 'nosteps'}`;

    const outcome = await this.cache.resolve<RouteSummary>({
      key,
      providerId: 'osrm',
      ttlMs: 10 * 60_000, // 10 minutes, matching the fairness expectations of public OSRM
      staleTtlMs: 60 * 60_000,
      backoffMs: 60_000,
      dailyBudget: this.config.get('GEO_PROXY_DAILY_BUDGET', { infer: true }),
      loader: async () => {
        const result = await this.http.getJson<unknown>({
          baseUrl: this.baseUrlFor(profile),
          path: `/${buildOsrmCoordinatePath(coordinates)}`,
          query: buildOsrmQuery(withSteps),
          maxResponseBytes: DEFAULT_UPSTREAM_BOUNDS.maxResponseBytes,
          timeoutMs: DEFAULT_UPSTREAM_BOUNDS.timeoutMs,
          userAgent: this.config.get('GEO_PROXY_USER_AGENT', { infer: true }),
        });
        if (!result.ok) {
          this.logger.warn(`OSRM ${profile} route failed: ${result.reason}`);
          return {
            ok: false,
            reason: `Upstream routing unavailable (${result.reason})`,
            kind: 'upstream',
          };
        }
        const parsed = parseOsrmResponse(result.value, profile);
        if (!parsed)
          return {
            ok: false,
            reason: 'Routing provider returned an unusable response',
            kind: 'upstream',
          };
        return { ok: true, value: { ...parsed, dataState: 'live' as const } };
      },
    });

    if (outcome.status === 'unavailable')
      return { ok: false, reason: outcome.reason, kind: outcome.kind };
    const value =
      outcome.status === 'stale'
        ? {
            ...outcome.value,
            dataState: 'stale' as const,
            ageSeconds: Math.round(outcome.ageMs / 1000),
          }
        : outcome.value;
    return { ok: true, value };
  }
}
