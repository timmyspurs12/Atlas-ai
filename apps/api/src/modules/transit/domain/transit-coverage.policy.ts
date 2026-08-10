export type CoverageTargetStatus = 'DATA_COLLECTION' | 'BETA' | 'VERIFIED' | 'SUSPENDED';

export interface CoverageMetrics {
  approvedPlaceCount: number;
  publishedRouteCount: number;
  completeRouteCount: number;
  freshFareRouteCount: number;
  lowestRouteConfidence: number | null;
  staleRouteCount: number;
  lastSurveyedAt: Date | null;
}

export interface CoverageDecision {
  allowed: boolean;
  reasons: string[];
}

export function evaluateCoveragePromotion(
  target: CoverageTargetStatus,
  metrics: CoverageMetrics,
  now: Date,
): CoverageDecision {
  if (target === 'DATA_COLLECTION' || target === 'SUSPENDED') {
    return { allowed: true, reasons: [] };
  }

  const reasons: string[] = [];
  const surveyMaxAgeDays = target === 'VERIFIED' ? 90 : 180;
  const surveyCutoff = now.getTime() - surveyMaxAgeDays * 86_400_000;
  const minimumPlaces = target === 'VERIFIED' ? 5 : 1;
  const minimumRoutes = target === 'VERIFIED' ? 3 : 1;
  const minimumConfidence = target === 'VERIFIED' ? 75 : 60;

  if (metrics.approvedPlaceCount < minimumPlaces) {
    reasons.push(`At least ${minimumPlaces} approved transit place(s) required`);
  }
  if (metrics.publishedRouteCount < minimumRoutes) {
    reasons.push(`At least ${minimumRoutes} published route(s) required`);
  }
  if (metrics.completeRouteCount < metrics.publishedRouteCount) {
    reasons.push('Every published route requires complete stops, segments, and durations');
  }
  if (metrics.lowestRouteConfidence === null || metrics.lowestRouteConfidence < minimumConfidence) {
    reasons.push(`Every published route requires confidence of at least ${minimumConfidence}`);
  }
  if (metrics.staleRouteCount > 0) {
    reasons.push('Published routes must have a recent verification timestamp');
  }
  if (metrics.lastSurveyedAt === null || metrics.lastSurveyedAt.getTime() < surveyCutoff) {
    reasons.push(`A field survey within ${surveyMaxAgeDays} days is required`);
  }
  if (target === 'VERIFIED' && metrics.freshFareRouteCount < metrics.publishedRouteCount) {
    reasons.push('Every verified-area route requires a recent reviewed fare observation');
  }

  return { allowed: reasons.length === 0, reasons };
}
