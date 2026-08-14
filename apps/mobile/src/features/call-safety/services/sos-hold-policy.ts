export const SOS_HOLD_DURATION_MS = 3_000;

export interface SosHoldState {
  progress: number;
  remainingSeconds: number;
  complete: boolean;
}

export function evaluateSosHold(
  startedAtMs: number,
  nowMs: number,
  durationMs = SOS_HOLD_DURATION_MS,
): SosHoldState {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs) || durationMs <= 0) {
    return {
      progress: 0,
      remainingSeconds: Math.ceil(SOS_HOLD_DURATION_MS / 1_000),
      complete: false,
    };
  }
  const elapsed = Math.max(0, nowMs - startedAtMs);
  const progress = Math.min(1, elapsed / durationMs);
  return {
    progress,
    remainingSeconds: Math.max(0, Math.ceil((durationMs - elapsed) / 1_000)),
    complete: elapsed >= durationMs,
  };
}
