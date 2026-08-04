import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { LocationUpdate } from '@atlas/contracts';
import { apiRequest } from '@/shared/api/api-client';
import { emitLiveLocation } from './realtime-service';

const BACKGROUND_TASK = 'atlas-consented-live-location-v1';
const QUEUE_KEY = 'atlas.location.queue.v1';
const SEQUENCE_KEY = 'atlas.location.sequence.v1';
const MAX_QUEUE = 100;
let foregroundSubscription: Location.LocationSubscription | null = null;

async function nextSequence(): Promise<number> {
  const current = Number(await AsyncStorage.getItem(SEQUENCE_KEY)) || 0;
  const next = current + 1;
  await AsyncStorage.setItem(SEQUENCE_KEY, String(next));
  return next;
}

async function toUpdate(location: Location.LocationObject): Promise<LocationUpdate> {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracyM: location.coords.accuracy ?? 0,
    altitudeM: location.coords.altitude,
    headingDeg: location.coords.heading,
    speedMps: location.coords.speed,
    batteryPct: null,
    isCharging: null,
    recordedAt: new Date(location.timestamp).toISOString(),
    sequence: await nextSequence(),
    isMocked: location.mocked ?? false,
  };
}

async function readQueue(): Promise<LocationUpdate[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as LocationUpdate[]) : [];
  } catch {
    return [];
  }
}

async function enqueue(update: LocationUpdate): Promise<void> {
  const queue = await readQueue();
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([...queue, update].slice(-MAX_QUEUE)));
}

async function send(update: LocationUpdate): Promise<boolean> {
  try {
    await apiRequest('/locations/updates', { method: 'POST', body: update });
    return true;
  } catch {
    await enqueue(update);
    return false;
  }
}

export async function flushLocationQueue(): Promise<void> {
  const queue = await readQueue();
  if (queue.length === 0) return;
  const remaining: LocationUpdate[] = [];
  for (const update of queue) {
    try {
      await apiRequest('/locations/updates', { method: 'POST', body: update });
    } catch {
      remaining.push(update);
    }
  }
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
}

TaskManager.defineTask(BACKGROUND_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const event = data as { locations?: Location.LocationObject[] };
  for (const location of event.locations ?? []) {
    await send(await toUpdate(location));
  }
});

export async function requestLocationConsent(): Promise<boolean> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  return foreground.granted;
}

export async function startLiveLocationTracking(
  onLocation?: (update: LocationUpdate) => void,
): Promise<void> {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) throw new Error('Location permission is required while sharing');
  await flushLocationQueue();
  foregroundSubscription?.remove();
  foregroundSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      distanceInterval: 8,
      timeInterval: 5_000,
      mayShowUserSettingsDialog: true,
    },
    (location) => {
      void (async () => {
        const update = await toUpdate(location);
        onLocation?.(update);
        if (!(await emitLiveLocation(update))) await send(update);
      })();
    },
  );

  const background = await Location.getBackgroundPermissionsAsync();
  if (background.granted && !(await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK))) {
    await Location.startLocationUpdatesAsync(BACKGROUND_TASK, {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 25,
      timeInterval: 15_000,
      pausesUpdatesAutomatically: true,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Atlas AI location sharing is active',
        notificationBody: 'Tap to review or stop sharing.',
        notificationColor: '#2563EB',
      },
    });
  }
}

export async function requestBackgroundLocationConsent(): Promise<boolean> {
  const permission = await Location.requestBackgroundPermissionsAsync();
  return permission.granted;
}

export async function stopLiveLocationTracking(): Promise<void> {
  foregroundSubscription?.remove();
  foregroundSubscription = null;
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK)) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_TASK);
  }
  await AsyncStorage.removeItem(QUEUE_KEY);
}
