import { describe, expect, it } from 'vitest';
import { evaluateCoveragePromotion, type CoverageMetrics } from './transit-coverage.policy';

const now = new Date('2026-08-10T12:00:00.000Z');
const betaReady: CoverageMetrics = {
  approvedPlaceCount: 1,
  publishedRouteCount: 1,
  completeRouteCount: 1,
  freshFareRouteCount: 0,
  lowestRouteConfidence: 80,
  staleRouteCount: 0,
  lastSurveyedAt: new Date('2026-08-09T12:00:00.000Z'),
};

describe('evaluateCoveragePromotion', () => {
  it('allows beta without fabricating a fare when route quality is sufficient', () => {
    expect(evaluateCoveragePromotion('BETA', betaReady, now)).toEqual({
      allowed: true,
      reasons: [],
    });
  });

  it('blocks beta when route durations are incomplete', () => {
    const result = evaluateCoveragePromotion('BETA', { ...betaReady, completeRouteCount: 0 }, now);
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain(
      'Every published route requires complete stops, segments, and durations',
    );
  });

  it('applies stricter thresholds to verified coverage', () => {
    const result = evaluateCoveragePromotion('VERIFIED', betaReady, now);
    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'At least 5 approved transit place(s) required',
        'At least 3 published route(s) required',
        'Every verified-area route requires a recent reviewed fare observation',
      ]),
    );
  });

  it('always allows a reviewer to suspend public coverage', () => {
    expect(
      evaluateCoveragePromotion('SUSPENDED', { ...betaReady, publishedRouteCount: 0 }, now).allowed,
    ).toBe(true);
  });
});
