import type { CallSafetySession } from '../src/features/call-safety/services/call-safety-api';
import {
  buildSafeCallSafetyLocationPayload,
  evaluateCallSafetyTracking,
} from '../src/features/call-safety/services/call-safety-location-policy';

const NOW = Date.parse('2026-08-13T12:00:00.000Z');
const USER_ID = '69f4f43e-7e4d-4f65-a1bf-de43dc0f8f6a';

function session(status: CallSafetySession['status']): CallSafetySession {
  return {
    id: 'ab51bd4a-7c3a-43e7-a6d0-0e4150a00ac4',
    initiatorId: USER_ID,
    mode: 'PSTN_COMPANION',
    status,
    mutualRequired: true,
    startsAt: status === 'ACTIVE' ? '2026-08-13T11:59:00.000Z' : null,
    expiresAt: '2026-08-13T12:30:00.000Z',
    endedAt: null,
    participants: [
      {
        id: 'a203f840-b8e8-48b8-849d-4e3d0d515e51',
        userId: USER_ID,
        role: 'INITIATOR',
        joinedAt: '2026-08-13T11:55:00.000Z',
        user: {
          id: USER_ID,
          profile: { displayName: 'Maya Okafor', avatarUrl: null },
        },
        consent: {
          status: 'ACTIVE',
          precision: 'PRECISE',
          expiresAt: '2026-08-13T12:30:00.000Z',
        },
      },
    ],
  };
}

describe('Stay With Me location policy', () => {
  it('arms without collecting location while mutual consent is pending', () => {
    expect(evaluateCallSafetyTracking(session('PENDING'), USER_ID, NOW)).toEqual({
      decision: 'ARMED',
      reason: 'WAITING_FOR_MUTUAL_CONSENT',
    });
  });

  it('tracks only when the session and personal consent are active', () => {
    expect(evaluateCallSafetyTracking(session('ACTIVE'), USER_ID, NOW)).toEqual({
      decision: 'TRACK',
      reason: 'ACTIVE',
    });
  });

  it('stops immediately when consent is no longer active', () => {
    const revoked = session('ACTIVE');
    const participant = revoked.participants[0];
    if (participant?.consent) participant.consent.status = 'REVOKED';
    expect(evaluateCallSafetyTracking(revoked, USER_ID, NOW)).toEqual({
      decision: 'STOP',
      reason: 'CONSENT_INACTIVE',
    });
  });

  it('stops locally at the configured expiry even before a server response', () => {
    const expired = session('ACTIVE');
    expired.expiresAt = '2026-08-13T11:59:59.000Z';
    expect(evaluateCallSafetyTracking(expired, USER_ID, NOW)).toEqual({
      decision: 'STOP',
      reason: 'SESSION_EXPIRED',
    });
  });

  it('normalizes GPS values to the API safety bounds without persisting coordinates', () => {
    expect(
      buildSafeCallSafetyLocationPayload(
        {
          latitude: 6.5243793123,
          longitude: 3.3792057123,
          accuracy: 12.3456,
          heading: -1,
          speed: -1,
        },
        NOW,
        42,
      ),
    ).toEqual({
      latitude: 6.5243793,
      longitude: 3.3792057,
      accuracyM: 12.35,
      sequence: 42,
      recordedAt: '2026-08-13T12:00:00.000Z',
    });
  });
});
