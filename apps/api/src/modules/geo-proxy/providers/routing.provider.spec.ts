import { describe, expect, it } from 'vitest';
import { buildOsrmCoordinatePath, buildOsrmQuery, parseOsrmResponse } from './routing.provider';

const maiduguri = { latitude: 11.8464, longitude: 13.1603 };
const konduga = { latitude: 11.6544, longitude: 13.4139 };

/** Shape returned by OSRM `/route/v1/{profile}/{coords}`, recorded from the documented API. */
const osrmOk = {
  code: 'Ok',
  routes: [
    {
      distance: 34_512.7,
      duration: 2_418.3,
      legs: [
        { distance: 20_100.2, duration: 1_405.1 },
        { distance: 14_412.5, duration: 1_013.2 },
      ],
    },
  ],
  waypoints: [{ name: 'Maiduguri' }, { name: 'Konduga' }],
};

describe('OSRM request construction', () => {
  it('emits LONGITUDE,LATITUDE — the reverse of every other coordinate order in this API', () => {
    // OSRM's coordinate order is the single easiest way to silently route someone to the
    // wrong hemisphere, so it is pinned by a test.
    expect(buildOsrmCoordinatePath([maiduguri, konduga])).toBe(
      '13.160300,11.846400;13.413900,11.654400',
    );
  });

  it('rounds to six decimals so cache keys stay stable', () => {
    expect(buildOsrmCoordinatePath([{ latitude: 11.846400001, longitude: 13.1603000002 }])).toBe(
      '13.160300,11.846400',
    );
  });

  it('requests the small response shape unless steps are explicitly needed', () => {
    expect(buildOsrmQuery(false)).toEqual({
      overview: 'false',
      alternatives: 'false',
      annotations: 'false',
      steps: false,
    });
    expect(buildOsrmQuery(true).steps).toBe(true);
  });
});

describe('OSRM response parsing', () => {
  it('parses a valid response into metres, seconds and an ETA', () => {
    const parsed = parseOsrmResponse(osrmOk, 'driving');
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      profile: 'driving',
      distanceM: 34_513,
      durationS: 2_418,
      etaMinutes: 41,
      attribution: expect.stringContaining('OpenStreetMap'),
    });
    expect(parsed?.legs).toHaveLength(2);
    expect(parsed?.legs[0]).toEqual({ distanceM: 20_100, durationS: 1_405 });
  });

  it('always carries ODbL attribution with the result', () => {
    const parsed = parseOsrmResponse(osrmOk, 'walking');
    expect(parsed?.attribution).toContain('ODbL');
    expect(parsed?.attribution).toContain('FOSSGIS');
  });

  it('rejects a non-Ok code', () => {
    expect(parseOsrmResponse({ ...osrmOk, code: 'NotFound' }, 'driving')).toBeNull();
    expect(parseOsrmResponse({ code: 'InvalidUrl' }, 'driving')).toBeNull();
  });

  it('rejects structural nonsense rather than inventing a route', () => {
    expect(parseOsrmResponse(null, 'driving')).toBeNull();
    expect(parseOsrmResponse('nope', 'driving')).toBeNull();
    expect(parseOsrmResponse({ code: 'Ok' }, 'driving')).toBeNull();
    expect(parseOsrmResponse({ code: 'Ok', routes: [] }, 'driving')).toBeNull();
    expect(parseOsrmResponse({ code: 'Ok', routes: 'x' }, 'driving')).toBeNull();
  });

  it('rejects missing or negative distance and duration', () => {
    const withoutDistance = { code: 'Ok', routes: [{ duration: 100, legs: [] }] };
    expect(parseOsrmResponse(withoutDistance, 'driving')).toBeNull();

    const negative = { code: 'Ok', routes: [{ distance: -5, duration: 100, legs: [] }] };
    expect(parseOsrmResponse(negative, 'driving')).toBeNull();

    const notNumbers = { code: 'Ok', routes: [{ distance: '34512', duration: '2418' }] };
    expect(parseOsrmResponse(notNumbers, 'driving')).toBeNull();
  });

  it('skips malformed legs but still returns the route total', () => {
    const partial = {
      code: 'Ok',
      routes: [{ distance: 1_000, duration: 600, legs: [{ distance: 1_000 }, 'junk', null] }],
    };
    const parsed = parseOsrmResponse(partial, 'cycling');
    expect(parsed?.distanceM).toBe(1_000);
    expect(parsed?.legs).toHaveLength(0);
  });

  it('survives a missing legs array entirely', () => {
    const parsed = parseOsrmResponse(
      { code: 'Ok', routes: [{ distance: 500, duration: 300 }] },
      'driving',
    );
    expect(parsed?.distanceM).toBe(500);
    expect(parsed?.legs).toEqual([]);
  });
});
