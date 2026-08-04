import { describe, expect, it } from 'vitest';
import { approximateCoordinates, estimateEtaMinutes, haversineDistanceM } from './geo.util';

describe('geo utilities', () => {
  it('calculates a realistic short distance', () => {
    const distance = haversineDistanceM(
      { latitude: 6.4551, longitude: 3.3942 },
      { latitude: 6.4651, longitude: 3.3942 },
    );
    expect(distance).toBeGreaterThan(1_100);
    expect(distance).toBeLessThan(1_120);
  });

  it('uses a stable privacy offset for approximate sharing', () => {
    const source = { latitude: 6.4551, longitude: 3.3942 };
    const first = approximateCoordinates(source, '50d6b456-ea47-4ff0-88d6-6ec57b98b120');
    const second = approximateCoordinates(source, '50d6b456-ea47-4ff0-88d6-6ec57b98b120');
    expect(first).toEqual(second);
    expect(haversineDistanceM(source, first)).toBeGreaterThan(100);
  });

  it('bounds impossible ETA speeds', () => {
    expect(estimateEtaMinutes(1_000, 10_000)).toBe(1);
    expect(estimateEtaMinutes(1_000, 0)).toBeGreaterThan(1);
  });
});
