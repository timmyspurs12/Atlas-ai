import { describe, expect, it } from 'vitest';
import { LocationShareStatus } from '../../generated/prisma/client';
import { assertShareDuration, isShareActive } from './sharing-policy';

describe('location sharing policy', () => {
  it('requires an active, non-expired, non-deleted grant', () => {
    const now = new Date('2026-08-04T12:00:00.000Z');
    expect(
      isShareActive(
        {
          status: LocationShareStatus.ACTIVE,
          startsAt: new Date('2026-08-04T11:00:00.000Z'),
          expiresAt: new Date('2026-08-04T13:00:00.000Z'),
          deletedAt: null,
        },
        now,
      ),
    ).toBe(true);
    expect(
      isShareActive(
        {
          status: LocationShareStatus.REVOKED,
          startsAt: new Date('2026-08-04T11:00:00.000Z'),
          expiresAt: new Date('2026-08-04T13:00:00.000Z'),
          deletedAt: null,
        },
        now,
      ),
    ).toBe(false);
  });

  it('bounds share duration to seven days', () => {
    expect(() => assertShareDuration(5)).not.toThrow();
    expect(() => assertShareDuration(10_081)).toThrow(RangeError);
  });
});
