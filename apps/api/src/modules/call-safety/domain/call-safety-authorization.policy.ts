export function canJoinCallSafetySession(
  participantUserIds: readonly string[],
  userId: string,
): boolean {
  return participantUserIds.includes(userId);
}

export function canAcceptCallSafetyInvitation(input: {
  intendedUserId: string;
  acceptingUserId: string;
  status: string;
  expiresAt: Date;
  now: Date;
}): boolean {
  return (
    input.intendedUserId === input.acceptingUserId &&
    input.status === 'PENDING' &&
    input.expiresAt > input.now
  );
}

export function canSendCallSafetyLocation(input: {
  participant: boolean;
  sessionStatus: string;
  consentStatus: string;
  sessionExpiresAt: Date;
  consentExpiresAt: Date;
  now: Date;
}): boolean {
  return (
    input.participant &&
    input.sessionStatus === 'ACTIVE' &&
    input.consentStatus === 'ACTIVE' &&
    input.sessionExpiresAt > input.now &&
    input.consentExpiresAt > input.now
  );
}
