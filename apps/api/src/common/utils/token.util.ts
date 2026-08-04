import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export interface OpaqueRefreshToken {
  sessionId: string;
  secret: string;
  serialized: string;
}

export function createRefreshToken(sessionId: string): OpaqueRefreshToken {
  const secret = randomBytes(48).toString('base64url');
  return { sessionId, secret, serialized: `${sessionId}.${secret}` };
}

export function parseRefreshToken(serialized: string): Omit<OpaqueRefreshToken, 'serialized'> | null {
  const separator = serialized.indexOf('.');
  if (separator < 1) return null;
  const sessionId = serialized.slice(0, separator);
  const secret = serialized.slice(separator + 1);
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(sessionId) || secret.length < 40) return null;
  return { sessionId, secret };
}

export function hashRefreshSecret(secret: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}:${secret}`, 'utf8').digest('hex');
}

export function safeHashEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
