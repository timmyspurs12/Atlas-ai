import { create } from 'zustand';

export interface MapPerson {
  id: string;
  name: string;
  firstName: string;
  initials: string;
  color: string;
  latitude: number;
  longitude: number;
  mapX: number;
  mapY: number;
  batteryPct: number | null;
  status: 'moving' | 'at-place' | 'stale';
  statusLabel: string;
  place: string;
  updatedAt: string;
  speedKph: number | null;
  heading: number;
}

const now = new Date();

export const demoPeople: MapPerson[] = [
  {
    id: '77bf481a-2060-4e3b-96f0-d8fb50f70b73',
    name: 'Sarah Chen',
    firstName: 'Sarah',
    initials: 'SC',
    color: '#8B5CF6',
    latitude: 6.4433,
    longitude: 3.4148,
    mapX: 66,
    mapY: 36,
    batteryPct: 82,
    status: 'moving',
    statusLabel: 'Driving · 24 km/h',
    place: 'Victoria Island',
    updatedAt: now.toISOString(),
    speedKph: 24,
    heading: 118,
  },
  {
    id: '75cfd09b-cb80-4509-ae86-ddf533f9f41e',
    name: 'John Adeyemi',
    firstName: 'John',
    initials: 'JA',
    color: '#F97316',
    latitude: 6.4698,
    longitude: 3.3792,
    mapX: 29,
    mapY: 28,
    batteryPct: 64,
    status: 'at-place',
    statusLabel: 'At work · 1h 12m',
    place: 'Ikoyi',
    updatedAt: new Date(now.getTime() - 42_000).toISOString(),
    speedKph: 0,
    heading: 0,
  },
  {
    id: 'adbe9ec3-d817-48de-99fc-bfb078fe4dc3',
    name: 'Leo Martin',
    firstName: 'Leo',
    initials: 'LM',
    color: '#14B8A6',
    latitude: 6.4478,
    longitude: 3.3878,
    mapX: 43,
    mapY: 62,
    batteryPct: 31,
    status: 'at-place',
    statusLabel: 'At the gym · 28m',
    place: 'Oniru',
    updatedAt: new Date(now.getTime() - 75_000).toISOString(),
    speedKph: 0,
    heading: 0,
  },
];

interface LocationState {
  people: MapPerson[];
  selectedPersonId: string | null;
  sharingActive: boolean;
  sharingUntil: string | null;
  socketStatus: 'offline' | 'connecting' | 'connected' | 'recovering';
  selectPerson: (id: string | null) => void;
  setPeople: (people: MapPerson[]) => void;
  updatePerson: (id: string, patch: Partial<MapPerson>) => void;
  startSharing: (durationMinutes: number) => void;
  stopSharing: () => void;
  setSocketStatus: (status: LocationState['socketStatus']) => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  people: demoPeople,
  selectedPersonId: demoPeople[0]?.id ?? null,
  sharingActive: false,
  sharingUntil: null,
  socketStatus: 'offline',
  selectPerson: (selectedPersonId) => set({ selectedPersonId }),
  setPeople: (people) => set({ people }),
  updatePerson: (id, patch) =>
    set((state) => ({
      people: state.people.map((person) => (person.id === id ? { ...person, ...patch } : person)),
    })),
  startSharing: (durationMinutes) =>
    set({
      sharingActive: true,
      sharingUntil: new Date(Date.now() + durationMinutes * 60_000).toISOString(),
    }),
  stopSharing: () => set({ sharingActive: false, sharingUntil: null }),
  setSocketStatus: (socketStatus) => set({ socketStatus }),
}));
