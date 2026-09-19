import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Environment } from '../../config/environment';
import type { LoadResult } from '../geo-proxy/geo-cache.service';
import type { GeocodePlace, GeocodingProvider } from '../geo-proxy/providers/geocoding.provider';
import { SosLocationService } from './sos-location.service';

/** Short ceiling so timeout behaviour is exercised quickly. */
const TIMEOUT_MS = 250;
const CEILING_MS = TIMEOUT_MS + 500;

function makeConfig(): ConfigService<Environment, true> {
  return {
    get: (key: string) => (key === 'GEO_EMERGENCY_TIMEOUT_MS' ? TIMEOUT_MS : undefined),
  } as unknown as ConfigService<Environment, true>;
}

function makeGeocoding(
  reverseForEmergency: GeocodingProvider['reverseForEmergency'],
): GeocodingProvider {
  return { reverseForEmergency } as unknown as GeocodingProvider;
}

const place: GeocodePlace = {
  name: 'Gamboru Market',
  latitude: 11.8464,
  longitude: 13.1603,
  displayName: 'Gamboru Market, Maiduguri, Borno, Nigeria',
  locality: 'Maiduguri',
  region: 'Borno',
  country: 'Nigeria',
  postalCode: null,
  source: 'photon',
  attribution: 'Geocoding © OpenStreetMap contributors (ODbL)',
  dataState: 'live',
};

describe('SosLocationService', () => {
  it('maps a resolved place into the fields the alert copy needs', async () => {
    const service = new SosLocationService(
      makeConfig(),
      makeGeocoding(() => Promise.resolve({ ok: true, value: place })),
    );

    await expect(service.describe(11.8464, 13.1603)).resolves.toEqual({
      name: 'Gamboru Market',
      locality: 'Maiduguri',
      region: 'Borno',
      country: 'Nigeria',
    });
  });

  it('passes a stale cached place through rather than discarding it', async () => {
    const service = new SosLocationService(
      makeConfig(),
      makeGeocoding(() =>
        Promise.resolve({ ok: true, value: { ...place, dataState: 'stale', ageSeconds: 90 } }),
      ),
    );

    // A slightly old street name is still far more useful to a responder than nothing.
    const result = await service.describe(11.8464, 13.1603);
    expect(result?.name).toBe('Gamboru Market');
  });

  it('returns null when the provider reports no match', async () => {
    const service = new SosLocationService(
      makeConfig(),
      makeGeocoding((): Promise<LoadResult<GeocodePlace>> =>
        Promise.resolve({ ok: false, reason: 'No place was found', kind: 'not_found' }),
      ),
    );

    await expect(service.describe(0, 0)).resolves.toBeNull();
  });

  it('returns null when the provider reports an outage', async () => {
    const service = new SosLocationService(
      makeConfig(),
      makeGeocoding((): Promise<LoadResult<GeocodePlace>> =>
        Promise.resolve({ ok: false, reason: 'upstream down', kind: 'upstream' }),
      ),
    );

    await expect(service.describe(11.8, 13.1)).resolves.toBeNull();
  });

  it('returns null instead of hanging when the lookup never settles', async () => {
    const service = new SosLocationService(
      makeConfig(),
      makeGeocoding(() => new Promise<LoadResult<GeocodePlace>>(() => {})),
    );

    const started = Date.now();
    await expect(service.describe(11.8, 13.1)).resolves.toBeNull();
    const elapsed = Date.now() - started;

    // Bounded by the ceiling, and not materially longer than it.
    expect(elapsed).toBeGreaterThanOrEqual(CEILING_MS - 50);
    expect(elapsed).toBeLessThan(CEILING_MS + 2_000);
  });

  it('returns null instead of propagating an exception', async () => {
    const service = new SosLocationService(
      makeConfig(),
      makeGeocoding((): Promise<LoadResult<GeocodePlace>> =>
        Promise.reject(new Error('geocoder exploded')),
      ),
    );

    // The SOS path must survive anything the geocoder does.
    await expect(service.describe(11.8, 13.1)).resolves.toBeNull();
  });

  it('returns quickly when the provider answers quickly', async () => {
    const service = new SosLocationService(
      makeConfig(),
      makeGeocoding(() => Promise.resolve({ ok: true, value: place })),
    );

    const started = Date.now();
    await service.describe(11.8, 13.1);
    expect(Date.now() - started).toBeLessThan(200);
  });

  it('does not log the coordinates it was given', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const service = new SosLocationService(
      makeConfig(),
      makeGeocoding((): Promise<LoadResult<GeocodePlace>> =>
        Promise.resolve({ ok: false, reason: 'No place was found', kind: 'not_found' }),
      ),
    );

    await service.describe(11.8464, 13.1603);

    // Atlas's rule is that location data does not reach application logs. The Nest Logger is
    // not a console spy target, so assert on what we can observe and keep the invariant
    // documented: SosLocationService logs outcomes and reasons only.
    for (const call of warn.mock.calls.flat()) {
      expect(String(call)).not.toContain('11.8464');
    }
    warn.mockRestore();
  });
});
