import { describe, expect, it } from 'vitest';
import {
  buildPublicJourneyRouteResult,
  evaluateRouteForPublicUse,
  selectPublicFareEstimate,
  type FareObservationCandidate,
  type PublicRouteCandidate,
} from './transit-publication.policy';

const NOW = new Date('2026-08-06T12:00:00.000Z');

function approvedPlace(id: string) {
  return {
    id,
    name: id,
    verificationStatus: 'APPROVED' as const,
    isActive: true,
    deletedAt: null,
  };
}

function publishedRoute(): PublicRouteCandidate {
  const origin = approvedPlace('origin');
  const destination = approvedPlace('destination');
  return {
    id: 'route-1',
    code: 'NG-LA-TEST-1',
    name: 'Verified test route',
    status: 'PUBLISHED',
    deletedAt: null,
    publishedAt: new Date('2026-08-05T12:00:00.000Z'),
    lastVerifiedAt: new Date('2026-08-05T12:00:00.000Z'),
    originPlace: origin,
    destinationPlace: destination,
    stops: [
      { id: 'stop-1', stopOrder: 0, deletedAt: null, place: origin },
      { id: 'stop-2', stopOrder: 1, deletedAt: null, place: destination },
    ],
    currentRevision: {
      id: 'revision-1',
      createdById: 'editor-1',
      submittedAt: new Date('2026-08-04T12:00:00.000Z'),
      deletedAt: null,
      reviews: [
        {
          reviewerId: 'reviewer-1',
          status: 'APPROVED',
          reviewedAt: new Date('2026-08-05T10:00:00.000Z'),
          deletedAt: null,
        },
      ],
    },
  };
}

function freshFare(): FareObservationCandidate {
  return {
    id: 'fare-fresh',
    amountMinKobo: 120_000,
    amountMaxKobo: 150_000,
    currencyCode: 'NGN',
    confidenceScore: 85,
    observedAt: new Date('2026-08-05T09:00:00.000Z'),
    validUntil: new Date('2026-08-20T00:00:00.000Z'),
    deletedAt: null,
  };
}

describe('transit publication policy', () => {
  it('never exposes a draft route', () => {
    const route = publishedRoute();
    route.status = 'DRAFT';

    const result = buildPublicJourneyRouteResult(route, [freshFare()], NOW);

    expect(result).toBeNull();
    expect(evaluateRouteForPublicUse(route).reasons).toContain('ROUTE_NOT_PUBLISHED');
  });

  it('never exposes a route containing a pending stop', () => {
    const route = publishedRoute();
    const pendingStop = route.stops[1];
    if (!pendingStop) throw new Error('Fixture stop missing');
    pendingStop.place = {
      ...pendingStop.place,
      verificationStatus: 'PENDING',
    };

    expect(buildPublicJourneyRouteResult(route, [freshFare()], NOW)).toBeNull();
    expect(evaluateRouteForPublicUse(route).reasons).toContain('STOP_NOT_APPROVED');
  });

  it('never exposes a route without an independently approved current revision', () => {
    const route = publishedRoute();
    if (!route.currentRevision) throw new Error('Fixture revision missing');
    route.currentRevision.reviews = [
      {
        reviewerId: route.currentRevision.createdById,
        status: 'APPROVED',
        reviewedAt: new Date('2026-08-05T10:00:00.000Z'),
        deletedAt: null,
      },
    ];

    expect(buildPublicJourneyRouteResult(route, [freshFare()], NOW)).toBeNull();
    expect(evaluateRouteForPublicUse(route).reasons).toContain('CURRENT_REVISION_NOT_APPROVED');
  });

  it('fails closed when an approved revision also has a blocking review', () => {
    const route = publishedRoute();
    if (!route.currentRevision) throw new Error('Fixture revision missing');
    route.currentRevision.reviews.push({
      reviewerId: 'reviewer-2',
      status: 'CHANGES_REQUESTED',
      reviewedAt: new Date('2026-08-05T11:00:00.000Z'),
      deletedAt: null,
    });

    expect(buildPublicJourneyRouteResult(route, [freshFare()], NOW)).toBeNull();
    expect(evaluateRouteForPublicUse(route).reasons).toContain(
      'CURRENT_REVISION_HAS_BLOCKING_REVIEW',
    );
  });

  it('never includes a stale fare in a public result', () => {
    const staleFare: FareObservationCandidate = {
      ...freshFare(),
      id: 'fare-stale',
      amountMinKobo: 250_000,
      amountMaxKobo: 300_000,
      observedAt: new Date('2026-05-01T12:00:00.000Z'),
      validUntil: null,
    };

    const result = buildPublicJourneyRouteResult(publishedRoute(), [staleFare], NOW);

    expect(result).not.toBeNull();
    expect(result?.fare).toBeNull();
    expect(JSON.stringify(result)).not.toContain('250000');
    expect(result?.fareNotice).toMatch(/unavailable/i);
  });

  it('selects the highest-confidence recent valid fare', () => {
    const lowerConfidence = {
      ...freshFare(),
      id: 'fare-lower-confidence',
      confidenceScore: 60,
      observedAt: new Date('2026-08-06T08:00:00.000Z'),
    };
    const selected = selectPublicFareEstimate([lowerConfidence, freshFare()], NOW);

    expect(selected?.observationId).toBe('fare-fresh');
  });

  it('allows a fully approved route and recent fare', () => {
    const result = buildPublicJourneyRouteResult(publishedRoute(), [freshFare()], NOW);

    expect(result).toMatchObject({
      routeId: 'route-1',
      code: 'NG-LA-TEST-1',
      fare: {
        amountMinKobo: 120_000,
        amountMaxKobo: 150_000,
        currencyCode: 'NGN',
      },
    });
  });
});
