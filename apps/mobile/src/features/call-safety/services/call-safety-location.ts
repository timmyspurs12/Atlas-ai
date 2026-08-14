import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AtlasApiError } from '@/shared/api/api-client';
import { sessionStorage } from '@/shared/storage';
import {
  getCallSafetySession,
  revokeCallSafetyConsent,
  sendCallSafetyLocation,
  type CallSafetySession,
} from './call-safety-api';
import {
  buildSafeCallSafetyLocationPayload,
  evaluateCallSafetyTracking,
} from './call-safety-location-policy';

export const CALL_SAFETY_BACKGROUND_TASK = 'atlas-stay-with-me-location-v1';
const CONTEXT_KEY = 'atlas.call-safety.tracking.v1';
const SEQUENCE_KEY = 'atlas.call-safety.sequence.v1';

type DesiredTrackingMode = 'FOREGROUND' | 'BACKGROUND';
type PersistedTrackingPhase = 'ARMED' | 'ACTIVE';
export type CallSafetyTrackingStatus = 'IDLE' | 'ARMED' | 'FOREGROUND' | 'BACKGROUND';

interface PersistedTrackingContext {
  version: 1;
  sessionId: string;
  userId: string;
  expiresAt: string;
  desiredMode: DesiredTrackingMode;
  phase: PersistedTrackingPhase;
}

interface PersistedSequence {
  sessionId: string;
  userId: string;
  value: number;
}

export interface PreparedCallSafetyLocationPermission {
  mode: DesiredTrackingMode;
}

export interface CallSafetyTrackingState {
  status: CallSafetyTrackingStatus;
  sessionId: string | null;
  expiresAt: string | null;
  lastError: string | null;
}

type TrackingListener = (state: CallSafetyTrackingState) => void;

let foregroundSubscription: Location.LocationSubscription | null = null;
let lifecycleTail: Promise<void> = Promise.resolve();
let deliveryTail: Promise<void> = Promise.resolve();
let lifecycleGeneration = 0;
let trackingState: CallSafetyTrackingState = {
  status: 'IDLE',
  sessionId: null,
  expiresAt: null,
  lastError: null,
};
const listeners = new Set<TrackingListener>();

TaskManager.defineTask(CALL_SAFETY_BACKGROUND_TASK, async ({ data, error }) => {
  if (error) {
    publish({ ...trackingState, lastError: 'Background location could not be read.' });
    return;
  }
  if (!data) return;
  const event = data as { locations?: Location.LocationObject[] };
  for (const location of event.locations ?? []) {
    await queueLocationDelivery(location);
  }
});

export function getCallSafetyTrackingSnapshot(): CallSafetyTrackingState {
  return trackingState;
}

export function subscribeCallSafetyTracking(listener: TrackingListener): () => void {
  listeners.add(listener);
  listener(trackingState);
  return () => listeners.delete(listener);
}

export async function prepareCallSafetyLocationPermission(
  backgroundRequested: boolean,
): Promise<PreparedCallSafetyLocationPermission> {
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new Error('Turn on device location services before granting consent.');
  }

  const existingForeground = await Location.getForegroundPermissionsAsync();
  const foreground = existingForeground.granted
    ? existingForeground
    : await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) {
    throw new Error('Location permission was not granted. Consent remains off.');
  }

  if (!backgroundRequested) return { mode: 'FOREGROUND' };
  if (Platform.OS === 'web') {
    throw new Error('Background location is unavailable in the web preview. Use the Atlas app.');
  }
  if (!(await TaskManager.isAvailableAsync())) {
    throw new Error(
      'Background location requires an Atlas development or production build and is unavailable in Expo Go.',
    );
  }

  const existingBackground = await Location.getBackgroundPermissionsAsync();
  const background = existingBackground.granted
    ? existingBackground
    : await Location.requestBackgroundPermissionsAsync();
  if (!background.granted) {
    throw new Error('Background location permission was not granted. Consent remains off.');
  }
  return { mode: 'BACKGROUND' };
}

export async function armCallSafetyLocationTracking(input: {
  session: CallSafetySession;
  userId: string;
  mode: DesiredTrackingMode;
}): Promise<CallSafetyTrackingState> {
  lifecycleGeneration += 1;
  return runLifecycle(async () => {
    const evaluation = evaluateCallSafetyTracking(input.session, input.userId);
    if (evaluation.decision === 'STOP') {
      await stopInternal();
      throw new Error('An active personal consent is required before location can start.');
    }

    const previous = await readContext();
    if (
      previous &&
      (previous.sessionId !== input.session.id ||
        previous.userId !== input.userId ||
        previous.desiredMode !== input.mode)
    ) {
      await clearContext();
      await stopRunners();
    }

    const context: PersistedTrackingContext = {
      version: 1,
      sessionId: input.session.id,
      userId: input.userId,
      expiresAt: input.session.expiresAt,
      desiredMode: input.mode,
      phase: evaluation.decision === 'TRACK' ? 'ACTIVE' : 'ARMED',
    };
    await writeContext(context);

    if (evaluation.decision === 'ARMED') {
      await stopRunners();
      return publishFromContext(context, 'ARMED');
    }
    return startRunnersWithFailureState(context);
  });
}

export async function reconcileCallSafetyLocationTracking(
  userId: string,
  suppliedSession?: CallSafetySession,
): Promise<CallSafetyTrackingState> {
  return runLifecycle(async () => {
    const context = await readContext();
    if (!context) {
      await stopRunners();
      return publishIdle();
    }
    if (context.userId !== userId || isExpired(context.expiresAt)) {
      await stopInternal();
      return trackingState;
    }

    let session: CallSafetySession;
    try {
      session =
        suppliedSession?.id === context.sessionId
          ? suppliedSession
          : await getCallSafetySession(context.sessionId);
    } catch (caught) {
      if (isTerminalApiError(caught)) {
        await stopInternal();
        return trackingState;
      }
      return publishFromContext(
        context,
        inferCurrentStatus(context),
        'Atlas could not verify the session. Existing server protections remain active.',
      );
    }

    const evaluation = evaluateCallSafetyTracking(session, userId);
    if (evaluation.decision === 'STOP') {
      await stopInternal();
      return trackingState;
    }

    const updated: PersistedTrackingContext = {
      ...context,
      expiresAt: session.expiresAt,
      phase: evaluation.decision === 'TRACK' ? 'ACTIVE' : 'ARMED',
    };
    await writeContext(updated);
    if (evaluation.decision === 'ARMED') {
      await stopRunners();
      return publishFromContext(updated, 'ARMED');
    }
    return startRunnersWithFailureState(updated);
  });
}

export function stopCallSafetyLocationTracking(sessionId?: string): Promise<void> {
  lifecycleGeneration += 1;
  return runLifecycle(async () => {
    const context = await readContext();
    if (sessionId && context && context.sessionId !== sessionId) return;
    await stopInternal();
  });
}

export async function revokeAndStopCallSafetyLocationTracking(): Promise<void> {
  const context = await readContext();
  const operations: Promise<unknown>[] = [stopCallSafetyLocationTracking(context?.sessionId)];
  if (context) operations.push(revokeCallSafetyConsent(context.sessionId));
  const results = await Promise.allSettled(operations);
  const failed = results.find((result) => result.status === 'rejected');
  if (failed?.status === 'rejected') {
    const reason: unknown = failed.reason;
    throw reason instanceof Error ? reason : new Error('Location sharing cleanup failed.');
  }
}

async function startRunnersWithFailureState(
  context: PersistedTrackingContext,
): Promise<CallSafetyTrackingState> {
  try {
    return await startRunners(context);
  } catch (caught) {
    const paused = { ...context, phase: 'ARMED' as const };
    await writeContext(paused);
    publishFromContext(
      paused,
      'ARMED',
      caught instanceof Error ? caught.message : 'Location sharing could not start.',
    );
    throw caught;
  }
}

async function startRunners(context: PersistedTrackingContext): Promise<CallSafetyTrackingState> {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) {
    await writeContext({ ...context, phase: 'ARMED' });
    throw new Error('Location permission was removed. Sharing is paused.');
  }

  if (context.desiredMode === 'BACKGROUND') {
    if (Platform.OS === 'web' || !(await TaskManager.isAvailableAsync())) {
      await writeContext({ ...context, phase: 'ARMED' });
      throw new Error('Background location is unavailable in this app build. Sharing is paused.');
    }
    const background = await Location.getBackgroundPermissionsAsync();
    if (!background.granted) {
      await writeContext({ ...context, phase: 'ARMED' });
      throw new Error('Background location permission was removed. Sharing is paused.');
    }

    foregroundSubscription?.remove();
    foregroundSubscription = null;
    if (!(await Location.hasStartedLocationUpdatesAsync(CALL_SAFETY_BACKGROUND_TASK))) {
      await Location.startLocationUpdatesAsync(CALL_SAFETY_BACKGROUND_TASK, {
        accuracy: Location.Accuracy.High,
        distanceInterval: 8,
        timeInterval: 10_000,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Stay With Me location sharing is active',
          notificationBody: 'Mutual consent is active. Tap Atlas AI to review or stop sharing.',
          notificationColor: '#2563EB',
        },
      });
    }
    return publishFromContext(context, 'BACKGROUND');
  }

  await stopBackgroundRunner();
  if (!foregroundSubscription) {
    foregroundSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 8,
        timeInterval: 5_000,
        mayShowUserSettingsDialog: true,
      },
      (location) => {
        void queueLocationDelivery(location);
      },
    );
  }
  return publishFromContext(context, 'FOREGROUND');
}

function queueLocationDelivery(location: Location.LocationObject): Promise<void> {
  const current = deliveryTail.then(
    () => deliverLocation(location),
    () => deliverLocation(location),
  );
  deliveryTail = current.catch(() => undefined);
  return current;
}

async function deliverLocation(location: Location.LocationObject): Promise<void> {
  const generation = lifecycleGeneration;
  const context = await readContext();
  if (!context || context.phase !== 'ACTIVE') return;
  if (isExpired(context.expiresAt)) {
    await stopCallSafetyLocationTracking(context.sessionId).catch(() => undefined);
    return;
  }

  const auth = await sessionStorage.getSession();
  if (!auth || auth.user.id !== context.userId) {
    await stopCallSafetyLocationTracking(context.sessionId).catch(() => undefined);
    return;
  }

  const sequence = await reserveSequence(context);
  const latest = await readContext();
  if (
    generation !== lifecycleGeneration ||
    !latest ||
    latest.sessionId !== context.sessionId ||
    latest.userId !== context.userId ||
    latest.phase !== 'ACTIVE'
  ) {
    return;
  }

  try {
    await sendCallSafetyLocation(
      context.sessionId,
      buildSafeCallSafetyLocationPayload(location.coords, location.timestamp, sequence),
    );
    if (trackingState.lastError) {
      publish({ ...trackingState, lastError: null });
    }
  } catch (caught) {
    if (isTerminalApiError(caught)) {
      await stopCallSafetyLocationTracking(context.sessionId).catch(() => undefined);
      return;
    }
    const message = caught instanceof Error ? caught.message : 'Location update failed.';
    publish({ ...trackingState, lastError: message });
  }
}

async function reserveSequence(context: PersistedTrackingContext): Promise<number> {
  const stored = await readSequence();
  const previous =
    stored?.sessionId === context.sessionId && stored.userId === context.userId ? stored.value : 0;
  const value = Math.max(previous + 1, Date.now());
  await AsyncStorage.setItem(
    SEQUENCE_KEY,
    JSON.stringify({ sessionId: context.sessionId, userId: context.userId, value }),
  );
  return value;
}

async function stopInternal(): Promise<void> {
  await clearContext();
  try {
    await stopRunners();
    publishIdle();
  } catch (caught) {
    publishIdle(caught instanceof Error ? caught.message : 'The location service could not stop.');
    throw caught;
  }
}

async function stopRunners(): Promise<void> {
  foregroundSubscription?.remove();
  foregroundSubscription = null;
  await stopBackgroundRunner();
}

async function stopBackgroundRunner(): Promise<void> {
  if (Platform.OS === 'web' || !(await TaskManager.isAvailableAsync())) return;
  if (await Location.hasStartedLocationUpdatesAsync(CALL_SAFETY_BACKGROUND_TASK)) {
    await Location.stopLocationUpdatesAsync(CALL_SAFETY_BACKGROUND_TASK);
  }
}

async function readContext(): Promise<PersistedTrackingContext | null> {
  const raw = await AsyncStorage.getItem(CONTEXT_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PersistedTrackingContext>;
    if (
      value.version !== 1 ||
      typeof value.sessionId !== 'string' ||
      typeof value.userId !== 'string' ||
      typeof value.expiresAt !== 'string' ||
      (value.desiredMode !== 'FOREGROUND' && value.desiredMode !== 'BACKGROUND') ||
      (value.phase !== 'ARMED' && value.phase !== 'ACTIVE')
    ) {
      await clearContext();
      return null;
    }
    return value as PersistedTrackingContext;
  } catch {
    await clearContext();
    return null;
  }
}

async function writeContext(context: PersistedTrackingContext): Promise<void> {
  await AsyncStorage.setItem(CONTEXT_KEY, JSON.stringify(context));
}

async function clearContext(): Promise<void> {
  await Promise.all([AsyncStorage.removeItem(CONTEXT_KEY), AsyncStorage.removeItem(SEQUENCE_KEY)]);
}

async function readSequence(): Promise<PersistedSequence | null> {
  const raw = await AsyncStorage.getItem(SEQUENCE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PersistedSequence>;
    return typeof value.sessionId === 'string' &&
      typeof value.userId === 'string' &&
      typeof value.value === 'number' &&
      Number.isSafeInteger(value.value)
      ? (value as PersistedSequence)
      : null;
  } catch {
    return null;
  }
}

function runLifecycle<T>(operation: () => Promise<T>): Promise<T> {
  const current = lifecycleTail.then(operation, operation);
  lifecycleTail = current.then(
    () => undefined,
    () => undefined,
  );
  return current;
}

function inferCurrentStatus(context: PersistedTrackingContext): CallSafetyTrackingStatus {
  if (context.phase === 'ARMED') return 'ARMED';
  if (trackingState.sessionId === context.sessionId) return trackingState.status;
  return foregroundSubscription ? 'FOREGROUND' : 'ARMED';
}

function publishFromContext(
  context: PersistedTrackingContext,
  status: CallSafetyTrackingStatus,
  lastError: string | null = null,
): CallSafetyTrackingState {
  return publish({
    status,
    sessionId: context.sessionId,
    expiresAt: context.expiresAt,
    lastError,
  });
}

function publishIdle(lastError: string | null = null): CallSafetyTrackingState {
  return publish({ status: 'IDLE', sessionId: null, expiresAt: null, lastError });
}

function publish(state: CallSafetyTrackingState): CallSafetyTrackingState {
  trackingState = state;
  for (const listener of listeners) listener(state);
  return state;
}

function isExpired(expiresAt: string): boolean {
  const timestamp = Date.parse(expiresAt);
  return !Number.isFinite(timestamp) || timestamp <= Date.now();
}

function isTerminalApiError(caught: unknown): boolean {
  return (
    caught instanceof AtlasApiError &&
    (caught.status === 401 || caught.status === 403 || caught.status === 404)
  );
}
