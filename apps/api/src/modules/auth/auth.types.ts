import type { UserRole } from '../../generated/prisma/client';

export interface AuthPrincipal {
  userId: string;
  sessionId: string;
  deviceId: string;
  role: UserRole;
}

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  did: string;
  role: UserRole;
  type: 'access';
  iat?: number;
  exp?: number;
}

export interface RequestMetadata {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}
