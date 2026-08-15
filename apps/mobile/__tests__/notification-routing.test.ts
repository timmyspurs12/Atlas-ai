import { parseCallSafetyInvitationRoute } from '../src/features/notifications/services/notification-routing';

const safePayload = {
  kind: 'CALL_SAFETY_INVITATION',
  invitationId: 'baf6c44c-168a-4f6a-927a-49928c48405a',
  sessionId: '9da31eb4-73dd-46aa-b044-d87bf92be0c8',
  expiresAt: '2026-08-14T10:30:00.000Z',
};

describe('notification routing', () => {
  it('routes authenticated invitation references without a raw token', () => {
    expect(parseCallSafetyInvitationRoute(safePayload)).toEqual({
      invitationId: safePayload.invitationId,
      sessionId: safePayload.sessionId,
      expiresAt: safePayload.expiresAt,
    });
    expect(JSON.stringify(safePayload)).not.toContain('invitationToken');
  });

  it('rejects token links and malformed notification payloads', () => {
    expect(parseCallSafetyInvitationRoute({ invitationToken: 'private-secret' })).toBeNull();
    expect(
      parseCallSafetyInvitationRoute({ ...safePayload, invitationId: 'not-a-uuid' }),
    ).toBeNull();
    expect(parseCallSafetyInvitationRoute({ ...safePayload, kind: 'SOS' })).toBeNull();
  });
});
