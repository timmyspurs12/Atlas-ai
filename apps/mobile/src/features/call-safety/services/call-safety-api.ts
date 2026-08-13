import { apiRequest } from '@/shared/api/api-client';

export interface CallSafetyParticipant {
  id: string;
  userId: string;
  role: 'INITIATOR' | 'INVITEE';
  joinedAt: string | null;
  user: {
    id: string;
    profile: { displayName: string; avatarUrl: string | null } | null;
  };
  consent: {
    status: string;
    precision: 'PRECISE' | 'APPROXIMATE';
    expiresAt: string;
  } | null;
}

export interface CallSafetySession {
  id: string;
  initiatorId: string;
  mode: 'PSTN_COMPANION' | 'ATLAS_VOIP';
  status: 'PENDING' | 'ACTIVE' | 'ENDED' | 'EXPIRED' | 'CANCELLED';
  mutualRequired: boolean;
  startsAt: string | null;
  expiresAt: string;
  endedAt: string | null;
  participants: CallSafetyParticipant[];
  locations?: Array<{
    userId: string;
    latitude: number;
    longitude: number;
    accuracyM: number;
    batteryPct: number | null;
    recordedAt: string;
  }>;
}

export interface CreateCallSafetyResponse {
  sessionId: string;
  invitationToken: string;
  expiresAt: string;
}

export function createCallSafetySession(input: {
  invitedUserId: string;
  durationMinutes: 15 | 30 | 60;
}): Promise<CreateCallSafetyResponse> {
  return apiRequest('/call-safety/sessions', {
    method: 'POST',
    body: { ...input, mode: 'PSTN_COMPANION' },
  });
}

export function listCallSafetySessions(): Promise<CallSafetySession[]> {
  return apiRequest('/call-safety/sessions');
}

export function getCallSafetySession(sessionId: string): Promise<CallSafetySession> {
  return apiRequest(`/call-safety/sessions/${sessionId}`);
}

export function acceptCallSafetyInvitation(token: string): Promise<{ sessionId: string }> {
  return apiRequest(`/call-safety/invitations/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
  });
}

export function declineCallSafetyInvitation(token: string): Promise<void> {
  return apiRequest(`/call-safety/invitations/${encodeURIComponent(token)}/decline`, {
    method: 'POST',
  });
}

export function grantCallSafetyConsent(
  sessionId: string,
  precision: 'PRECISE' | 'APPROXIMATE',
): Promise<{ active: boolean }> {
  return apiRequest(`/call-safety/sessions/${sessionId}/consent`, {
    method: 'POST',
    body: { precision, shareBattery: true, shareSpeed: false },
  });
}

export function revokeCallSafetyConsent(sessionId: string): Promise<void> {
  return apiRequest(`/call-safety/sessions/${sessionId}/consent`, { method: 'DELETE' });
}

export function purgeCallSafetyLocation(sessionId: string): Promise<{ deleted: number }> {
  return apiRequest(`/call-safety/sessions/${sessionId}/locations`, {
    method: 'DELETE',
  });
}

export function escalateCallSafetySos(
  sessionId: string,
  input: {
    clientRequestId: string;
    latitude: number;
    longitude: number;
    accuracyM: number;
    message?: string;
  },
): Promise<unknown> {
  return apiRequest(`/call-safety/sessions/${sessionId}/sos`, {
    method: 'POST',
    body: input,
  });
}

export function endCallSafetySession(sessionId: string): Promise<void> {
  return apiRequest(`/call-safety/sessions/${sessionId}/end`, { method: 'POST' });
}

export function sendCallSafetyLocation(
  sessionId: string,
  location: {
    latitude: number;
    longitude: number;
    accuracyM: number;
    headingDeg?: number;
    speedMps?: number;
    batteryPct?: number;
    sequence: number;
    recordedAt: string;
  },
): Promise<unknown> {
  return apiRequest(`/call-safety/sessions/${sessionId}/location`, {
    method: 'POST',
    body: location,
  });
}
