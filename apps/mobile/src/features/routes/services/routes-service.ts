import { apiRequest } from '@/shared/api/api-client';

export type RoutePreference =
  'BALANCED' | 'CHEAPEST' | 'FASTEST' | 'FEWEST_TRANSFERS' | 'LEAST_WALKING' | 'FORMAL_TRANSIT';

export interface TransitPlaceResult {
  id: string;
  code: string;
  name: string;
  type: string;
  area: { id: string; name: string; type: string };
  coordinates: { latitude: number; longitude: number };
  aliases?: string[];
  modes: string[];
  distanceM?: number;
}

export interface TransitJourneyLeg {
  routeId: string;
  routeCode: string;
  routeName: string;
  routeDataVersion: number;
  mode: string;
  fromPlaceId: string;
  fromLabel: string;
  toPlaceId: string;
  toLabel: string;
  destinationSign: string | null;
  instructions: string[];
  stopCount: number;
  durationMinMinutes: number;
  durationMaxMinutes: number;
  fareMinKobo: number | null;
  fareMaxKobo: number | null;
  distanceM: number;
}

export interface TransitJourney {
  id: string;
  preference: RoutePreference;
  originPlaceId: string;
  destinationPlaceId: string;
  transferCount: number;
  totalDurationMinMinutes: number;
  totalDurationMaxMinutes: number;
  totalFareMinKobo: number | null;
  totalFareMaxKobo: number | null;
  walkingDistanceM: number;
  hasUnknownFare: boolean;
  legs: TransitJourneyLeg[];
}

export interface TransitPlanResponse {
  generatedAt: string;
  dataFreshnessNotice: string;
  origin: { id: string; name: string };
  destination: { id: string; name: string };
  data: TransitJourney[];
}

export async function searchTransitPlaces(query: string): Promise<TransitPlaceResult[]> {
  const response = await apiRequest<{ data: TransitPlaceResult[] }>(
    `/transit/places/search?q=${encodeURIComponent(query)}&limit=10`,
  );
  return response.data;
}

export async function nearbyTransitPlaces(
  latitude: number,
  longitude: number,
): Promise<TransitPlaceResult[]> {
  const response = await apiRequest<{ data: TransitPlaceResult[] }>(
    `/transit/places/nearby?latitude=${latitude}&longitude=${longitude}&radiusM=5000&limit=10`,
  );
  return response.data;
}

export function planTransitJourney(input: {
  originPlaceId: string;
  destinationPlaceId: string;
  preference: RoutePreference;
}): Promise<TransitPlanResponse> {
  return apiRequest<TransitPlanResponse>('/transit/journeys/plan', {
    method: 'POST',
    body: { ...input, maxTransfers: 3, maxAlternatives: 3 },
  });
}
