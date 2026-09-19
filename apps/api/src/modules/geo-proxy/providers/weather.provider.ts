import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../../config/environment';
import { GeoCacheService, type LoadResult } from '../geo-cache.service';
import { UpstreamHttpService } from '../upstream-http.service';
import {
  DEFAULT_UPSTREAM_BOUNDS,
  cacheCellKey,
  isValidLatitude,
  isValidLongitude,
} from '../domain/upstream.policy';

export type WeatherSeverity = 'calm' | 'advisory' | 'severe';

export interface CurrentWeather {
  readonly observedAt: string | null;
  readonly temperatureC: number | null;
  readonly apparentTemperatureC: number | null;
  readonly precipitationMm: number | null;
  readonly windSpeedKmh: number | null;
  readonly windDirectionDegrees: number | null;
  readonly visibilityM: number | null;
  readonly weatherCode: number | null;
  readonly summary: string;
  /**
   * Safety-relevant classification, not a forecast. Used to decide whether a trip or SOS
   * context should carry a weather note at all.
   */
  readonly severity: WeatherSeverity;
  readonly attribution: string;
  readonly dataState: 'live' | 'stale';
  readonly ageSeconds?: number;
}

export const OPEN_METEO_ATTRIBUTION = 'Weather data by Open-Meteo.com';

/**
 * ⚠️ LICENCE: Open-Meteo's free tier is for NON-COMMERCIAL use. A commercial launch of
 * Atlas requires a paid Open-Meteo plan or a different provider. This is tracked in
 * THIRD_PARTY_NOTICES.md — do not remove this warning when refactoring.
 */

/** WMO 4677 present-weather codes as used by Open-Meteo's `weather_code`. */
const WMO_SUMMARIES: Readonly<Record<number, string>> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snowfall',
  73: 'Snowfall',
  75: 'Heavy snowfall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

/** Codes that warrant a safety note: freezing, thunderstorms, violent precipitation, fog. */
const SEVERE_CODES = new Set([56, 57, 66, 67, 75, 82, 86, 95, 96, 99]);
const ADVISORY_CODES = new Set([45, 48, 55, 61, 63, 65, 71, 73, 77, 80, 81, 85]);

export function describeWeatherCode(code: number | null): string {
  if (code === null) return 'Conditions unavailable';
  return WMO_SUMMARIES[code] ?? `Unrecognised weather code ${code}`;
}

export function classifyWeatherSeverity(code: number | null): WeatherSeverity {
  if (code === null) return 'calm';
  if (SEVERE_CODES.has(code)) return 'severe';
  if (ADVISORY_CODES.has(code)) return 'advisory';
  return 'calm';
}

export const CURRENT_WEATHER_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'visibility',
].join(',');

function optionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

/**
 * Narrow an Open-Meteo `current` block.
 *
 * Every field is optional: `visibility` in particular is not returned for all regions or
 * models, and a parser that assumed its presence would fail on exactly the requests where
 * reduced visibility matters most.
 */
export function parseOpenMeteoResponse(body: unknown): Omit<CurrentWeather, 'dataState'> | null {
  if (typeof body !== 'object' || body === null) return null;
  const current = (body as { current?: unknown }).current;
  if (typeof current !== 'object' || current === null) return null;

  const block = current as Record<string, unknown>;
  const code = optionalNumber(block.weather_code);

  return {
    observedAt: typeof block.time === 'string' ? block.time : null,
    temperatureC: optionalNumber(block.temperature_2m),
    apparentTemperatureC: optionalNumber(block.apparent_temperature),
    precipitationMm: optionalNumber(block.precipitation),
    windSpeedKmh: optionalNumber(block.wind_speed_10m),
    windDirectionDegrees: optionalNumber(block.wind_direction_10m),
    visibilityM: optionalNumber(block.visibility),
    weatherCode: code,
    summary: describeWeatherCode(code),
    severity: classifyWeatherSeverity(code),
    attribution: OPEN_METEO_ATTRIBUTION,
  };
}

@Injectable()
export class WeatherProvider {
  private readonly logger = new Logger(WeatherProvider.name);

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly http: UpstreamHttpService,
    private readonly cache: GeoCacheService,
  ) {}

  /**
   * Current conditions for a location, cached in 0.1° cells (~11 km).
   *
   * Cell-based caching is the single most effective cost control here: a city's worth of
   * users asking for weather collapse into one upstream call per 5 minutes.
   */
  async current(latitude: number, longitude: number): Promise<LoadResult<CurrentWeather>> {
    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
      return { ok: false, reason: 'Coordinates are out of range', kind: 'invalid' };
    }

    const key = cacheCellKey('wx', latitude, longitude);
    const outcome = await this.cache.resolve<CurrentWeather>({
      key,
      providerId: 'open-meteo',
      ttlMs: 5 * 60_000,
      staleTtlMs: 30 * 60_000,
      backoffMs: 120_000,
      dailyBudget: this.config.get('GEO_PROXY_DAILY_BUDGET', { infer: true }),
      loader: async () => {
        const result = await this.http.getJson<unknown>({
          baseUrl: this.config.get('GEO_PROXY_OPEN_METEO_BASE_URL', { infer: true }),
          path: '/v1/forecast',
          query: {
            latitude: latitude.toFixed(4),
            longitude: longitude.toFixed(4),
            current: CURRENT_WEATHER_FIELDS,
            timezone: 'auto',
          },
          maxResponseBytes: 256 * 1024,
          timeoutMs: DEFAULT_UPSTREAM_BOUNDS.timeoutMs,
          userAgent: this.config.get('GEO_PROXY_USER_AGENT', { infer: true }),
        });
        if (!result.ok) {
          this.logger.warn(`Open-Meteo request failed: ${result.reason}`);
          return { ok: false, reason: `Weather unavailable (${result.reason})`, kind: 'upstream' };
        }
        const parsed = parseOpenMeteoResponse(result.value);
        if (!parsed)
          return {
            ok: false,
            reason: 'Weather provider returned an unusable response',
            kind: 'upstream',
          };
        return { ok: true, value: { ...parsed, dataState: 'live' as const } };
      },
    });

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
