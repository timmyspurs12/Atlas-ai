import { MapFallback } from './MapFallback';
import type { MapSurfaceProps } from './types';

export function MapSurface(props: MapSurfaceProps) {
  return <MapFallback {...props} />;
}
