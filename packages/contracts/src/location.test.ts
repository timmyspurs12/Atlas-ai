import { describe, expect, it } from 'vitest';
import { locationUpdateSchema, startLocationShareSchema } from './location';

describe('location contracts', () => {
  it('rejects impossible coordinates', () => {
    const result = locationUpdateSchema.safeParse({
      latitude: 91,
      longitude: 3.4,
      accuracyM: 5,
      recordedAt: new Date().toISOString(),
      sequence: 1,
    });

    expect(result.success).toBe(false);
  });

  it('enforces bounded, explicit sharing', () => {
    const result = startLocationShareSchema.safeParse({
      recipientIds: ['80d8caac-0ab0-4c4f-88ed-a8d2d259b4db'],
      durationMinutes: 0,
    });

    expect(result.success).toBe(false);
  });
});
