export interface GeoPoint {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_M = 6_371_000;

export function haversineDistanceM(from: GeoPoint, to: GeoPoint): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const dLatitude = toRadians(to.latitude - from.latitude);
  const dLongitude = toRadians(to.longitude - from.longitude);
  const latitude1 = toRadians(from.latitude);
  const latitude2 = toRadians(to.latitude);
  const a =
    Math.sin(dLatitude / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(dLongitude / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function approximateCoordinates(point: GeoPoint, userId: string): GeoPoint {
  const hash = Array.from(userId).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const angle = ((hash % 360) * Math.PI) / 180;
  const radiusM = 120 + (hash % 180);
  const latitudeOffset = (radiusM * Math.cos(angle)) / 111_320;
  const longitudeScale = Math.max(Math.cos((point.latitude * Math.PI) / 180), 0.2);
  const longitudeOffset = (radiusM * Math.sin(angle)) / (111_320 * longitudeScale);
  return {
    latitude: Number((point.latitude + latitudeOffset).toFixed(5)),
    longitude: Number((point.longitude + longitudeOffset).toFixed(5)),
  };
}

export function estimateEtaMinutes(distanceM: number, speedMps?: number | null): number {
  const safeSpeed = Math.min(Math.max(speedMps ?? 8.33, 1.4), 36.1);
  return Math.max(1, Math.ceil(distanceM / safeSpeed / 60));
}
