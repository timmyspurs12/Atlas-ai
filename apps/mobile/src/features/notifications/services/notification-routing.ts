export const CALL_SAFETY_NOTIFICATION_KIND = 'CALL_SAFETY_INVITATION';

export interface CallSafetyInvitationRoute {
  invitationId: string;
  sessionId: string;
  expiresAt: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCallSafetyInvitationRoute(value: unknown): CallSafetyInvitationRoute | null {
  if (!isRecord(value)) return null;
  if (
    value.kind !== CALL_SAFETY_NOTIFICATION_KIND ||
    typeof value.invitationId !== 'string' ||
    !uuidPattern.test(value.invitationId) ||
    typeof value.sessionId !== 'string' ||
    !uuidPattern.test(value.sessionId) ||
    typeof value.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(value.expiresAt))
  ) {
    return null;
  }
  return {
    invitationId: value.invitationId,
    sessionId: value.sessionId,
    expiresAt: value.expiresAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
