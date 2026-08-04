import { LocationShareStatus } from '../../generated/prisma/client';

export interface ShareWindow {
  status: LocationShareStatus;
  startsAt: Date;
  expiresAt: Date;
  deletedAt: Date | null;
}

export function isShareActive(share: ShareWindow, at = new Date()): boolean {
  return (
    share.status === LocationShareStatus.ACTIVE &&
    !share.deletedAt &&
    share.startsAt <= at &&
    share.expiresAt > at
  );
}

export function assertShareDuration(durationMinutes: number): void {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 10_080) {
    throw new RangeError('Location shares must last between 5 minutes and 7 days');
  }
}
