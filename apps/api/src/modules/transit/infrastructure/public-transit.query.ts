import {
  TransitReviewStatus,
  TransitRouteStatus,
  type Prisma,
} from '../../../generated/prisma/client';
import {
  PUBLIC_FARE_MAX_AGE_DAYS,
  PUBLIC_FARE_MIN_CONFIDENCE,
  PUBLIC_ROUTE_MIN_CONFIDENCE,
} from '../domain/transit-publication.policy';

const approvedActivePlace = {
  is: {
    verificationStatus: TransitReviewStatus.APPROVED,
    isActive: true,
    deletedAt: null,
  },
} as const;

export function buildPublicTransitRouteWhere(): Prisma.TransitRouteWhereInput {
  return {
    status: TransitRouteStatus.PUBLISHED,
    deletedAt: null,
    publishedAt: { not: null },
    publishedById: { not: null },
    lastVerifiedAt: { not: null },
    currentRevisionId: { not: null },
    confidenceScore: { gte: PUBLIC_ROUTE_MIN_CONFIDENCE },
    currentRevision: {
      is: {
        deletedAt: null,
        submittedAt: { not: null },
        reviews: {
          some: {
            status: TransitReviewStatus.APPROVED,
            reviewedAt: { not: null },
            deletedAt: null,
          },
          none: {
            status: {
              in: [TransitReviewStatus.REJECTED, TransitReviewStatus.CHANGES_REQUESTED],
            },
            deletedAt: null,
          },
        },
      },
    },
    originPlace: approvedActivePlace,
    destinationPlace: approvedActivePlace,
    stops: {
      some: { deletedAt: null },
      every: {
        OR: [
          { deletedAt: { not: null } },
          {
            deletedAt: null,
            place: approvedActivePlace,
          },
        ],
      },
    },
  };
}

export function buildPublicFareObservationWhere(
  now: Date,
  maxAgeDays = PUBLIC_FARE_MAX_AGE_DAYS,
): Prisma.TransitFareObservationWhereInput {
  const oldestAllowed = new Date(now.getTime() - maxAgeDays * 86_400_000);
  return {
    deletedAt: null,
    currencyCode: 'NGN',
    confidenceScore: { gte: PUBLIC_FARE_MIN_CONFIDENCE, lte: 100 },
    observedAt: { gte: oldestAllowed, lte: now },
    OR: [{ validUntil: null }, { validUntil: { gt: now } }],
  };
}
