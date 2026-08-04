import { describe, expect, it } from 'vitest';
import {
  createRefreshToken,
  hashRefreshSecret,
  parseRefreshToken,
  safeHashEquals,
} from './token.util';

describe('refresh token utilities', () => {
  it('creates a parseable high-entropy token without storing its secret', () => {
    const token = createRefreshToken('50d6b456-ea47-4ff0-88d6-6ec57b98b120');
    const parsed = parseRefreshToken(token.serialized);

    expect(parsed?.sessionId).toBe('50d6b456-ea47-4ff0-88d6-6ec57b98b120');
    expect(parsed?.secret.length).toBeGreaterThanOrEqual(40);
    expect(token.serialized).not.toContain('=');
  });

  it('compares peppered hashes in constant-time-compatible buffers', () => {
    const first = hashRefreshSecret('secret-one', 'a-long-independent-pepper');
    const second = hashRefreshSecret('secret-one', 'a-long-independent-pepper');
    const other = hashRefreshSecret('secret-two', 'a-long-independent-pepper');

    expect(safeHashEquals(first, second)).toBe(true);
    expect(safeHashEquals(first, other)).toBe(false);
  });

  it('rejects malformed serialized values', () => {
    expect(parseRefreshToken('not-a-token')).toBeNull();
  });
});
