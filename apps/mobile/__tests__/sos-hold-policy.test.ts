import {
  evaluateSosHold,
  SOS_HOLD_DURATION_MS,
} from '../src/features/call-safety/services/sos-hold-policy';

describe('native SOS hold policy', () => {
  it('requires the full three-second hold', () => {
    const startedAt = 10_000;
    expect(evaluateSosHold(startedAt, startedAt + SOS_HOLD_DURATION_MS - 1).complete).toBe(false);
    expect(evaluateSosHold(startedAt, startedAt + SOS_HOLD_DURATION_MS).complete).toBe(true);
  });

  it('reports bounded visible progress and remaining seconds', () => {
    const startedAt = 10_000;
    expect(evaluateSosHold(startedAt, startedAt)).toEqual({
      progress: 0,
      remainingSeconds: 3,
      complete: false,
    });
    expect(evaluateSosHold(startedAt, startedAt + 1_500)).toEqual({
      progress: 0.5,
      remainingSeconds: 2,
      complete: false,
    });
    expect(evaluateSosHold(startedAt, startedAt + 5_000)).toEqual({
      progress: 1,
      remainingSeconds: 0,
      complete: true,
    });
  });

  it('never advances when time moves backwards', () => {
    expect(evaluateSosHold(10_000, 9_000)).toEqual({
      progress: 0,
      remainingSeconds: 3,
      complete: false,
    });
  });
});
