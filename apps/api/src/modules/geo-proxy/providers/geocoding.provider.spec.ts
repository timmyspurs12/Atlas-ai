import { describe, expect, it } from 'vitest';
import { RateSerialiser, parseNominatimResponse, parsePhotonResponse } from './geocoding.provider';

/** Photon (komoot) returns GeoJSON; coordinate order is [longitude, latitude]. */
const photonBody = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [13.1603, 11.8464] },
      properties: {
        name: 'Maiduguri',
        city: 'Maiduguri',
        state: 'Borno',
        country: 'Nigeria',
        postcode: '600233',
        type: 'city',
      },
    },
  ],
};

/** Nominatim jsonv2 reports coordinates as STRINGS — the classic parsing trap. */
const nominatimSearchBody = [
  {
    place_id: 1_234,
    lat: '11.8464000',
    lon: '13.1603000',
    display_name: 'Maiduguri, Borno, Nigeria',
    address: {
      city: 'Maiduguri',
      state: 'Borno',
      country: 'Nigeria',
      postcode: '600233',
    },
  },
];

const nominatimReverseBody = {
  lat: '11.8464',
  lon: '13.1603',
  display_name: 'Maiduguri, Borno, Nigeria',
  address: { town: 'Maiduguri', state: 'Borno', country: 'Nigeria' },
};

describe('Photon parsing', () => {
  it('maps GeoJSON [lon, lat] to the right fields', () => {
    const parsed = parsePhotonResponse(photonBody);
    expect(parsed).toMatchObject({
      name: 'Maiduguri',
      latitude: 11.8464,
      longitude: 13.1603,
      locality: 'Maiduguri',
      region: 'Borno',
      country: 'Nigeria',
      postalCode: '600233',
      source: 'photon',
    });
  });

  it('does not duplicate the name into the display name', () => {
    expect(parsePhotonResponse(photonBody)?.displayName).toBe('Maiduguri, Borno, Nigeria');
  });

  it('falls back to city or state when name is absent', () => {
    const noName = {
      ...photonBody,
      features: [{ geometry: { coordinates: [13.1, 11.8] }, properties: { city: 'Konduga' } }],
    };
    expect(parsePhotonResponse(noName)?.name).toBe('Konduga');
  });

  it('rejects empty results and malformed geometry', () => {
    expect(parsePhotonResponse({ type: 'FeatureCollection', features: [] })).toBeNull();
    expect(parsePhotonResponse({ features: [{}] })).toBeNull();
    expect(
      parsePhotonResponse({
        features: [{ geometry: { coordinates: [] }, properties: { name: 'x' } }],
      }),
    ).toBeNull();
    expect(parsePhotonResponse(null)).toBeNull();
    expect(parsePhotonResponse('nope')).toBeNull();
  });

  it('rejects coordinates outside valid ranges', () => {
    const bad = {
      features: [{ geometry: { coordinates: [13.1, 999] }, properties: { name: 'x' } }],
    };
    expect(parsePhotonResponse(bad)).toBeNull();
  });
});

describe('Nominatim parsing', () => {
  it('parses a search array and converts string coordinates to numbers', () => {
    const parsed = parseNominatimResponse(nominatimSearchBody);
    expect(parsed).toMatchObject({
      name: 'Maiduguri',
      latitude: 11.8464,
      longitude: 13.1603,
      source: 'nominatim',
    });
  });

  it('parses a reverse single-object response', () => {
    const parsed = parseNominatimResponse(nominatimReverseBody);
    expect(parsed?.displayName).toBe('Maiduguri, Borno, Nigeria');
    expect(parsed?.locality).toBe('Maiduguri');
  });

  it('derives a name from address parts when none is given', () => {
    const parsed = parseNominatimResponse({
      lat: '11.8',
      lon: '13.1',
      display_name: 'Some Road, Maiduguri, Borno',
      address: { state: 'Borno' },
    });
    expect(parsed?.name).toBe('Borno');
  });

  it('falls back to the first display-name segment as a last resort', () => {
    const parsed = parseNominatimResponse({
      lat: '11.8',
      lon: '13.1',
      display_name: 'Konduga, Borno, Nigeria',
      address: {},
    });
    expect(parsed?.name).toBe('Konduga');
  });

  it('rejects missing display name and non-numeric coordinates', () => {
    expect(parseNominatimResponse([{ lat: '11.8', lon: '13.1' }])).toBeNull();
    expect(parseNominatimResponse([{ lat: 'nope', lon: '13.1', display_name: 'x' }])).toBeNull();
    expect(parseNominatimResponse([])).toBeNull();
    expect(parseNominatimResponse(undefined)).toBeNull();
  });

  it('always carries ODbL attribution', () => {
    expect(parseNominatimResponse(nominatimSearchBody)?.attribution).toContain('OpenStreetMap');
  });
});

describe('RateSerialiser', () => {
  it('enforces the minimum interval between calls', async () => {
    const serialiser = new RateSerialiser(40);
    const startedAt = Date.now();

    await Promise.all([
      serialiser.run(() => Promise.resolve('a')),
      serialiser.run(() => Promise.resolve('b')),
      serialiser.run(() => Promise.resolve('c')),
    ]);

    // Three tasks means two enforced gaps of 40 ms.
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(75);
  });

  it('runs tasks in submission order, never in parallel', async () => {
    const serialiser = new RateSerialiser(1);
    const order: string[] = [];
    let concurrent = 0;
    let maxConcurrent = 0;

    await Promise.all(
      ['a', 'b', 'c', 'd'].map((label) =>
        serialiser.run(async () => {
          concurrent += 1;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          order.push(label);
          await new Promise((resolve) => setTimeout(resolve, 5));
          concurrent -= 1;
          return label;
        }),
      ),
    );

    expect(order).toEqual(['a', 'b', 'c', 'd']);
    expect(maxConcurrent).toBe(1);
  });

  it('keeps the chain alive after a task rejects', async () => {
    const serialiser = new RateSerialiser(1);
    const failing = serialiser.run((): Promise<string> => Promise.reject(new Error('boom')));
    await expect(failing).rejects.toThrow('boom');

    // The serialiser must still work for later callers.
    await expect(serialiser.run(() => Promise.resolve('after'))).resolves.toBe('after');
  });
});
