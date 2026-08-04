import type { MapPerson } from '@/features/location/store/location-store';

export interface MapSurfaceProps {
  people: MapPerson[];
  selectedPersonId: string | null;
  onSelectPerson: (id: string) => void;
  dark: boolean;
  satellite?: boolean;
  traffic?: boolean;
}
