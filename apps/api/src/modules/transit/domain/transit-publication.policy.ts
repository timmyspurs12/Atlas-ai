export const PUBLIC_FARE_MAX_AGE_DAYS = 30;
export const PUBLIC_FARE_MIN_CONFIDENCE = 50;

export type PublicRouteBlockReason =
  | 'ROUTE_NOT_PUBLISHED'
  | 'ROUTE_DELETED'
  | 'ROUTE_NOT_VERIFIED'
  | 'ORIGIN_NOT_APPROVED'
  | 'DESTINATION_NOT_APPROVED'
  | 'INSUFFICIENT_ACTIVE_STOPS'
  | 'STOP_NOT_APPROVED'
  | 'CURRENT_REVISION_MISSING'
  | 'CURRENT_REVISION_NOT_SUBMITTED'
  | 'CURRENT_REVISION_NOT_APPROVED'
  | 'CURRENT_REVISION_HAS_BLOCKING_REVIEW';

type ReviewStatus = 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';
type RouteStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'SUSPENDED' | 'RETIRED';

type VerificationStatus = ReviewStatus;

export interface PublicPlaceCandidate {
  id: string;
  name: string;
  verificationStatus: VerificationStatus;
  isActive: boolean;
  deletedAt: Date | null;
}

export interface PublicRouteStopCandidate {
  id: string;
  stopOrder: number;
  deletedAt: Date | null;
  place: PublicPlaceCandidate;
}

export interface PublicRouteReviewCandidate {
  reviewerId: string;
  status: ReviewStatus;
  reviewedAt: Date | null;
  deletedAt: Date | null;
}

export interface PublicRouteRevisionCandidate {
  id: string;
  createdById: string;
  submittedAt: Date | null;
  deletedAt: Date | null;
  reviews: PublicRouteReviewCandidate[];
}

export interface PublicRouteCandidate {
  id: string;
  code: string;
  name: string;
  status: RouteStatus;
  deletedAt: Date | null;
  publishedAt: Date | null;
  lastVerifiedAt: Date | null;
  originPlace: PublicPlaceCandidate;
  destinationPlace: PublicPlaceCandidate;
  stops: PublicRouteStopCandidate[];
  currentRevision: PublicRouteRevisionCandidate | null;
}

export interface FareObservationCandidate {
  id: string;
  amountMinKobo: number;
  amountMaxKobo: number;
  currencyCode: string;
  confidenceScore: number;
  observedAt: Date;
  validUntil: Date | null;
  deletedAt: Date | null;
}

export interface PublicFareEstimate {
  observationId: string;
  amountMinKobo: number;
  amountMaxKobo: number;
  currencyCode: string;
  confidenceScore: number;
  observedAt: string;
}

export interface PublicJourneyRouteResult {
  routeId: string;
  code: string;
  name: string;
  fare: PublicFareEstimate | null;
  fareNotice: string;
}

export interface PublicRouteDecision {
  publishable: boolean;
  reasons: PublicRouteBlockReason[];
}

function isApprovedPlace(place: PublicPlaceCandidate): boolean {
  return place.verificationStatus === 'APPROVED' && place.isActive && place.deletedAt === null;
}

export function evaluateRouteForPublicUse(route: PublicRouteCandidate): PublicRouteDecision {
  const reasons = new Set<PublicRouteBlockReason>();

  if (route.status !== 'PUBLISHED') reasons.add('ROUTE_NOT_PUBLISHED');
  if (route.deletedAt !== null) reasons.add('ROUTE_DELETED');
  if (route.lastVerifiedAt === null || route.publishedAt === null) {
    reasons.add('ROUTE_NOT_VERIFIED');
  }
  if (!isApprovedPlace(route.originPlace)) reasons.add('ORIGIN_NOT_APPROVED');
  if (!isApprovedPlace(route.destinationPlace)) {
    reasons.add('DESTINATION_NOT_APPROVED');
  }

  const activeStops = route.stops.filter((stop) => stop.deletedAt === null);
  if (activeStops.length < 2) reasons.add('INSUFFICIENT_ACTIVE_STOPS');
  if (activeStops.some((stop) => !isApprovedPlace(stop.place))) {
    reasons.add('STOP_NOT_APPROVED');
  }

  const revision = route.currentRevision;
  if (!revision || revision.deletedAt !== null) {
    reasons.add('CURRENT_REVISION_MISSING');
  } else {
    if (revision.submittedAt === null) {
      reasons.add('CURRENT_REVISION_NOT_SUBMITTED');
    }
    const reviews = revision.reviews.filter((review) => review.deletedAt === null);
    const validApproval = reviews.some(
      (review) =>
        review.status === 'APPROVED' &&
        review.reviewedAt !== null &&
        review.reviewerId !== revision.createdById,
    );
    if (!validApproval) reasons.add('CURRENT_REVISION_NOT_APPROVED');
    if (
      reviews.some(
        (review) => review.status === 'REJECTED' || review.status === 'CHANGES_REQUESTED',
      )
    ) {
      reasons.add('CURRENT_REVISION_HAS_BLOCKING_REVIEW');
    }
  }

  return { publishable: reasons.size === 0, reasons: [...reasons] };
}

export function isFareObservationPublic(
  observation: FareObservationCandidate,
  now: Date,
  maxAgeDays = PUBLIC_FARE_MAX_AGE_DAYS,
): boolean {
  const newestAllowedFutureTimestamp = now.getTime() + 5 * 60_000;
  const oldestAllowedTimestamp = now.getTime() - maxAgeDays * 86_400_000;
  return (
    observation.deletedAt === null &&
    observation.currencyCode === 'NGN' &&
    observation.amountMinKobo >= 0 &&
    observation.amountMaxKobo >= observation.amountMinKobo &&
    observation.confidenceScore >= PUBLIC_FARE_MIN_CONFIDENCE &&
    observation.confidenceScore <= 100 &&
    observation.observedAt.getTime() >= oldestAllowedTimestamp &&
    observation.observedAt.getTime() <= newestAllowedFutureTimestamp &&
    (observation.validUntil === null || observation.validUntil > now)
  );
}

export function selectPublicFareEstimate(
  observations: FareObservationCandidate[],
  now: Date,
): PublicFareEstimate | null {
  const selected = observations
    .filter((observation) => isFareObservationPublic(observation, now))
    .sort((first, second) => {
      const confidenceDifference = second.confidenceScore - first.confidenceScore;
      return confidenceDifference !== 0
        ? confidenceDifference
        : second.observedAt.getTime() - first.observedAt.getTime();
    })[0];

  return selected
    ? {
        observationId: selected.id,
        amountMinKobo: selected.amountMinKobo,
        amountMaxKobo: selected.amountMaxKobo,
        currencyCode: selected.currencyCode,
        confidenceScore: selected.confidenceScore,
        observedAt: selected.observedAt.toISOString(),
      }
    : null;
}

export function buildPublicJourneyRouteResult(
  route: PublicRouteCandidate,
  fareObservations: FareObservationCandidate[],
  now: Date,
): PublicJourneyRouteResult | null {
  if (!evaluateRouteForPublicUse(route).publishable) return null;
  const fare = selectPublicFareEstimate(fareObservations, now);
  return {
    routeId: route.id,
    code: route.code,
    name: route.name,
    fare,
    fareNotice: fare
      ? 'Fare is an estimate based on a recent verified observation.'
      : 'Current fare unavailable. Confirm the price before boarding.',
  };
}
