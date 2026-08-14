import { describe, expect, it } from 'vitest';
import {
  buildCallSafetyInvitationNotificationData,
  buildExpoCallSafetyPushMessages,
  parseCallSafetyInvitationNotificationData,
} from './call-safety-invitation-notification.policy';

const invitationId = 'baf6c44c-168a-4f6a-927a-49928c48405a';
const sessionId = '9da31eb4-73dd-46aa-b044-d87bf92be0c8';
const notificationId = '667a2eae-d6ad-47e4-b2ba-71f21dc49635';

function data() {
  return buildCallSafetyInvitationNotificationData({
    invitationId,
    sessionId,
    expiresAt: new Date('2026-08-14T10:30:00.000Z'),
  });
}

describe('call safety invitation notification policy', () => {
  it('stores only authenticated references and never the raw invitation token', () => {
    const rawInvitationToken = 'private-token-that-must-never-be-persisted-or-pushed';
    const serialized = JSON.stringify(data());
    expect(serialized).not.toContain(rawInvitationToken);
    expect(serialized).not.toContain('token');
    expect(JSON.parse(serialized)).toEqual({
      kind: 'CALL_SAFETY_INVITATION',
      invitationId,
      sessionId,
      expiresAt: '2026-08-14T10:30:00.000Z',
    });
  });

  it('builds deduplicated Expo messages with no secret or location data', () => {
    const token = 'ExpoPushToken[abcdefghijklmnopqrstuv]';
    const messages = buildExpoCallSafetyPushMessages({
      tokens: [token, token, 'not-an-expo-token'],
      notificationId,
      data: data(),
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.to).toBe(token);
    expect(JSON.stringify(messages)).not.toContain('latitude');
    expect(JSON.stringify(messages)).not.toContain('longitude');
    expect(JSON.stringify(messages)).not.toContain('invitationToken');
  });

  it('rejects token-only, malformed, and attacker-controlled payloads', () => {
    expect(parseCallSafetyInvitationNotificationData({ invitationToken: 'secret' })).toBeNull();
    expect(
      parseCallSafetyInvitationNotificationData({
        kind: 'CALL_SAFETY_INVITATION',
        invitationId: 'not-a-uuid',
        sessionId,
        expiresAt: '2026-08-14T10:30:00.000Z',
      }),
    ).toBeNull();
    expect(parseCallSafetyInvitationNotificationData(data())).toEqual(data());
  });
});
