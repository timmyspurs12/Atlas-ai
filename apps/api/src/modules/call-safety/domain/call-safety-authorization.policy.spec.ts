import { describe, expect, it } from 'vitest';
import {
  canAcceptCallSafetyInvitation,
  canJoinCallSafetySession,
  canSendCallSafetyLocation,
} from './call-safety-authorization.policy';

const now = new Date('2026-08-12T12:00:00.000Z');

describe('call safety authorization policy', () => {
  it('rejects non-participants from session rooms', () => {
    expect(canJoinCallSafetySession(['maya', 'sarah'], 'stranger')).toBe(false);
  });

  it('binds invitation acceptance to the intended user', () => {
    expect(
      canAcceptCallSafetyInvitation({
        intendedUserId: 'sarah',
        acceptingUserId: 'stranger',
        status: 'PENDING',
        expiresAt: new Date('2026-08-12T13:00:00.000Z'),
        now,
      }),
    ).toBe(false);
  });

  it('rejects location before consent and after revocation', () => {
    const base = {
      participant: true,
      sessionStatus: 'ACTIVE',
      sessionExpiresAt: new Date('2026-08-12T13:00:00.000Z'),
      consentExpiresAt: new Date('2026-08-12T13:00:00.000Z'),
      now,
    };
    expect(canSendCallSafetyLocation({ ...base, consentStatus: 'NOT_GRANTED' })).toBe(false);
    expect(canSendCallSafetyLocation({ ...base, consentStatus: 'REVOKED' })).toBe(false);
    expect(canSendCallSafetyLocation({ ...base, consentStatus: 'ACTIVE' })).toBe(true);
  });
});
