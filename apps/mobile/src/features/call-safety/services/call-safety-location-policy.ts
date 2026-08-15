import type { CallSafetySession } from './call-safety-api';

export type CallSafetyTrackingDecision = 'STOP' | 'ARMED' | 'TRACK';

export interface CallSafetyTrackingEvaluation {
  decision: CallSafetyTrackingDecision;
  reason:
    | 'SESSION_TERMINAL'
    | 'SESSION_EXPIRED'
    | 'PARTICIPANT_MISSING'
    | 'CONSENT_INACTIVE'
    | 'CONSENT_EXPIRED'
    | 'WAITING_FOR_MUTUAL_CONSENT'
    | 'ACTIVE';
}

export interface RawCallSafetyCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
}

export interface SafeCallSafetyLocationPayload {
  latitude: number;
  longitude: number;
  accuracyM: number;
  headingDeg?: number;
  speedMps?: number;
  sequence: number;
  recordedAt: string;
}

const terminalStatuses = new Set<CallSafetySession['status']>(['ENDED', 'EXPIRED', 'CANCELLED']);

export function evaluateCallSafetyTracking(
  session: CallSafetySession,
  userId: string,
  nowMs = Date.now(),
): CallSafetyTrackingEvaluation {
  if (terminalStatuses.has(session.status)) {
    return { decision: 'STOP', reason: 'SESSION_TERMINAL' };
  }

  const sessionExpiry = Date.parse(session.expiresAt);
  if (!Number.isFinite(sessionExpiry) || sessionExpiry <= nowMs) {
    return { decision: 'STOP', reason: 'SESSION_EXPIRED' };
  }

  const participant = session.participants.find((candidate) => candidate.userId === userId);
  if (!participant) {
    return { decision: 'STOP', reason: 'PARTICIPANT_MISSING' };
  }
  if (participant.consent?.status !== 'ACTIVE') {
    return { decision: 'STOP', reason: 'CONSENT_INACTIVE' };
  }

  const consentExpiry = Date.parse(participant.consent.expiresAt);
  if (!Number.isFinite(consentExpiry) || consentExpiry <= nowMs) {
    return { decision: 'STOP', reason: 'CONSENT_EXPIRED' };
  }

  if (session.status === 'PENDING') {
    return { decision: 'ARMED', reason: 'WAITING_FOR_MUTUAL_CONSENT' };
  }
  if (session.status === 'ACTIVE') {
    return { decision: 'TRACK', reason: 'ACTIVE' };
  }
  return { decision: 'STOP', reason: 'SESSION_TERMINAL' };
}

export function buildSafeCallSafetyLocationPayload(
  coordinates: RawCallSafetyCoordinates,
  timestamp: number,
  sequence: number,
): SafeCallSafetyLocationPayload {
  if (
    !Number.isFinite(coordinates.latitude) ||
    coordinates.latitude < -90 ||
    coordinates.latitude > 90 ||
    !Number.isFinite(coordinates.longitude) ||
    coordinates.longitude < -180 ||
    coordinates.longitude > 180
  ) {
    throw new Error('The device returned invalid location coordinates.');
  }
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new Error('The location sequence is invalid.');
  }

  const recordedAt = new Date(Number.isFinite(timestamp) ? timestamp : Date.now());
  const payload: SafeCallSafetyLocationPayload = {
    latitude: round(coordinates.latitude, 7),
    longitude: round(coordinates.longitude, 7),
    accuracyM: round(clamp(finiteOr(coordinates.accuracy, 0), 0, 10_000), 2),
    sequence,
    recordedAt: recordedAt.toISOString(),
  };

  if (
    coordinates.heading !== null &&
    Number.isFinite(coordinates.heading) &&
    coordinates.heading >= 0 &&
    coordinates.heading <= 360
  ) {
    payload.headingDeg = round(coordinates.heading, 2);
  }
  if (
    coordinates.speed !== null &&
    Number.isFinite(coordinates.speed) &&
    coordinates.speed >= 0 &&
    coordinates.speed <= 200
  ) {
    payload.speedMps = round(coordinates.speed, 2);
  }
  return payload;
}

function finiteOr(value: number | null, fallback: number): number {
  return value !== null && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces;
  return Math.round(value * factor) / factor;
}
