export const CALL_SAFETY_NOTIFICATION_KIND = 'CALL_SAFETY_INVITATION';

export interface CallSafetyInvitationNotificationData {
  kind: typeof CALL_SAFETY_NOTIFICATION_KIND;
  invitationId: string;
  sessionId: string;
  expiresAt: string;
}

export interface ExpoCallSafetyPushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  priority: 'high';
  channelId: 'call-safety';
  data: CallSafetyInvitationNotificationData & { notificationId: string };
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const expoPushTokenPattern = /^(?:ExponentPushToken|ExpoPushToken)\[[^\]\s]{8,256}\]$/;

export function buildCallSafetyInvitationNotificationData(input: {
  invitationId: string;
  sessionId: string;
  expiresAt: Date;
}): CallSafetyInvitationNotificationData {
  if (!uuidPattern.test(input.invitationId) || !uuidPattern.test(input.sessionId)) {
    throw new Error('Call safety notification identifiers must be UUIDs');
  }
  return {
    kind: CALL_SAFETY_NOTIFICATION_KIND,
    invitationId: input.invitationId,
    sessionId: input.sessionId,
    expiresAt: input.expiresAt.toISOString(),
  };
}

export function parseCallSafetyInvitationNotificationData(
  value: unknown,
): CallSafetyInvitationNotificationData | null {
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
    kind: CALL_SAFETY_NOTIFICATION_KIND,
    invitationId: value.invitationId,
    sessionId: value.sessionId,
    expiresAt: value.expiresAt,
  };
}

export function isExpoPushToken(value: string): boolean {
  return expoPushTokenPattern.test(value);
}

export function buildExpoCallSafetyPushMessages(input: {
  tokens: string[];
  notificationId: string;
  data: CallSafetyInvitationNotificationData;
}): ExpoCallSafetyPushMessage[] {
  if (!uuidPattern.test(input.notificationId)) {
    throw new Error('Notification identifier must be a UUID');
  }
  return [...new Set(input.tokens)].filter(isExpoPushToken).map((token) => ({
    to: token,
    title: 'Stay With Me invitation',
    body: 'Open Atlas AI to privately review a time-limited safety request.',
    sound: 'default',
    priority: 'high',
    channelId: 'call-safety',
    data: { ...input.data, notificationId: input.notificationId },
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
