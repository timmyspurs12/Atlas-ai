import { lookup } from 'node:dns/promises';
import { describe, expect, it } from 'vitest';

import { buildSosMessages, formatPlaceSummary } from '../safety/domain/sos-place.policy';
import { allAddressesRoutable } from './domain/upstream.policy';
import {
  parseNominatimResponse,
  parsePhotonResponse,
  type GeocodePlace,
} from './providers/geocoding.provider';
import {
  buildOsrmCoordinatePath,
  buildOsrmQuery,
  parseOsrmResponse,
} from './providers/routing.provider';
import { CURRENT_WEATHER_FIELDS, parseOpenMeteoResponse } from './providers/weather.provider';

/**
 * LIVE smoke test for the free geo providers.
 *
 * **Skipped unless `GEO_SMOKE=1` is set**, because it makes real outbound requests. It exists
 * because the unit tests in this directory all run against recorded fixtures: they prove the
 * parsers and the policy are correct, but they cannot prove that Photon, Nominatim, OSRM and
 * Open-Meteo actually answer, or — the thing that really matters for the SOS path — that they
 * answer *quickly enough* and with *usable coverage in Nigeria*.
 *
 * Run it from `apps/api`:
 *
 * ```sh
 * GEO_SMOKE=1 npx vitest run src/modules/geo-proxy/geo-smoke.spec.ts
 * ```
 *
 * It deliberately bypasses `UpstreamHttpService` (no Nest DI, no cache, no budget) and calls
 * the providers directly with the same URLs, query strings and User-Agent production uses,
 * then runs every response through the **real** production parsers. A green run therefore
 * means "these bytes parse into these words", not merely "the provider said 200".
 */

const RUN = process.env.GEO_SMOKE === '1';

const USER_AGENT =
  process.env.GEO_PROXY_USER_AGENT ?? 'AtlasAI/0.1 (+https://github.com/timmyspurs12/Atlas-ai)';

const PHOTON_BASE_URL = process.env.GEO_PROXY_PHOTON_BASE_URL ?? 'https://photon.komoot.io';
const NOMINATIM_BASE_URL =
  process.env.GEO_PROXY_NOMINATIM_BASE_URL ?? 'https://nominatim.openstreetmap.org';
const OPEN_METEO_BASE_URL =
  process.env.GEO_PROXY_OPEN_METEO_BASE_URL ?? 'https://api.open-meteo.com';
const OSRM_CAR_BASE_URL =
  process.env.GEO_PROXY_OSRM_CAR_BASE_URL ??
  'https://routing.openstreetmap.de/routed-car/route/v1/driving';

/** Must match `GEO_EMERGENCY_TIMEOUT_MS` in environment.ts — the SOS path gives up above this. */
const EMERGENCY_TIMEOUT_MS = Number(process.env.GEO_EMERGENCY_TIMEOUT_MS ?? 2000);

/** Ordinary lookups get a far longer leash; only emergencies are on a 2s clock. */
const ORDINARY_TIMEOUT_MS = 12_000;

interface SamplePoint {
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
  /**
   * Whether a usable place name is *required*. Rural/off-grid points are included precisely
   * because they may resolve to nothing — that is a finding to report, not a test failure,
   * and the SOS path already degrades to the no-place wording for them.
   */
  readonly expectName: boolean;
}

const NIGERIAN_POINTS: readonly SamplePoint[] = [
  { label: 'Maiduguri — Gamboru Market', latitude: 11.8467, longitude: 13.1571, expectName: true },
  { label: 'Lagos — Balogun Market', latitude: 6.4531, longitude: 3.3958, expectName: true },
  { label: 'Abuja — Wuse Market', latitude: 9.0765, longitude: 7.4986, expectName: true },
  { label: 'Kano — Kurmi Market', latitude: 12.0022, longitude: 8.5247, expectName: true },
  { label: 'Port Harcourt — centre', latitude: 4.8156, longitude: 7.0409, expectName: true },
  { label: 'Rural Borno (off-grid)', latitude: 11.42, longitude: 13.62, expectName: false },
];

const PROVIDER_HOSTS: readonly string[] = [
  'photon.komoot.io',
  'nominatim.openstreetmap.org',
  'routing.openstreetmap.de',
  'api.open-meteo.com',
];

/** `no-console` permits warn/error; a smoke report is for a human, so stderr is the right pipe. */
function report(line: string): void {
  console.warn(line);
}

interface FetchOutcome {
  readonly ok: boolean;
  readonly status: number;
  readonly ms: number;
  readonly body: unknown;
  readonly error: string | null;
}

/** Mirrors `UpstreamHttpService`: no redirects, an identifying User-Agent, and a hard deadline. */
async function fetchJson(url: string, timeoutMs: number): Promise<FetchOutcome> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text.slice(0, 300);
    }
    return {
      ok: response.ok,
      status: response.status,
      ms: Date.now() - started,
      body,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      body: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildUrl(
  baseUrl: string,
  path: string,
  query: Readonly<Record<string, string | number | boolean>>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) params.set(key, String(value));
  return `${baseUrl}${path}?${params.toString()}`;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  if (sorted.length % 2 === 0) {
    const low = sorted[middle - 1];
    const high = sorted[middle];
    return low !== undefined && high !== undefined ? (low + high) / 2 : 0;
  }
  return sorted[middle] ?? 0;
}

async function photonReverse(point: SamplePoint): Promise<{
  readonly outcome: FetchOutcome;
  readonly place: Omit<GeocodePlace, 'dataState'> | null;
}> {
  const outcome = await fetchJson(
    buildUrl(PHOTON_BASE_URL, '/reverse', {
      lat: point.latitude,
      lon: point.longitude,
      limit: 1,
    }),
    EMERGENCY_TIMEOUT_MS,
  );
  return { outcome, place: outcome.ok ? parsePhotonResponse(outcome.body) : null };
}

describe.runIf(RUN)('live geo provider smoke test', () => {
  it('resolves every provider host to publicly routable addresses (SSRF guard would permit them)', async () => {
    for (const host of PROVIDER_HOSTS) {
      const addresses = await lookup(host, { all: true });
      const routable = allAddressesRoutable(addresses.map((entry) => entry.address));
      report(
        `  ${routable ? 'PASS' : 'FAIL'}  ${host} -> ` +
          `${addresses.map((entry) => `${entry.address} (v${entry.family})`).join(', ')}`,
      );
      expect(routable, `${host} did not resolve to a publicly routable address`).toBe(true);
    }
  }, 30_000);

  it('Photon reverse geocodes Nigerian coordinates, fast enough for the SOS ceiling', async () => {
    const timings: number[] = [];
    const failures: string[] = [];
    let usableCount = 0;

    for (const point of NIGERIAN_POINTS) {
      const { outcome, place } = await photonReverse(point);
      timings.push(outcome.ms);

      const summary = place ? formatPlaceSummary(place) : null;
      if (summary) usableCount += 1;

      const verdict =
        outcome.error !== null
          ? `ERROR ${outcome.error}`
          : !outcome.ok
            ? `HTTP ${outcome.status}`
            : place === null
              ? 'parsed to NULL'
              : summary === null
                ? 'no usable name'
                : `"${summary}"`;
      report(
        `  ${String(outcome.ms).padStart(5)}ms  ${point.label.padEnd(30)} ${verdict}` +
          (point.expectName && !summary ? '   <-- EXPECTED A NAME' : ''),
      );

      if (point.expectName && !summary) failures.push(`${point.label}: ${verdict}`);
    }

    const medianMs = Math.round(median(timings));
    report('');
    report(
      `  timing: min ${Math.min(...timings)}ms / median ${medianMs}ms / max ${Math.max(...timings)}ms` +
        `   (SOS ceiling is ${EMERGENCY_TIMEOUT_MS}ms)`,
    );
    report(`  usable place names: ${usableCount}/${NIGERIAN_POINTS.length}`);

    expect(
      failures,
      `Photon reverse did not yield a usable place for: ${failures.join('; ')}`,
    ).toEqual([]);

    // The ceiling is a production contract, not a nice-to-have: above it the SOS silently
    // falls back to the no-place wording, so "Photon works" would be a false reassurance.
    expect(
      medianMs,
      `Median Photon reverse latency ${medianMs}ms exceeds the ${EMERGENCY_TIMEOUT_MS}ms SOS ceiling`,
    ).toBeLessThanOrEqual(EMERGENCY_TIMEOUT_MS);
  }, 60_000);

  it('turns a live Photon result into the actual SOS copy a contact would receive', async () => {
    const maiduguri = NIGERIAN_POINTS[0];
    if (!maiduguri) throw new Error('No sample point configured');

    const { place } = await photonReverse(maiduguri);
    expect(place, 'Photon returned no place for Maiduguri').not.toBeNull();
    if (!place) return;

    const messages = buildSosMessages({
      senderName: 'Maya Bello',
      place: {
        name: place.name,
        locality: place.locality,
        region: place.region,
        country: place.country,
      },
      trackingUrl: 'https://app.atlas.ng/sos/9f2c1a',
    });

    report('');
    report('  --- what a real contact would actually receive ---');
    report(`  SMS   (${messages.sms.length} chars): ${messages.sms}`);
    report(`  PUSH  (${messages.pushBody.length} chars): ${messages.pushBody}`);
    report(`  EMAIL: ${messages.emailPlaceParagraph ?? '(no place paragraph)'}`);

    expect(messages.sms).toContain('Near ');
    expect(messages.sms).toContain('https://app.atlas.ng/sos/9f2c1a');
    // Location must survive carrier truncation: the URL goes last, the place goes first.
    expect(messages.sms.indexOf('Near ')).toBeLessThan(messages.sms.indexOf('https://'));
    expect(messages.emailPlaceParagraph).not.toBeNull();
  }, 30_000);

  it('Photon forward search finds a named Nigerian market', async () => {
    const outcome = await fetchJson(
      buildUrl(PHOTON_BASE_URL, '/api/', { q: 'Gamboru Market Maiduguri', limit: 1 }),
      ORDINARY_TIMEOUT_MS,
    );
    expect(outcome.error, `Photon search errored: ${outcome.error}`).toBeNull();
    expect(outcome.ok, `Photon search returned HTTP ${outcome.status}`).toBe(true);

    const place = parsePhotonResponse(outcome.body);
    report(`  ${String(outcome.ms).padStart(5)}ms  forward search -> ${JSON.stringify(place)}`);
    expect(place, 'Photon search did not parse into a place').not.toBeNull();
  }, 30_000);

  it('Nominatim reverse (the ordinary, non-emergency path) works and parses', async () => {
    const maiduguri = NIGERIAN_POINTS[0];
    if (!maiduguri) throw new Error('No sample point configured');

    const outcome = await fetchJson(
      buildUrl(NOMINATIM_BASE_URL, '/reverse', {
        format: 'jsonv2',
        lat: maiduguri.latitude,
        lon: maiduguri.longitude,
        addressdetails: 1,
      }),
      ORDINARY_TIMEOUT_MS,
    );
    expect(outcome.error, `Nominatim errored: ${outcome.error}`).toBeNull();
    expect(outcome.ok, `Nominatim returned HTTP ${outcome.status}`).toBe(true);

    const place = parseNominatimResponse(outcome.body);
    report(
      `  ${String(outcome.ms).padStart(5)}ms  nominatim reverse -> ` +
        `${place ? `"${place.displayName}"` : 'NULL'}`,
    );
    expect(place, 'Nominatim reverse did not parse').not.toBeNull();
  }, 30_000);

  it('OSRM returns a drivable route between two Nigerian points', async () => {
    const from = { latitude: 6.5244, longitude: 3.3792 }; // Lagos Island
    const to = { latitude: 6.6018, longitude: 3.3515 }; // Ikeja

    const outcome = await fetchJson(
      buildUrl(OSRM_CAR_BASE_URL, `/${buildOsrmCoordinatePath([from, to])}`, buildOsrmQuery(false)),
      ORDINARY_TIMEOUT_MS,
    );
    expect(outcome.error, `OSRM errored: ${outcome.error}`).toBeNull();
    expect(outcome.ok, `OSRM returned HTTP ${outcome.status}`).toBe(true);

    const route = parseOsrmResponse(outcome.body, 'driving');
    report(
      `  ${String(outcome.ms).padStart(5)}ms  OSRM driving -> ` +
        `${route ? `${Math.round(route.distanceM / 1000)}km / ${Math.round(route.durationS / 60)}min` : 'NULL'}`,
    );
    expect(route, 'OSRM response did not parse into a route').not.toBeNull();
    if (route) {
      expect(route.distanceM).toBeGreaterThan(0);
      expect(route.durationS).toBeGreaterThan(0);
    }
  }, 30_000);

  it('Open-Meteo returns current weather for Nigerian coordinates', async () => {
    const maiduguri = NIGERIAN_POINTS[0];
    if (!maiduguri) throw new Error('No sample point configured');

    const outcome = await fetchJson(
      buildUrl(OPEN_METEO_BASE_URL, '/v1/forecast', {
        latitude: maiduguri.latitude.toFixed(4),
        longitude: maiduguri.longitude.toFixed(4),
        current: CURRENT_WEATHER_FIELDS,
        timezone: 'auto',
      }),
      ORDINARY_TIMEOUT_MS,
    );
    expect(outcome.error, `Open-Meteo errored: ${outcome.error}`).toBeNull();
    expect(outcome.ok, `Open-Meteo returned HTTP ${outcome.status}`).toBe(true);

    const weather = parseOpenMeteoResponse(outcome.body);
    report(
      `  ${String(outcome.ms).padStart(5)}ms  Open-Meteo current -> ` +
        `${weather ? `${weather.temperatureC ?? '?'}°C, "${weather.summary}"` : 'NULL'}`,
    );
    expect(weather, 'Open-Meteo response did not parse').not.toBeNull();
  }, 30_000);
});
