import { describe, expect, it } from 'vitest';
import {
  canActivateSafetySession,
  expireSafetySession,
  statusAfterConsentRevocation,
  type SafetySessionState,
} from './call-session.policy';

const now = new Date('2026-08-10T12:00:00.000Z');

function readySession(): SafetySessionState {
  return {
    status: 'PENDING',
    mutualRequired: true,
    expiresAt: new Date('2026-08-10T13:00:00.000Z'),
    participants: [
      {
        userId: 'a',
        consentStatus: 'ACTIVE',
        consentExpiresAt: new Date('2026-08-10T13:00:00.000Z'),
      },
      {
        userId: 'b',
        consentStatus: 'ACTIVE',
        consentExpiresAt: new Date('2026-08-10T13:00:00.000Z'),
      },
    ],
  };
}

describe('call safety session policy', () => {
  it('requires separate active consent from both participants', () => {
    const session = readySession();
    session.participants[1]!.consentStatus = 'NOT_GRANTED';
    expect(canActivateSafetySession(session, now)).toEqual({
      allowed: false,
      reason: 'Both participants must grant active consent',
    });
  });

  it('activates only a non-expired two-participant session', () => {
    expect(canActivateSafetySession(readySession(), now).allowed).toBe(true);
  });

  it('ends mutual sharing immediately when either participant revokes', () => {
    expect(statusAfterConsentRevocation(readySession(), 'a')).toBe('ENDED');
  });

  it('expires automatically without user action', () => {
    const session = readySession();
    expect(expireSafetySession(session, new Date('2026-08-10T14:00:00.000Z'))).toBe('EXPIRED');
  });
});
