import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../../config/environment';
import { GeoCacheService, type CacheOutcome, type LoadResult } from '../geo-cache.service';
import { UpstreamHttpService } from '../upstream-http.service';
import {
  DEFAULT_UPSTREAM_BOUNDS,
  cacheCellKey,
  isValidLatitude,
  isValidLongitude,
} from '../domain/upstream.policy';

export interface GeocodePlace {
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly displayName: string;
  readonly locality: string | null;
  readonly region: string | null;
  readonly country: string | null;
  readonly postalCode: string | null;
  readonly source: 'photon' | 'nominatim';
  readonly attribution: string;
  readonly dataState: 'live' | 'stale';
  readonly ageSeconds?: number;
}

export const OSM_ATTRIBUTION = 'Geocoding © OpenStreetMap contributors (ODbL)';

/** Nominatim's usage policy: at most one request per second, and never bulk queries. */
const NOMINATIM_MIN_INTERVAL_MS = 1_100;
const MAX_QUERY_LENGTH = 200;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function asCoordinateString(value: unknown): number | null {
  if (isFiniteNumber(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

interface PhotonProperties {
  name?: unknown;
  city?: unknown;
  state?: unknown;
  country?: unknown;
  postcode?: unknown;
}

interface PhotonFeature {
  geometry?: { coordinates?: unknown };
  properties?: PhotonProperties;
}

/** Parse a Photon (komoot) GeoJSON FeatureCollection into a normalised place. */
export function parsePhotonResponse(body: unknown): Omit<GeocodePlace, 'dataState'> | null {
  if (typeof body !== 'object' || body === null) return null;
  const features = (body as { features?: unknown }).features;
  if (!Array.isArray(features)) return null;

  const feature = features[0] as PhotonFeature | undefined;
  if (!feature) return null;

  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return null;
  // GeoJSON coordinate order is [longitude, latitude].
  const longitude = asCoordinateString(coordinates[0]);
  const latitude = asCoordinateString(coordinates[1]);
  if (longitude === null || latitude === null) return null;
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;

  const properties = feature.properties ?? {};
  const name = asText(properties.name) ?? asText(properties.city) ?? asText(properties.state);
  if (!name) return null;

  const displayName = [
    name,
    asText(properties.city) === name ? null : asText(properties.city),
    asText(properties.state),
    asText(properties.country),
  ]
    .filter((part): part is string => Boolean(part))
    .join(', ');

  return {
    name,
    latitude,
    longitude,
    displayName,
    locality: asText(properties.city),
    region: asText(properties.state),
    country: asText(properties.country),
    postalCode: asText(properties.postcode),
    source: 'photon',
    attribution: OSM_ATTRIBUTION,
  };
}

interface NominatimResult {
  lat?: unknown;
  lon?: unknown;
  display_name?: unknown;
  name?: unknown;
  address?: Record<string, unknown>;
}

/**
 * Parse a Nominatim `jsonv2` response.
 *
 * `/search` returns an array, `/reverse` returns a single object; both are handled because
 * the two endpoints are used interchangeably as fallbacks. Nominatim reports coordinates as
 * STRINGS, which is the detail that most often breaks a naive parser.
 */
export function parseNominatimResponse(body: unknown): Omit<GeocodePlace, 'dataState'> | null {
  const candidate: unknown = Array.isArray(body) ? body[0] : body;
  if (typeof candidate !== 'object' || candidate === null) return null;

  const result = candidate as NominatimResult;
  const latitude = asCoordinateString(result.lat);
  const longitude = asCoordinateString(result.lon);
  if (latitude === null || longitude === null) return null;
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;

  const displayName = asText(result.display_name);
  if (!displayName) return null;

  const address = result.address ?? {};
  const name =
    asText(result.name) ??
    asText(address.city) ??
    asText(address.town) ??
    asText(address.village) ??
    asText(address.county) ??
    asText(address.state) ??
    displayName.split(',')[0]?.trim() ??
    displayName;

  return {
    name,
    latitude,
    longitude,
    displayName,
    locality: asText(address.city) ?? asText(address.town) ?? asText(address.village),
    region: asText(address.state),
    country: asText(address.country),
    postalCode: asText(address.postcode),
    source: 'nominatim',
    attribution: OSM_ATTRIBUTION,
  };
}

/**
 * Serialise calls to a rate-limited provider.
 *
 * A promise chain, not a mutex: each caller waits for the previous one to finish plus the
 * minimum interval. Bursts queue rather than fire in parallel, which is what Nominatim's
 * one-request-per-second rule actually requires.
 */
export class RateSerialiser {
  private chain: Promise<unknown> = Promise.resolve();
  private lastStartedAt = 0;

  constructor(private readonly minIntervalMs: number) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    const started = this.chain.then(async () => {
      const wait = Math.max(0, this.minIntervalMs - (Date.now() - this.lastStartedAt));
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastStartedAt = Date.now();
      return task();
    });
    // Keep the chain alive regardless of individual task outcomes.
    this.chain = started.then(
      () => undefined,
      () => undefined,
    );
    return started;
  }
}

@Injectable()
export class GeocodingProvider {
  private readonly logger = new Logger(GeocodingProvider.name);
  /** One serialiser per process: the limit is global to Nominatim, not per user. */
  private readonly nominatim = new RateSerialiser(NOMINATIM_MIN_INTERVAL_MS);

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly http: UpstreamHttpService,
    private readonly cache: GeoCacheService,
  ) {}

  private get userAgent(): string {
    return this.config.get('GEO_PROXY_USER_AGENT', { infer: true });
  }

  private get budget(): number {
    return this.config.get('GEO_PROXY_DAILY_BUDGET', { infer: true });
  }

  /**
   * Forward geocode: Photon first, Nominatim as fallback.
   *
   * Photon has no formal rate limit and is the polite first choice; Nominatim is used only
   * when Photon does not answer, and then strictly serialised.
   */
  async search(query: string): Promise<LoadResult<GeocodePlace>> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return { ok: false, reason: 'Query is too short', kind: 'invalid' };
    if (trimmed.length > MAX_QUERY_LENGTH) {
      return {
        ok: false,
        reason: `Query may not exceed ${MAX_QUERY_LENGTH} characters`,
        kind: 'invalid',
      };
    }

    const key = `geo:${trimmed.toLowerCase()}`;
    const outcome = await this.cache.resolve<GeocodePlace>({
      key,
      providerId: 'geocode',
      ttlMs: 5 * 60_000,
      staleTtlMs: 24 * 60 * 60_000,
      backoffMs: 120_000,
      dailyBudget: this.budget,
      loader: async () => {
        const photon = await this.http.getJson<unknown>({
          baseUrl: this.config.get('GEO_PROXY_PHOTON_BASE_URL', { infer: true }),
          path: '/api/',
          query: { q: trimmed, limit: 1 },
          maxResponseBytes: 1024 * 1024,
          timeoutMs: DEFAULT_UPSTREAM_BOUNDS.timeoutMs,
          userAgent: this.userAgent,
        });
        if (photon.ok) {
          const parsed = parsePhotonResponse(photon.value);
          if (parsed) return { ok: true, value: { ...parsed, dataState: 'live' as const } };
        } else {
          this.logger.debug(`Photon geocode failed (${photon.reason}); falling back to Nominatim`);
        }

        const nominatim = await this.nominatim.run(() =>
          this.http.getJson<unknown>({
            baseUrl: this.config.get('GEO_PROXY_NOMINATIM_BASE_URL', { infer: true }),
            path: '/search',
            query: { format: 'jsonv2', q: trimmed, limit: 1, addressdetails: 1 },
            maxResponseBytes: 1024 * 1024,
            timeoutMs: DEFAULT_UPSTREAM_BOUNDS.timeoutMs,
            userAgent: this.userAgent,
          }),
        );
        if (!nominatim.ok) {
          return {
            ok: false,
            reason: `Geocoding unavailable (${nominatim.reason})`,
            kind: 'upstream',
          };
        }
        const parsed = parseNominatimResponse(nominatim.value);
        if (!parsed) return { ok: false, reason: 'No matching place was found', kind: 'not_found' };
        return { ok: true, value: { ...parsed, dataState: 'live' as const } };
      },
    });

    return this.toResult(outcome);
  }

  /** Reverse geocode: coordinates to a place name. Cached in 0.1° cells. */
  async reverse(latitude: number, longitude: number): Promise<LoadResult<GeocodePlace>> {
    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
      return { ok: false, reason: 'Coordinates are out of range', kind: 'invalid' };
    }

    const key = cacheCellKey('revgeo', latitude, longitude);
    const outcome = await this.cache.resolve<GeocodePlace>({
      key,
      providerId: 'geocode',
      ttlMs: 60 * 60_000,
      staleTtlMs: 24 * 60 * 60_000,
      backoffMs: 120_000,
      dailyBudget: this.budget,
      loader: async () => {
        const result = await this.nominatim.run(() =>
          this.http.getJson<unknown>({
            baseUrl: this.config.get('GEO_PROXY_NOMINATIM_BASE_URL', { infer: true }),
            path: '/reverse',
            query: { format: 'jsonv2', lat: latitude, lon: longitude, addressdetails: 1 },
            maxResponseBytes: 1024 * 1024,
            timeoutMs: DEFAULT_UPSTREAM_BOUNDS.timeoutMs,
            userAgent: this.userAgent,
          }),
        );
        if (!result.ok) {
          return {
            ok: false,
            reason: `Reverse geocoding unavailable (${result.reason})`,
            kind: 'upstream',
          };
        }
        const parsed = parseNominatimResponse(result.value);
        if (!parsed)
          return {
            ok: false,
            reason: 'No place was found at those coordinates',
            kind: 'not_found',
          };
        return { ok: true, value: { ...parsed, dataState: 'live' as const } };
      },
    });

    return this.toResult(outcome);
  }

  /**
   * Reverse geocode for the SOS path.
   *
   * Differs from `reverse()` in three deliberate ways:
   *
   *  1. **Photon, not Nominatim.** Photon has no one-request-per-second rule, so an
   *     emergency never queues behind ordinary place searches. Going through the Nominatim
   *     serialiser could add seconds to an SOS, which is the one thing this path must not do.
   *  2. **`critical: true`**, so the daily budget and the failure backoff window cannot
   *     refuse or delay the lookup.
   *  3. **A much shorter timeout** (`GEO_EMERGENCY_TIMEOUT_MS`, default 2 s), because someone
   *     is waiting. The caller treats a timeout as "no description available", never as an
   *     error.
   */
  async reverseForEmergency(
    latitude: number,
    longitude: number,
  ): Promise<LoadResult<GeocodePlace>> {
    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
      return { ok: false, reason: 'Coordinates are out of range', kind: 'invalid' };
    }

    const key = cacheCellKey('sos-revgeo', latitude, longitude);
    const outcome = await this.cache.resolve<GeocodePlace>({
      key,
      providerId: 'sos-geocode',
      critical: true,
      ttlMs: 60 * 60_000,
      staleTtlMs: 7 * 24 * 60 * 60_000,
      backoffMs: 0,
      dailyBudget: 0,
      loader: async () => {
        const result = await this.http.getJson<unknown>({
          baseUrl: this.config.get('GEO_PROXY_PHOTON_BASE_URL', { infer: true }),
          path: '/reverse',
          query: { lat: latitude, lon: longitude, limit: 1 },
          maxResponseBytes: 256 * 1024,
          timeoutMs: this.config.get('GEO_EMERGENCY_TIMEOUT_MS', { infer: true }),
          userAgent: this.userAgent,
        });
        if (!result.ok) {
          return {
            ok: false,
            reason: `Emergency reverse geocoding unavailable (${result.reason})`,
            kind: 'upstream',
          };
        }
        const parsed = parsePhotonResponse(result.value);
        if (!parsed) {
          return {
            ok: false,
            reason: 'No place was found at those coordinates',
            kind: 'not_found',
          };
        }
        return { ok: true, value: { ...parsed, dataState: 'live' as const } };
      },
    });

    return this.toResult(outcome);
  }

  private toResult(outcome: CacheOutcome<GeocodePlace>): LoadResult<GeocodePlace> {
    if (outcome.status === 'unavailable')
      return { ok: false, reason: outcome.reason, kind: outcome.kind };
    if (outcome.status === 'stale') {
      return {
        ok: true,
        value: {
          ...outcome.value,
          dataState: 'stale',
          ageSeconds: Math.round(outcome.ageMs / 1000),
        },
      };
    }
    return { ok: true, value: outcome.value };
  }
}
