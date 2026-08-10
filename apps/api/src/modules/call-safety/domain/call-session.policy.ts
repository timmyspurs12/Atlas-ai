export type SafetySessionStatus = 'PENDING' | 'ACTIVE' | 'ENDED' | 'EXPIRED' | 'CANCELLED';

export type SafetyConsentStatus = 'NOT_GRANTED' | 'ACTIVE' | 'PAUSED' | 'REVOKED' | 'EXPIRED';

export interface SafetyParticipantState {
  userId: string;
  consentStatus: SafetyConsentStatus;
  consentExpiresAt: Date;
}

export interface SafetySessionState {
  status: SafetySessionStatus;
  mutualRequired: boolean;
  expiresAt: Date;
  participants: SafetyParticipantState[];
}

export function canActivateSafetySession(
  session: SafetySessionState,
  now: Date,
): { allowed: boolean; reason: string | null } {
  if (session.status !== 'PENDING') {
    return { allowed: false, reason: 'Session is not pending' };
  }
  if (session.expiresAt <= now) {
    return { allowed: false, reason: 'Session invitation expired' };
  }
  if (session.participants.length !== 2) {
    return { allowed: false, reason: 'Exactly two verified participants are required' };
  }
  const activeConsents = session.participants.filter(
    (participant) => participant.consentStatus === 'ACTIVE' && participant.consentExpiresAt > now,
  );
  if (session.mutualRequired && activeConsents.length !== 2) {
    return { allowed: false, reason: 'Both participants must grant active consent' };
  }
  if (!session.mutualRequired && activeConsents.length < 1) {
    return { allowed: false, reason: 'At least one participant must grant consent' };
  }
  return { allowed: true, reason: null };
}

export function statusAfterConsentRevocation(
  session: SafetySessionState,
  revokingUserId: string,
): SafetySessionStatus {
  const participant = session.participants.find((candidate) => candidate.userId === revokingUserId);
  if (!participant) return session.status;
  return session.mutualRequired ? 'ENDED' : session.status;
}

export function expireSafetySession(session: SafetySessionState, now: Date): SafetySessionStatus {
  return session.expiresAt <= now && !['ENDED', 'CANCELLED'].includes(session.status)
    ? 'EXPIRED'
    : session.status;
}
